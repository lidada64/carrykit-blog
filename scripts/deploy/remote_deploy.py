#!/usr/bin/env python3
"""Linux-side, fail-closed deployment of a reviewed Carrykit image pair.

Only ``audit`` is read-only. Other commands require root and a reviewed manifest.
No shell is used, no Docker output containing credentials is printed, and no
volume/database removal is implemented. The public Agent remains disabled.
"""

import argparse
import hashlib
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request


PROJECT = "carrykit-blog"
ROOT = Path("/opt/carrykit-blog/releases")
VOLUMES = {"db-data": "carrykit-blog_db-data", "caddy-data": "carrykit-blog_caddy-data",
           "caddy-config": "carrykit-blog_caddy-config"}
IDENTIFIER = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
IMAGE = re.compile(r"sha256:[0-9a-f]{64}\Z")
REVISION = re.compile(r"[0-9a-f]{40}\Z")
UID_GID_PROGRAM = "console.log(JSON.stringify([process.getuid(),process.getgid()]))"
DATA_SIZE_PROGRAM = r'''
const fs=require('fs'),path=require('path');
function stat(p,required=false){try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT'&&!required)return null;throw e;}}
function size(p,required=false){
 const s=stat(p,required);if(s===null)return 0;
 if(s.isSymbolicLink()||!s.isFile())throw Error('Unsupported source entry');
 if(!Number.isSafeInteger(s.size)||s.size<0)throw Error('Unsupported file size');return s.size;
}
const bytes={database:size('/data/blog.db',true),wal:size('/data/blog.db-wal'),uploads:0};
let files=0,entries=0;
function walk(p){const s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('Symlink rejected');entries++;
 if(s.isDirectory()){for(const entry of fs.readdirSync(p))walk(path.join(p,entry));}
 else if(s.isFile()){bytes.uploads+=size(p);files++;}
 else throw Error('Unsupported uploads entry');}
if(stat('/data/uploads')!==null)walk('/data/uploads');
if(!Number.isSafeInteger(bytes.uploads)||bytes.database<=0)throw Error('Invalid size');
console.log(JSON.stringify({dataBytes:bytes,dataFiles:{uploads:files,entries}}));
'''


class DeployError(RuntimeError):
    """Messages must contain operation names only, never external stderr/env."""


