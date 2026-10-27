"""Offline safety and orchestration tests; never connects to a Docker daemon."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import sqlite3
import sys
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("remote_deploy", Path(__file__).with_name("remote_deploy.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def manifest():
    return {"releaseId": "http-20261027", "project": "carrykit-blog", "domain": "carrykit.top",
            "expectedServerAddress": "192.0.2.20",
            "blogRevision": "a" * 40, "agentRevision": "b" * 40,
            "blogImage": "sha256:" + "c" * 64, "agentImage": "sha256:" + "d" * 64,
            "reviewed": True, "migrationRollbackCompatible": True,
            "validated": {"blogLint": True, "blogBuild": True, "agentOffline": True}}


class RemoteDeployTests(unittest.TestCase):
    def test_mount_check_does_not_accept_other_volume_or_bind(self):
        for item in [{"Type": "bind", "Name": deploy.VOLUMES["db-data"], "Destination": "/data"},
                     {"Type": "volume", "Name": "srv_db-data", "Destination": "/data"}]:
            with self.assertRaises(deploy.DeployError):
                deploy.require_mount({"Mounts": [item]}, "/data", deploy.VOLUMES["db-data"])

    def test_manifest_missing_review_or_full_revisions_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "manifest.json"
            original = manifest()
            for key, value in [("reviewed", False), ("blogRevision", "HEAD"),
                               ("blogImage", "latest"), ("migrationRollbackCompatible", False),
                               ("project", "srv"), ("expectedServerAddress", "carrykit.top"),
                               ("expectedServerAddress", "127.0.0.1"), ("expectedServerAddress", "0.0.0.0")]:
                path.write_text(json.dumps({**original, key: value}))
                with self.assertRaises(deploy.DeployError):
                    deploy.manifest_at(path)
            path.write_text(json.dumps(original))
            self.assertEqual(deploy.manifest_at(path), original)

    def test_compose_generated_preserves_existing_caddy_and_app_settings(self):
        original = {"services": {"app": {"build": {"context": "/opt/blog"},
                    "volumes": [{"source": "db-data", "target": "/data", "type": "volume"}],
                    "networks": {"default": {"aliases": ["app"]}}, "restart": "unless-stopped"},
                    "caddy": {"image": "caddy:2", "ports": ["443:443"],
                              "volumes": [{"source": "/opt/blog/Caddyfile", "target": "/etc/caddy/Caddyfile", "type": "bind"}]}},
                    "volumes": {}, "networks": {"default": {"name": "carrykit-blog_default"}}}
        app = {"Config": {"Env": ["DATABASE_URL=file:/data/blog.db", "SESSION_SECRET=" + "s" * 32,
                                    "CUSTOM_VALUE=has$dollar`and'quote", "DEEPSEEK_API_KEY=retained-private"]}}
        result = deploy.generated_compose(original, app, manifest())
        self.assertEqual(result["services"]["caddy"], original["services"]["caddy"])
        new_app = result["services"]["app"]
        self.assertEqual(new_app["environment"]["CUSTOM_VALUE"], "has$dollar`and'quote")
        self.assertEqual(new_app["environment"]["DEEPSEEK_API_KEY"], "retained-private")
        self.assertEqual(new_app["environment"]["ASSISTANT_ENABLED"], "false")
        self.assertEqual(new_app["environment"]["ASSISTANT_PREVIEW_ENABLED"], "false")
        self.assertEqual(new_app["volumes"], original["services"]["app"]["volumes"])
        self.assertNotIn("build", new_app)
        self.assertIn("default", new_app["networks"])
        self.assertIn("agent-link", new_app["networks"])
        agent = result["services"]["agent"]
        self.assertNotIn("ports", agent)
        self.assertEqual(agent["environment"]["AGENT_WEB_ENABLED"], "false")
        self.assertNotIn("AGENT_MODEL_API_KEY", agent["environment"])
        self.assertEqual(set(agent["networks"]), {"agent-link"})
        for role, name in deploy.VOLUMES.items():
            self.assertEqual(result["volumes"][role], {"external": True, "name": name})
        secret_values = [new_app["environment"][key] for key in
                         ["SESSION_SECRET", "AGENT_REQUEST_SECRET", "AGENT_CONTENT_SECRET", "VISITOR_SESSION_SECRET"]]
        self.assertEqual(len(set(secret_values)), 4)
        self.assertEqual(original["services"]["app"]["build"], {"context": "/opt/blog"})

    def test_compose_literals_escape_without_shell_interpretation(self):
        data = {"environment": {"SECRET": "x$y${HOME}$$'`$(touch BAD)"}, "list": ["$z"], "n": 4}
        encoded = deploy.escape_compose(data)
        self.assertEqual(encoded["environment"]["SECRET"], "x$$y$${HOME}$$$$'`$$(touch BAD)")
        self.assertEqual(encoded["list"], ["$$z"])
        self.assertEqual(data["list"], ["$z"])

    def test_foreign_agent_resource_is_rejected(self):
        def execute(*args, **kwargs):
            if args[:2] == ("network", "ls"):
                return "carrykit-blog_agent-link\n"
            if args[:2] == ("network", "inspect"):
                return json.dumps([{"Labels": {"com.docker.compose.project": "srv"}}])
            raise AssertionError(args)
        with patch.object(deploy, "docker", side_effect=execute):
            with self.assertRaises(deploy.DeployError):
                deploy.check_owned_resources()

    def test_invalid_or_symlink_release_path_rejected(self):
        for name in ["../srv", "other/root", "", "../", "A"]:
            with self.assertRaises(deploy.DeployError):
                deploy.release_path(name)

    def test_remote_command_error_never_leaks_stderr(self):
        response = type("Result", (), {"returncode": 1, "stdout": "key-secret", "stderr": "secret-api-token"})()
        with patch.object(deploy.subprocess, "run", return_value=response):
            with self.assertRaises(deploy.DeployError) as caught:
                deploy.run(["docker", "inspect"])
        self.assertNotIn("secret", str(caught.exception))

    def test_pinned_https_connects_audited_ip_with_domain_sni_and_default_tls(self):
        with patch.object(deploy.ssl, "create_default_context") as create_tls, \
             patch.object(deploy.socket, "create_connection") as connect:
            context = create_tls.return_value
            connection = deploy.PinnedServerHTTPSConnection("192.0.2.20", timeout=9)
            connection.connect()
            connect.assert_called_once_with(("192.0.2.20", 443), 9)
            context.wrap_socket.assert_called_once_with(connect.return_value, server_hostname="carrykit.top")
            self.assertEqual(connection.sock, context.wrap_socket.return_value)
            self.assertEqual(connection.host, "carrykit.top")

    def test_https_validation_checks_both_pinned_server_and_public_domain(self):
        with patch.object(deploy, "PinnedServerHTTPSConnection") as pinned, \
             patch.object(deploy.urllib.request, "urlopen") as public:
            direct = pinned.return_value
            direct.getresponse.side_effect = [type("Response", (), {"status": status, "read": lambda self, count: b""})()
                                             for status in (200, 404)]
            public.return_value.__enter__.return_value.status = 200
            public.side_effect = [public.return_value,
                    deploy.urllib.error.HTTPError("https://carrykit.top/assistant", 404, "", {}, None)]
            checks = deploy.validate_https("192.0.2.20")
            self.assertEqual([c["transport"] for c in checks], ["audited-server-ip"] * 2 + ["public-domain"] * 2)
            self.assertTrue(all(c["certificateVerified"] for c in checks))
            self.assertEqual(direct.close.call_count, 2)
            pinned.assert_called_with("192.0.2.20")

    def test_audit_reports_both_upload_and_docker_storage_filesystem_space(self):
        app = {"Image": "app-image", "Mounts": [], "State": {"Status": "running"}}
        caddy = {"Image": "caddy-image", "Mounts": [], "State": {"Status": "running"}}
        def execute(*args, **kwargs):
            if args[0] == "info":
                return '{"OSType":"linux","Architecture":"x86_64","ServerVersion":"29","DockerRootDir":"/var/lib/docker"}'
            return '{"Name":"carrykit-blog-app-1","MemUsage":"10MiB"}\n'
        uploads_space = type("Space", (), {"free": 100, "total": 300})()
        docker_space = type("Space", (), {"free": 200, "total": 500})()
        with patch.object(deploy, "inventory", return_value=(app, caddy, ["/opt/blog/docker-compose.yml"])), \
             patch.object(deploy, "docker", side_effect=execute), \
             patch.object(deploy, "data_sizes", return_value={"dataBytes": {"database": 1, "wal": 0, "uploads": 2}, "dataFiles": {"uploads": 1, "entries": 2}}), \
             patch.object(deploy.Path, "is_dir", return_value=True), \
             patch.object(deploy.Path, "exists", return_value=False), \
             patch.object(deploy.Path, "is_absolute", return_value=True), \
             patch.object(deploy.shutil, "disk_usage", side_effect=[docker_space, uploads_space]) as usage:
            result = deploy.audit()
        self.assertEqual(result["diskFreeBytes"], 100)
        self.assertEqual(result["dockerDiskFreeBytes"], 200)
        self.assertEqual(result["dockerDiskTotalBytes"], 500)
        self.assertEqual(usage.call_args_list[0].args, (deploy.Path("/var/lib/docker"),))
        self.assertNotIn("DockerRootDir", result)
        self.assertEqual(result["dataBytes"], {"database": 1, "wal": 0, "uploads": 2})

    def test_ownership_mismatch_refuses_before_maintenance(self):
        with patch.object(deploy, "docker", side_effect=['[999,995]', '[1000,1000]']) as docker:
            with self.assertRaises(deploy.DeployError):
                deploy.check_app_ownership({"Id": "old-app"}, manifest()["blogImage"])
            self.assertFalse(any("stop" in call.args for call in docker.call_args_list))
        with patch.object(deploy, "docker", side_effect=['[999,995]', '[999,995]']):
            self.assertEqual(deploy.check_app_ownership({"Id": "old-app"}, manifest()["blogImage"]), [999, 995])

    def test_backup_space_uses_combined_requirement_when_filesystems_are_shared(self):
        sizes = {"dataBytes": {"database": 100, "wal": 10, "uploads": 200}, "dataFiles": {"uploads": 1, "entries": 2}}
        # Each individual footprint fits, their combined shared-filesystem footprint does not.
        space = type("Space", (), {"free": 70 * 1024 * 1024})()
        stat = type("Stat", (), {"st_dev": 1})()
        with patch.object(deploy, "data_sizes", return_value=sizes), \
             patch.object(deploy, "docker_storage", return_value=({}, Path("/docker"), space)), \
             patch.object(deploy.shutil, "disk_usage", return_value=space), \
             patch.object(deploy.os, "stat", return_value=stat), patch.object(deploy, "docker") as docker:
            with self.assertRaises(deploy.DeployError):
                deploy.check_backup_space({"Id": "old-app"})
            docker.assert_not_called()

    def test_data_size_requires_complete_numeric_nonempty_database_measurement(self):
        cases = [{}, {"dataBytes": {"database": 0, "wal": 0, "uploads": 0}, "dataFiles": {"uploads": 0, "entries": 0}},
                 {"dataBytes": {"database": 1, "wal": "unknown", "uploads": 0}, "dataFiles": {"uploads": 0, "entries": 0}}]
        for result in cases:
            with patch.object(deploy, "docker", return_value=json.dumps(result)):
                with self.assertRaises(deploy.DeployError):
                    deploy.data_sizes({"Id": "old-app"})

    def test_fingerprint_rejects_dangling_source_symlinks(self):
        # No OS symlink privilege is needed for this deterministic branch test.
        with patch.object(deploy.Path, "is_symlink", return_value=True):
            with self.assertRaises(RuntimeError):
                exec(compile(deploy.FINGERPRINT_PROGRAM, "<dangling-symlink-test>", "exec"), {})

    def test_apply_without_offhost_backup_receipt_cannot_run_docker(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            deploy.secure_json(folder / "report.json", {"databaseSha256": "d", "uploadsSha256": "u"})
            with patch.object(deploy, "read_state", return_value=(folder, {"status": "backup-verified"}, manifest())), \
                 patch.object(deploy, "load_secure", side_effect=[{"releaseId": "http-20261027", "offHostVerified": False},
                                                                 {"databaseSha256": "d", "uploadsSha256": "u"}]), \
                 patch.object(deploy, "docker") as docker:
                with self.assertRaises(deploy.DeployError):
                    deploy.apply("http-20261027", folder / "receipt.json")
                docker.assert_not_called()

    def test_backup_restarts_existing_app_when_snapshot_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            app = {"Image": "old", "Id": "existing-app"}
            caddy = {"Id": "existing-caddy"}
            state = {"status": "prepared", "oldAppImage": "old", "caddyId": "existing-caddy"}
            calls = []
            def execute(*args, **kwargs):
                calls.append(args)
                if args[0] == "run":
                    raise deploy.DeployError("Snapshot failed")
                return ""
            with patch.object(deploy, "read_state", return_value=(folder, state, manifest())), \
                 patch.object(deploy, "inventory", return_value=(app, caddy, [])), \
                 patch.object(deploy, "check_app_ownership", return_value=[999, 995]), \
                 patch.object(deploy, "check_backup_space", return_value={}), \
                 patch.object(deploy, "docker", side_effect=execute):
                with self.assertRaises(deploy.DeployError):
                    deploy.backup("http-20261027")
            self.assertEqual(calls[0], ("stop", "--time", "30", "existing-app"))
            self.assertEqual(calls[-1], ("start", "existing-app"))
            backup_command = calls[1]
            self.assertIn("none", backup_command)
            self.assertIn("type=volume,src=carrykit-blog_db-data,dst=/source,readonly", backup_command)

    def test_apply_source_changed_after_backup_resumes_old_app_without_migration(self):
        state = {"status": "backup-verified", "oldAppImage": "old", "caddyId": "caddy"}
        receipt = {"releaseId": "http-20261027", "offHostVerified": True,
                   "databaseSha256": "d", "uploadsSha256": "u"}
        report = {"databaseSha256": "d", "uploadsSha256": "u", "sourceFingerprint": "before"}
        calls = []
        def execute(*args, **kwargs):
            calls.append(args)
            return '{"fingerprint":"after"}' if args[0] == "run" else ""
        with patch.object(deploy, "read_state", return_value=(Path("/protected"), state, manifest())), \
             patch.object(deploy, "load_secure", side_effect=[receipt, report]), \
             patch.object(deploy, "inventory", return_value=({"Image": "old", "Id": "old-app"}, {"Id": "caddy"}, [])), \
             patch.object(deploy, "image_verified"), patch.object(deploy, "check_owned_resources"), \
             patch.object(deploy, "update_state") as updated, patch.object(deploy, "compose") as compose, \
             patch.object(deploy, "docker", side_effect=execute):
            with self.assertRaises(deploy.DeployError):
                deploy.apply("http-20261027", "/protected/receipt.json")
        self.assertEqual(calls[0], ("stop", "--time", "30", "old-app"))
        self.assertEqual(calls[-1], ("start", "old-app"))
        self.assertEqual(updated.call_args.kwargs["status"], "backup-stale")
        compose.assert_not_called()

    def test_existing_restore_volume_never_overwritten(self):
        name = "carrykit-blog_restore-http-20261027"
        with patch.object(deploy, "docker", return_value=name + "\n") as docker:
            with self.assertRaises(deploy.DeployError):
                deploy.restore_exercise(Path("/protected"), manifest(), {})
            self.assertEqual(docker.call_count, 1)

    def test_isolated_restore_requires_unchanged_business_counts(self):
        calls = []
        def execute(*args, **kwargs):
            calls.append(args)
            if args[:2] == ("volume", "ls"):
                return ""
            if "console.log(JSON.stringify([process.getuid(),process.getgid()]))" in args:
                return "[999,995]"
            if deploy.RESTORE_CHECK in args:
                return '{"Post":2,"Project":1,"User":1}'
            return ""
        with patch.object(deploy, "docker", side_effect=execute):
            report = deploy.restore_exercise(Path("/protected"), manifest(),
                    {"tableCounts": {"Post": 2, "Project": 1, "User": 1, "_prisma_migrations": 3}})
        self.assertTrue(report["migrationsApplied"])
        self.assertTrue(report["businessCountsPreserved"])
        migration = next(args for args in calls if "migrate" in args)
        self.assertIn("none", migration)
        self.assertIn("DATABASE_URL=file:/data/blog.db", migration)
        self.assertNotIn("carrykit-blog_db-data", " ".join(migration))
        self.assertFalse(any(args[:2] in [("volume", "rm"), ("compose", "down")] for args in calls))

    def test_root_image_or_architecture_mismatch_refused(self):
        identity = manifest()["blogImage"]
        cases = [{"Id": identity, "Os": "linux", "Architecture": "amd64", "Config": {"User": "root"}},
                 {"Id": identity, "Os": "linux", "Architecture": "arm64", "Config": {"User": "nextjs"}}]
        for image in cases:
            with patch.object(deploy, "docker", side_effect=[json.dumps([image]), '{"Architecture":"x86_64"}']):
                with self.assertRaises(deploy.DeployError):
                    deploy.image_verified(identity)

    def test_actual_sqlite_backup_and_upload_restore_preserve_content(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source"
            target = Path(temp) / "backup"
            source.mkdir(); target.mkdir()
            (source / "uploads").mkdir()
            (source / "uploads/synthetic.txt").write_text("Synthetic upload, not user material", encoding="utf-8")
            with contextlib.closing(sqlite3.connect(source / "blog.db")) as db:
                db.execute('CREATE TABLE Post(id TEXT PRIMARY KEY, title TEXT)')
                db.execute("INSERT INTO Post VALUES('synthetic','Orion')")
                db.commit()
            before = hashlib.sha256((source / "blog.db").read_bytes()).hexdigest()
            program = deploy.BACKUP_PROGRAM.replace("pathlib.Path('/source')", f"pathlib.Path({str(source)!r})")
            program = program.replace("pathlib.Path('/backup')", f"pathlib.Path({str(target)!r})")
            exec(compile(program, "<backup-program-test>", "exec"), {})
            report = json.loads((target / "report.json").read_text())
            self.assertEqual(report["integrity"], "ok")
            self.assertEqual(report["tableCounts"], {"Post": 1})
            self.assertEqual(report["restoredUploads"], 1)
            self.assertEqual(before, hashlib.sha256((source / "blog.db").read_bytes()).hexdigest())
            self.assertEqual((source / "uploads/synthetic.txt").read_bytes(),
                             (target / "restore-check/uploads/synthetic.txt").read_bytes())
            fingerprint = deploy.FINGERPRINT_PROGRAM.replace("pathlib.Path('/source')", f"pathlib.Path({str(source)!r})")
            state = {};exec(compile(fingerprint, "<fingerprint-test>", "exec"), state)
            self.assertEqual(state["fingerprint"], report["sourceFingerprint"])
            (source / "uploads/synthetic.txt").write_text("Changed after backup", encoding="utf-8")
            state = {};exec(compile(fingerprint, "<fingerprint-test>", "exec"), state)
            self.assertNotEqual(state["fingerprint"], report["sourceFingerprint"])


def docker_helper_rehearsal():
    """Explicit opt-in, synthetic-only Docker exercise; all new volumes retained."""
    import secrets
    prefix = "carrykit-deploy-rehearsal-20261027-" + secrets.token_hex(3)
    folder = Path.cwd() / ".recall" / prefix
    folder.mkdir(mode=0o700)
    backup = folder / "backup";backup.mkdir(mode=0o700)
    blog = json.loads(deploy.docker("image", "inspect", "carrykit-blog:http-20261026"))[0]["Id"]
    agent = json.loads(deploy.docker("image", "inspect", "carrykit-agent:http-20261026"))[0]["Id"]
    source_volume = prefix + "-source"
    deploy.docker("volume", "create", "--label", "carrykit.role=synthetic-deployment-rehearsal", source_volume)
    deploy.docker("run", "--rm", "--network", "none", "--read-only", "--user", "0:0",
                  "--cap-drop", "ALL", "--cap-add", "CHOWN", "--mount", "type=volume,src=" + source_volume + ",dst=/data",
                  "--entrypoint", "python", agent, "-c", "import os;os.chown('/data',999,995)")
    common = ["run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp:size=64m",
              "--mount", "type=volume,src=" + source_volume + ",dst=/data", "--env", "DATABASE_URL=file:/data/blog.db"]
    deploy.docker(*common, "--entrypoint", "node", blog, "node_modules/prisma/build/index.js", "migrate", "deploy")
    seed = r'''
const {PrismaBetterSqlite3}=require('@prisma/adapter-better-sqlite3');
const {PrismaClient}=require('./src/generated/prisma/client');
const db=new PrismaClient({adapter:new PrismaBetterSqlite3({url:'file:/data/blog.db'})});
(async()=>{await db.post.create({data:{slug:'synthetic-deploy',title:'合成部署测试',titleEn:'Synthetic deploy test',content:'Test only',contentEn:'Test only',status:'PUBLISHED'}});
await db.post.create({data:{slug:'synthetic-draft',title:'草稿',content:'Test only',status:'DRAFT'}});
await db.user.create({data:{email:'synthetic@example.invalid',passwordHash:'synthetic-not-a-credential'}});
require('fs').mkdirSync('/data/uploads');require('fs').writeFileSync('/data/uploads/synthetic.txt','test upload');await db.$disconnect();})().catch(()=>{process.exit(2)});
'''
    deploy.docker(*common, "--entrypoint", "node", blog, "node_modules/tsx/dist/cli.mjs", "-e", seed)
    deploy.docker("run", "--rm", "--network", "none", "--read-only", "--user", "0:0",
                  "--cap-drop", "ALL", "--cap-add", "DAC_READ_SEARCH",
                  "--mount", "type=volume,src=" + source_volume + ",dst=/source,readonly",
                  "--mount", "type=bind,src=" + backup.resolve().as_posix() + ",dst=/backup",
                  "--entrypoint", "python", agent, "-c", deploy.BACKUP_PROGRAM)
    report = json.loads((backup / "report.json").read_text())
    original_project = deploy.PROJECT
    deploy.PROJECT = prefix
    try:
        result = deploy.restore_exercise(folder, {**manifest(), "releaseId": "synthetic", "blogImage": blog, "agentImage": agent}, report)
    finally:
        deploy.PROJECT = original_project
    output = {"syntheticOnly": True, "network": "none", "sourceVolume": source_volume,
              "backupIntegrity": report["integrity"], "sourceFingerprint": report["sourceFingerprint"],
              "restoredUploads": report["restoredUploads"], "businessCounts": report["tableCounts"],
              "targetImageRestore": result, "productionVolumesTouched": False}
    (folder / "result.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if sys.argv[1:] == ["--docker-helper-rehearsal"]:
        docker_helper_rehearsal()
    else:
        unittest.main()