def run(args, *, stdin=None, timeout=120):
    try:
        result = subprocess.run(args, input=stdin, capture_output=True, text=True,
                                timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise DeployError("Command unavailable or timed out; inspect protected server logs") from None
    if result.returncode:
        raise DeployError("Command failed; credentials/output intentionally withheld")
    return result.stdout


def docker(*args, **kwargs):
    return run(["docker", *args], **kwargs)


def parsed(text):
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        raise DeployError("Invalid structured command response") from None


def container(service, *, required=True):
    ids = docker("ps", "-a", "--filter", f"label=com.docker.compose.project={PROJECT}",
                 "--filter", f"label=com.docker.compose.service={service}", "--format", "{{.ID}}").split()
    if not ids and not required:
        return None
    if len(ids) != 1:
        raise DeployError("Expected exactly one container per known project/service")
    item = parsed(docker("inspect", ids[0]))[0]
    labels = item.get("Config", {}).get("Labels", {})
    if (labels.get("com.docker.compose.project") != PROJECT
            or labels.get("com.docker.compose.service") != service):
        raise DeployError("Container identity mismatch")
    return item


def environment(item):
    result = {}
    for pair in item.get("Config", {}).get("Env", []):
        key, separator, value = pair.partition("=")
        if separator:
            result[key] = value
    return result


def require_mount(item, target, volume):
    matches = [v for v in item.get("Mounts", []) if v.get("Destination") == target]
    if len(matches) != 1 or matches[0].get("Type") != "volume" or matches[0].get("Name") != volume:
        raise DeployError("Existing named-volume mapping mismatch")


def inventory():
    app, caddy = container("app"), container("caddy")
    require_mount(app, "/data", VOLUMES["db-data"])
    require_mount(caddy, "/data", VOLUMES["caddy-data"])
    require_mount(caddy, "/config", VOLUMES["caddy-config"])
    for volume in VOLUMES.values():
        info = parsed(docker("volume", "inspect", volume))[0]
        if info.get("Name") != volume or info.get("Driver") != "local" or info.get("Options"):
            raise DeployError("Expected existing local volume without driver options")
    labels = app.get("Config", {}).get("Labels", {})
    config_paths = labels.get("com.docker.compose.project.config_files", "").split(",")
    if not config_paths or any(not Path(p).is_absolute() or not Path(p).is_file() for p in config_paths):
        raise DeployError("Cannot resolve original Compose configuration files")
    return app, caddy, config_paths


def data_sizes(app):
    result = parsed(docker("exec", app["Id"], "node", "-e", DATA_SIZE_PROGRAM, timeout=180))
    for group, keys in [("dataBytes", ("database", "wal", "uploads")), ("dataFiles", ("uploads", "entries"))]:
        values = result.get(group)
        if not isinstance(values, dict) or set(values) != set(keys) or any(type(values[k]) is not int or values[k] < 0 for k in keys):
            raise DeployError("Cannot determine complete source data size")
    if result["dataBytes"]["database"] <= 0:
        raise DeployError("Existing source database must be nonempty")
    return result


def docker_storage():
    info = parsed(docker("info", "--format", "{{json .}}"))
    directory = Path(str(info.get("DockerRootDir", "")))
    if not directory.is_absolute() or not directory.is_dir():
        raise DeployError("Docker storage filesystem cannot be verified")
    return info, directory, shutil.disk_usage(directory)


def audit():
    app, caddy, paths = inventory()
    info, docker_root, docker_space = docker_storage()
    sizes = data_sizes(app)
    memory = {}
    if Path("/proc/meminfo").exists():
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, _, rest = line.partition(":")
            if key in {"MemTotal", "MemAvailable", "SwapTotal", "SwapFree"}:
                memory[key + "KiB"] = int(rest.split()[0])
    space = shutil.disk_usage("/opt")
    return {"project": PROJECT, "composeFiles": paths,
            "services": [{"service": service, "imageId": obj["Image"],
                          "state": obj.get("State", {}).get("Status"),
                          "mounts": [{k: m.get(k) for k in ("Type", "Name", "Destination", "RW")}
                                     for m in obj.get("Mounts", [])]}
                         for service, obj in [("app", app), ("caddy", caddy)]],
            "os": info.get("OSType"), "architecture": info.get("Architecture"),
            "dockerVersion": info.get("ServerVersion"), "memory": memory,
            "diskFreeBytes": space.free, "diskTotalBytes": space.total,
            "dockerDiskFreeBytes": docker_space.free, "dockerDiskTotalBytes": docker_space.total,
            **sizes,
            "containerResources": [parsed(line) for line in docker("stats", "--no-stream", "--format", "{{json .}}").splitlines() if line.strip()]}


def secure_json(path, data):
    path = Path(path)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


def load_secure(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
        raise DeployError("Protected state must be a regular owner-only file")
    return parsed(path.read_text(encoding="utf-8"))


def escape_compose(value):
    """Compose interpolates YAML and JSON strings; escape literal dollars once."""
    if isinstance(value, str):
        return value.replace("$", "$$")
    if isinstance(value, list):
        return [escape_compose(item) for item in value]
    if isinstance(value, dict):
        return {key: escape_compose(item) for key, item in value.items()}
    return value


def manifest_at(path):
    manifest = parsed(Path(path).read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise DeployError("Manifest object required")
    try:
        expected_address = ipaddress.ip_address(manifest.get("expectedServerAddress", ""))
        if expected_address.is_unspecified or expected_address.is_multicast or expected_address.is_loopback:
            raise ValueError()
    except (ValueError, TypeError):
        raise DeployError("Expected server IP address required") from None
    if (manifest.get("project") != PROJECT or manifest.get("domain") != "carrykit.top"
            or not IDENTIFIER.fullmatch(str(manifest.get("releaseId", "")))
            or not all(REVISION.fullmatch(str(manifest.get(k, "")))
                       for k in ("blogRevision", "agentRevision"))
            or not all(IMAGE.fullmatch(str(manifest.get(k, "")))
                       for k in ("blogImage", "agentImage"))
            or manifest.get("reviewed") is not True
            or manifest.get("migrationRollbackCompatible") is not True
            or manifest.get("validated") != {"blogLint": True, "blogBuild": True, "agentOffline": True}):
        raise DeployError("Reviewed, validated image/revision/compatibility manifest required")
    return manifest


def release_path(identity):
    if not IDENTIFIER.fullmatch(identity):
        raise DeployError("Invalid release identifier")
    path = ROOT / identity
    if ROOT.is_symlink() or path.is_symlink() or path.resolve() != path:
        raise DeployError("Release path cannot contain symlink aliases")
    return path


def image_verified(identity, *, agent=False):
    obj = parsed(docker("image", "inspect", identity))[0]
    if obj.get("Id") != identity or obj.get("Os") != "linux":
        raise DeployError("Imported image identity or OS mismatch")
    user = obj.get("Config", {}).get("User", "")
    if user in {"", "0", "root", "0:0", "root:root"}:
        raise DeployError("Non-root runtime image required")
    info = parsed(docker("info", "--format", "{{json .}}"))
    arch = {"x86_64": "amd64", "aarch64": "arm64"}.get(info.get("Architecture"), info.get("Architecture"))
    if obj.get("Architecture") != arch:
        raise DeployError("Image architecture differs from Docker server")
    if agent and obj.get("Config", {}).get("WorkingDir") != "/app":
        raise DeployError("Agent image layout mismatch")


def check_app_ownership(app, target_image):
    old = parsed(docker("exec", app["Id"], "node", "-e", UID_GID_PROGRAM))
    new = parsed(docker("run", "--rm", "--network", "none", "--read-only", "--entrypoint", "node",
                        target_image, "-e", UID_GID_PROGRAM))
    if any(not isinstance(value, list) or len(value) != 2 or any(type(i) is not int or i <= 0 for i in value)
           for value in (old, new)) or old != new:
        raise DeployError("Existing and target Blog UID/GID differ; review volume ownership before deployment")
    return old


def check_backup_space(app):
    sizes = data_sizes(app)
    values = sizes["dataBytes"]
    # Retain DB snapshot, tar + extracted uploads, and the isolated restore
    # volume. WAL is counted in both possible database copies conservatively.
    database = values["database"] + values["wal"]
    overhead = sizes["dataFiles"]["entries"] * 2048 + 10240 + 64 * 1024 * 1024
    upload_required = database + 2 * values["uploads"] + overhead
    docker_required = database + values["uploads"] + overhead
    _, docker_root, docker_space = docker_storage()
    upload_space = shutil.disk_usage("/opt")
    same_filesystem = os.stat("/opt").st_dev == os.stat(docker_root).st_dev
    if same_filesystem:
        enough = upload_space.free >= upload_required + docker_required and docker_space.free >= upload_required + docker_required
    else:
        enough = upload_space.free >= upload_required and docker_space.free >= docker_required
    if not enough:
        raise DeployError("Insufficient backup/restore filesystem headroom; source app remains running")
    return {**sizes, "uploadFilesystemRequiredBytes": upload_required,
            "dockerFilesystemRequiredBytes": docker_required, "sameFilesystem": same_filesystem}


def source_compose(paths):
    args = ["compose", "--project-name", PROJECT]
    for path in paths:
        args += ["-f", path]
    return parsed(docker(*args, "config", "--format", "json"))


def generated_compose(config, app, manifest):
    config = json.loads(json.dumps(config))
    if set(config.get("services", {})) - {"app", "caddy", "agent"}:
        raise DeployError("Unexpected services in Blog project configuration")
    if "app" not in config.get("services", {}) or "caddy" not in config["services"]:
        raise DeployError("Original Blog services missing")
    service = config["services"]["app"]
    data_mounts = [v for v in service.get("volumes", []) if isinstance(v, dict) and v.get("target") == "/data"]
    if len(data_mounts) != 1 or data_mounts[0].get("type") != "volume" or data_mounts[0].get("source") != "db-data":
        raise DeployError("Original Compose does not map the expected Blog data role")
    if service.get("ports") or service.get("privileged"):
        raise DeployError("Blog app must remain private and unprivileged")
    service.pop("build", None)
    service.pop("pull_policy", None)
    service["image"] = manifest["blogImage"]
    service["environment"] = environment(app)
    if (service["environment"].get("DATABASE_URL") != "file:/data/blog.db"
            or len(service["environment"].get("SESSION_SECRET", "").encode()) < 32):
        raise DeployError("Existing database location/session configuration needs manual review")
    service["environment"].update({"SITE_URL": "https://carrykit.top", "ASSISTANT_ENABLED": "false",
                                  "ASSISTANT_PREVIEW_ENABLED": "false", "AGENT_BASE_URL": "http://agent:8000"})
    for key in ("AGENT_REQUEST_SECRET", "AGENT_CONTENT_SECRET", "VISITOR_SESSION_SECRET"):
        service["environment"][key] = secrets.token_urlsafe(48)
    networks = service.get("networks") or {"default": None}
    if not isinstance(networks, dict):
        networks = {name: None for name in networks}
    service["networks"] = {**networks, "agent-link": None}
    config.setdefault("networks", {})["agent-link"] = {"name": PROJECT + "_agent-link", "driver": "bridge"}
    config["services"]["agent"] = {
        "image": manifest["agentImage"], "restart": "unless-stopped", "init": True,
        "read_only": True, "cap_drop": ["ALL"], "security_opt": ["no-new-privileges:true"],
        "tmpfs": ["/tmp:size=64m,mode=1777"], "networks": {"agent-link": None},
        "environment": {"AGENT_WEB_ENABLED": "false", "AGENT_DATA_DIR": "/data/runtime",
                        "AGENT_INDEX_DIR": "/data/index", "AGENT_CONTENT_BASE_URL": "http://app:3000",
                        "AGENT_REQUEST_SECRET": service["environment"]["AGENT_REQUEST_SECRET"],
                        "AGENT_CONTENT_SECRET": service["environment"]["AGENT_CONTENT_SECRET"]},
        "volumes": [{"type": "volume", "source": "agent-runtime", "target": "/data/runtime"},
                    {"type": "volume", "source": "agent-index", "target": "/data/index"}],
        "expose": ["8000"], "mem_limit": "384m", "cpus": 0.75,
    }
    volumes = config.setdefault("volumes", {})
    for role, name in VOLUMES.items():
        volumes[role] = {"name": name, "external": True}
    for role in ("agent-runtime", "agent-index"):
        volumes[role] = {"name": PROJECT + "_" + role, "driver": "local"}
    config["name"] = PROJECT
    return config


def check_owned_resources():
    for kind, name in [("network", PROJECT + "_agent-link"), ("volume", PROJECT + "_agent-runtime"),
                       ("volume", PROJECT + "_agent-index")]:
        found = docker(kind, "ls", "--format", "{{.Name}}", "--filter", "name=" + name).splitlines()
        if name not in found:
            continue
        obj = parsed(docker(kind, "inspect", name))[0]
        if obj.get("Labels", {}).get("com.docker.compose.project") != PROJECT:
            raise DeployError("Agent resource name collides with an unrelated resource")


def compose(folder, filename, *args, timeout=180):
    return docker("compose", "--project-name", PROJECT, "-f", str(folder / filename), *args, timeout=timeout)


def prepare(manifest_path):
    manifest = manifest_at(manifest_path)
    folder = release_path(manifest["releaseId"])
    if folder.exists():
        raise DeployError("Release already exists; use status/apply or a new release ID")
    app, caddy, paths = inventory()
    if not app.get("State", {}).get("Running") or not caddy.get("State", {}).get("Running"):
        raise DeployError("Existing Blog must be running before preparation")
    if container("agent", required=False):
        raise DeployError("Existing Agent deployment requires reviewed runtime backup; initial-install only")
    image_verified(manifest["blogImage"])
    image_verified(manifest["agentImage"], agent=True)
    ownership = check_app_ownership(app, manifest["blogImage"])
    backup_capacity = check_backup_space(app)
    check_owned_resources()
    original = source_compose(paths)
    target = generated_compose(original, app, manifest)
    # Freeze rollback at the image actually running, not a mutable tag in source.
    original["services"]["app"].pop("build", None)
    original["services"]["app"]["image"] = app["Image"]
    original["services"]["app"]["environment"] = environment(app)
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    folder.mkdir(mode=0o700)
    secure_json(folder / "manifest.json", manifest)
    secure_json(folder / "rollback.compose.json", escape_compose(original))
    secure_json(folder / "release.compose.json", escape_compose(target))
    secure_json(folder / "state.json", {"releaseId": manifest["releaseId"], "status": "prepared",
                "oldAppImage": app["Image"], "caddyId": caddy["Id"], "originalComposeFiles": paths,
                "preparedAt": int(time.time()), "appUidGid": ownership, "backupCapacity": backup_capacity})
    compose(folder, "release.compose.json", "config", "--quiet")
    return {"releaseId": manifest["releaseId"], "status": "prepared", "publicAssistantEnabled": False}


FINGERPRINT_PROGRAM = r'''
import hashlib,json,pathlib
source=pathlib.Path('/source')
def filehash(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
paths=[source/'blog.db']
wal=source/'blog.db-wal'
if wal.is_symlink():raise RuntimeError('Source WAL symlink rejected')
if wal.exists() and wal.stat().st_size:paths.append(wal)
uploads=source/'uploads'
if uploads.is_symlink():raise RuntimeError('Source uploads symlink rejected')
if uploads.exists():paths.extend([uploads,*uploads.rglob('*')])
entries=[]
for p in sorted(paths):
 if p.is_symlink() or not (p.is_file() or p.is_dir()):raise RuntimeError('Unsupported source entry')
 entries.append([str(p.relative_to(source)),filehash(p) if p.is_file() else 'directory'])
fingerprint=hashlib.sha256(json.dumps(entries,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
'''


BACKUP_PROGRAM = FINGERPRINT_PROGRAM + r'''
import contextlib,hashlib,json,os,pathlib,sqlite3,tarfile
source=pathlib.Path('/source'); target=pathlib.Path('/backup')
database=source/'blog.db'
if not database.is_file() or database.is_symlink(): raise RuntimeError('Missing regular source DB')
with contextlib.closing(sqlite3.connect(database.as_uri()+'?mode=ro',uri=True)) as src:
 with contextlib.closing(sqlite3.connect(target/'blog.db')) as dst: src.backup(dst)
uploads=source/'uploads'
if uploads.exists():
 for p in [uploads,*uploads.rglob('*')]:
  if p.is_symlink() or not (p.is_dir() or p.is_file()): raise RuntimeError('Unsupported uploads entry')
with tarfile.open(target/'uploads.tar','w') as archive:
 if uploads.exists(): archive.add(uploads,arcname='uploads')
restore=target/'restore-check';restore.mkdir()
with tarfile.open(target/'uploads.tar') as archive: archive.extractall(restore,filter='data')
def hashfile(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for part in iter(lambda:f.read(1024*1024),b''):h.update(part)
 return h.hexdigest()
files=0
if uploads.exists():
 for p in uploads.rglob('*'):
  if p.is_file():
   if hashfile(p)!=hashfile(restore/'uploads'/p.relative_to(uploads)):raise RuntimeError('Upload restore hash mismatch')
   files+=1
with contextlib.closing(sqlite3.connect((target/'blog.db').as_uri()+'?mode=ro',uri=True)) as db:
 if db.execute('PRAGMA integrity_check').fetchall()!=[('ok',)]: raise RuntimeError('DB integrity failed')
 tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
 counts={name:db.execute('SELECT count(*) FROM "'+name+'"').fetchone()[0] for name in ['Post','Project','User','_prisma_migrations'] if name in tables}
report={'databaseSha256':hashfile(target/'blog.db'),'uploadsSha256':hashfile(target/'uploads.tar'),'sourceFingerprint':fingerprint,'restoredUploads':files,'tableCounts':counts,'integrity':'ok','restoredReadVerified':True}
(target/'report.json').write_text(json.dumps(report,indent=2))
os.chmod(target/'blog.db',0o600);os.chmod(target/'uploads.tar',0o600);os.chmod(target/'report.json',0o600)
'''


RESTORE_PROGRAM = r'''
import os,pathlib,shutil,sys,tarfile
source=pathlib.Path('/backup');target=pathlib.Path('/restore')
if list(target.iterdir()):raise RuntimeError('Restore volume must be empty')
shutil.copyfile(source/'blog.db',target/'blog.db')
with tarfile.open(source/'uploads.tar') as archive:archive.extractall(target,filter='data')
uid,gid=map(int,sys.argv[1:3])
for p in [target,*target.rglob('*')]:
 if p.is_symlink():raise RuntimeError('Restore symlink rejected')
 os.chown(p,uid,gid)
'''


RESTORE_CHECK = r'''
const db=require('better-sqlite3')('/data/blog.db',{readonly:true,fileMustExist:true});
if(db.pragma('integrity_check',{simple:true})!=='ok')process.exit(2);
const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(v=>v.name));
const result={};
for(const name of ['Post','Project','User'])if(tables.has(name))result[name]=db.prepare('SELECT count(*) AS n FROM "'+name+'"').get().n;
console.log(JSON.stringify(result));db.close();
'''


def restore_exercise(folder, manifest, report):
    """Use a new volume and the target Blog image to exercise actual migrations."""
    name = PROJECT + "_restore-" + manifest["releaseId"]
    existing = docker("volume", "ls", "--format", "{{.Name}}", "--filter", "name=" + name).splitlines()
    if name in existing:
        raise DeployError("Restore volume already exists; use new release, never overwrite")
    docker("volume", "create", "--label", "carrykit.role=restore-test", "--label",
           "carrykit.release=" + manifest["releaseId"], name)
    ids = parsed(docker("run", "--rm", "--network", "none", "--read-only", "--entrypoint", "node",
                        manifest["blogImage"], "-e", "console.log(JSON.stringify([process.getuid(),process.getgid()]))"))
    if not isinstance(ids, list) or len(ids) != 2 or any(type(i) is not int or i <= 0 for i in ids):
        raise DeployError("Cannot determine nonroot target volume ownership")
    docker("run", "--rm", "--network", "none", "--read-only", "--user", "0:0", "--cap-drop", "ALL",
           "--cap-add", "CHOWN", "--cap-add", "DAC_OVERRIDE", "--security-opt", "no-new-privileges:true",
           "--mount", "type=bind,src=" + str(folder / "backup") + ",dst=/backup,readonly",
           "--mount", "type=volume,src=" + name + ",dst=/restore", "--entrypoint", "python",
           manifest["agentImage"], "-c", RESTORE_PROGRAM, str(ids[0]), str(ids[1]), timeout=600)
    common = ["run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp:size=64m",
              "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
              "--mount", "type=volume,src=" + name + ",dst=/data", "--env", "DATABASE_URL=file:/data/blog.db",
              "--env", "ASSISTANT_ENABLED=false", "--env", "AGENT_WEB_ENABLED=false"]
    docker(*common, "--entrypoint", "node", manifest["blogImage"],
           "node_modules/prisma/build/index.js", "migrate", "deploy", timeout=300)
    counts = parsed(docker(*common, "--entrypoint", "node", manifest["blogImage"], "-e", RESTORE_CHECK))
    if counts != {k: v for k, v in report["tableCounts"].items() if k != "_prisma_migrations"}:
        raise DeployError("Business table counts changed in isolated migration exercise")
    return {"volume": name, "migrationsApplied": True, "integrity": "ok", "businessCountsPreserved": True,
            "network": "none", "volumeRetained": True}


def read_state(identity):
    folder = release_path(identity)
    state = load_secure(folder / "state.json")
    manifest = manifest_at(folder / "manifest.json")
    if state.get("releaseId") != identity or manifest["releaseId"] != identity:
        raise DeployError("Release state mismatch")
    return folder, state, manifest


def update_state(folder, state, **changes):
    state.update(changes)
    temporary = folder / ("state-" + secrets.token_hex(8) + ".json")
    secure_json(temporary, state)
    os.replace(temporary, folder / "state.json")


def backup(identity):
    folder, state, manifest = read_state(identity)
    if state["status"] != "prepared":
        raise DeployError("Backup requires prepared release")
    app, caddy, _ = inventory()
    if app["Image"] != state["oldAppImage"] or caddy["Id"] != state["caddyId"]:
        raise DeployError("Production changed since prepare")
    # Re-measure while the old app is still serving, before starting maintenance.
    check_app_ownership(app, manifest["blogImage"])
    capacity = check_backup_space(app)
    destination = folder / "backup"
    destination.mkdir(mode=0o700)
    # Short maintenance window gives DB/uploads the same quiescent boundary.
    try:
        docker("stop", "--time", "30", app["Id"])
        docker("run", "--rm", "--network", "none", "--read-only", "--user", "0:0",
               "--cap-drop", "ALL", "--cap-add", "DAC_READ_SEARCH", "--security-opt", "no-new-privileges:true",
               "--mount", "type=volume,src=" + VOLUMES["db-data"] + ",dst=/source,readonly",
               "--mount", "type=bind,src=" + str(destination) + ",dst=/backup",
               "--entrypoint", "python", manifest["agentImage"], "-c", BACKUP_PROGRAM, timeout=600)
    finally:
        docker("start", app["Id"])
    report = load_secure(destination / "report.json")
    if report.get("integrity") != "ok" or report.get("restoredReadVerified") is not True:
        raise DeployError("Backup integrity/restore validation failed")
    restore = restore_exercise(folder, manifest, report)
    secure_json(folder / "restore-report.json", restore)
    # An off-host copy is an external, explicit gate; never infer it from files existing locally.
    update_state(folder, state, status="backup-verified", backupAt=int(time.time()), backupCapacity=capacity)
    return {"releaseId": identity, "status": "backup-verified", "offHostCopyRequired": True,
            "isolatedTargetImageRestore": restore}


def wait_http(app_id, path, expected, timeout=100):
    script = ("fetch('http://127.0.0.1:3000' + process.argv[1], {redirect:'manual'})"
              ".then(r=>process.exit(r.status===Number(process.argv[2])?0:1)).catch(()=>process.exit(1))")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            docker("exec", app_id, "node", "-e", script, path, str(expected), timeout=10)
            return
        except DeployError:
            time.sleep(2)
    raise DeployError("Local Blog HTTP health check failed")


class PinnedServerHTTPSConnection(http.client.HTTPSConnection):
    """Connect to the audited IP while retaining domain SNI/certificate checks."""

    def __init__(self, address, *, timeout=25):
        self.server_address = str(ipaddress.ip_address(address))
        self.tls_context = ssl.create_default_context()
        super().__init__("carrykit.top", timeout=timeout, context=self.tls_context)

    def connect(self):
        raw = socket.create_connection((self.server_address, 443), self.timeout)
        try:
            self.sock = self.tls_context.wrap_socket(raw, server_hostname="carrykit.top")
        except BaseException:
            raw.close()
            raise


def validate_https(expected_server_address):
    checks = []
    for path, expected in [("/blog", 200), ("/assistant", 404)]:
        connection = PinnedServerHTTPSConnection(expected_server_address)
        try:
            connection.request("GET", path, headers={"Host": "carrykit.top", "Connection": "close"})
            response = connection.getresponse()
            status = response.status
            response.read(1024)
        except (OSError, http.client.HTTPException):
            raise DeployError("Pinned-server HTTPS validation failed") from None
        finally:
            connection.close()
        if status != expected:
            raise DeployError("Unexpected pinned-server HTTPS status")
        checks.append({"transport": "audited-server-ip", "path": path, "status": status,
                       "certificateHostname": "carrykit.top", "certificateVerified": True})
    for path, expected in [("/blog", 200), ("/assistant", 404)]:
        try:
            with urllib.request.urlopen("https://carrykit.top" + path, timeout=25) as response:
                status = response.status
                response.read(1024)
        except urllib.error.HTTPError as error:
            status = error.code
        except (OSError, urllib.error.URLError):
            raise DeployError("Public HTTPS validation failed") from None
        if status != expected:
            raise DeployError("Unexpected public HTTPS status")
        checks.append({"transport": "public-domain", "path": path, "status": status,
                       "certificateHostname": "carrykit.top", "certificateVerified": True})
    return checks


def rollback(identity):
    folder, state, _ = read_state(identity)
    current_caddy = container("caddy")
    if current_caddy["Id"] != state["caddyId"]:
        raise DeployError("Caddy changed outside this release; manual reconciliation required")
    current_agent = container("agent", required=False)
    if current_agent:
        docker("stop", "--time", "30", current_agent["Id"])
    compose(folder, "rollback.compose.json", "up", "-d", "--no-deps", "--no-build", "--pull", "never", "app")
    restored = container("app")
    if restored["Image"] != state["oldAppImage"]:
        raise DeployError("Rollback image did not match preserved image")
    wait_http(restored["Id"], "/blog", 200)
    update_state(folder, state, status="rolled-back", rollbackAt=int(time.time()))
    return {"releaseId": identity, "status": "rolled-back", "databaseRollback": False, "volumesPreserved": True}


def apply(identity, receipt_path):
    folder, state, manifest = read_state(identity)
    if state["status"] != "backup-verified":
        raise DeployError("Apply requires verified backup and restore check")
    receipt = load_secure(receipt_path)
    report = load_secure(folder / "backup/report.json")
    if (receipt.get("releaseId") != identity or receipt.get("offHostVerified") is not True
            or receipt.get("databaseSha256") != report.get("databaseSha256")
            or receipt.get("uploadsSha256") != report.get("uploadsSha256")):
        raise DeployError("Verified off-host backup receipt required")
    app, caddy, _ = inventory()
    if app["Image"] != state["oldAppImage"] or caddy["Id"] != state["caddyId"]:
        raise DeployError("Production changed since preparation")
    image_verified(manifest["blogImage"])
    image_verified(manifest["agentImage"], agent=True)
    check_owned_resources()
    # Guard the writes between the earlier backup exercise and this cutover.
    # Stop first, compare the complete quiescent source, and resume without any
    # migration if anything changed. A new release/backup is then required.
    unchanged = False
    try:
        docker("stop", "--time", "30", app["Id"])
        latest = parsed(docker("run", "--rm", "--network", "none", "--read-only", "--user", "0:0",
                  "--cap-drop", "ALL", "--cap-add", "DAC_READ_SEARCH", "--security-opt", "no-new-privileges:true",
                  "--mount", "type=volume,src=" + VOLUMES["db-data"] + ",dst=/source,readonly",
                  "--entrypoint", "python", manifest["agentImage"], "-c",
                  FINGERPRINT_PROGRAM + "\nprint(json.dumps({'fingerprint':fingerprint}))", timeout=600))
        unchanged = bool(report.get("sourceFingerprint")) and latest.get("fingerprint") == report["sourceFingerprint"]
    finally:
        if not unchanged:
            docker("start", app["Id"])
    if not unchanged:
        update_state(folder, state, status="backup-stale")
        raise DeployError("Blog changed after backup; old app resumed, prepare a new release/backup")
    try:
        update_state(folder, state, status="applying", applyAt=int(time.time()))
        compose(folder, "release.compose.json", "up", "-d", "--no-deps", "--no-build", "--pull", "never", "agent")
        compose(folder, "release.compose.json", "run", "--rm", "--no-deps", "agent", "python", "-m",
                "blog_assistant.web.migrate", "--data-dir", "/data/runtime")
        compose(folder, "release.compose.json", "up", "-d", "--no-deps", "--no-build", "--pull", "never", "app")
        new_app, new_caddy, _ = inventory()
        if new_app["Image"] != manifest["blogImage"] or new_caddy["Id"] != state["caddyId"]:
            raise DeployError("Post-deploy image/Caddy identity mismatch")
        wait_http(new_app["Id"], "/blog", 200)
        wait_http(new_app["Id"], "/assistant", 404)
        agent = container("agent")
        if agent["HostConfig"].get("PortBindings") or environment(agent).get("AGENT_WEB_ENABLED") != "false":
            raise DeployError("Agent private/disabled postcondition failed")
        docker("exec", agent["Id"], "python", "-c",
               "import urllib.request;assert urllib.request.urlopen('http://127.0.0.1:8000/health/live').status==200")
        https_checks = validate_https(manifest["expectedServerAddress"])
    except (DeployError, OSError):
        try:
            rollback(identity)
        except (DeployError, OSError):
            try:
                update_state(folder, state, status="rollback-needs-attention")
            except OSError:
                pass
            raise DeployError("Deployment failed and rollback needs operator attention") from None
        raise DeployError("Deployment failed; previous app image restored, databases retained") from None
    update_state(folder, state, status="deployed-disabled", completedAt=int(time.time()), httpsChecks=https_checks)
    return {"releaseId": identity, "status": "deployed-disabled", "publicAssistantEnabled": False,
            "caddyRecreated": False, "modelCalls": 0, "httpsChecks": https_checks}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("audit", help="Read-only sanitized production inventory")
    command = commands.add_parser("prepare", help="Freeze protected Compose and rollback state")
    command.add_argument("--manifest", required=True)
    for name in ("status", "backup", "rollback"):
        command = commands.add_parser(name)
        command.add_argument("--release", required=True)
    command = commands.add_parser("apply")
    command.add_argument("--release", required=True)
    command.add_argument("--off-host-receipt", required=True)
    args = parser.parse_args(argv)
    lock = None
    try:
        if args.command != "audit" and (not hasattr(os, "geteuid") or os.geteuid() != 0):
            raise DeployError("Mutating deployment commands require Linux root")
        if args.command != "audit":
            import fcntl
            if ROOT.is_symlink() or ROOT.resolve() != ROOT:
                raise DeployError("Release root path aliases rejected")
            ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
            if ROOT.stat().st_uid != 0 or ROOT.stat().st_mode & 0o077:
                raise DeployError("Release root must be root-owned and owner-only")
            descriptor = os.open(ROOT / ".deploy.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            lock = os.fdopen(descriptor, "w")
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise DeployError("Another deployment command holds the project lock") from None
        if args.command == "audit":
            result = audit()
        elif args.command == "prepare":
            result = prepare(args.manifest)
        elif args.command == "status":
            _, state, _ = read_state(args.release)
            result = {key: state.get(key) for key in ("releaseId", "status", "preparedAt", "backupAt", "completedAt")}
        elif args.command == "backup":
            result = backup(args.release)
        elif args.command == "rollback":
            result = rollback(args.release)
        else:
            result = apply(args.release, args.off_host_receipt)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except DeployError as error:
        print("Deployment stopped: " + str(error), file=sys.stderr)
        return 2
    except (OSError, KeyError, IndexError, TypeError, ValueError):
        # Never expose repr of Docker objects, env values, provider keys or private paths.
        print("Deployment stopped: prerequisites or health checks failed; review protected state.", file=sys.stderr)
        return 2
    finally:
        if lock is not None:
            lock.close()


if __name__ == "__main__":
    raise SystemExit(main())
