#!/usr/bin/env python3
"""Root-only activation and scheduled maintenance of a reviewed disabled release.

Credentials enter through JSON stdin, never command arguments or logs. Original
runtime databases and migrations are never deleted. Retention applies only to
this program's separately marked backup copies, after seven days.
"""
import argparse
import contextlib
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import signal
import shutil
import stat
import sys
import time

import remote_deploy as deploy

OPS_MARKER = 'carrykit-agent-ops-v1'
RETENTION = 604800
ACTIVE_QUERY = "import sqlite3,contextlib;\nwith contextlib.closing(sqlite3.connect('file:/data/runtime/runtime.sqlite?mode=ro',uri=True)) as db: print(db.execute(\"SELECT count(*) FROM web_runs WHERE state IN ('queued','running','cancelling')\").fetchone()[0])"
NEXT_CLEANUP = """const {PrismaBetterSqlite3}=require('@prisma/adapter-better-sqlite3');
const {PrismaClient}=require('./src/generated/prisma/client');
const db=new PrismaClient({adapter:new PrismaBetterSqlite3({url:'file:/data/blog.db'})});
(async()=>{const now=new Date();const result=await db.$transaction([db.visitor.deleteMany({where:{expiresAt:{lte:now}}}),db.accessBucket.deleteMany({where:{expiresAt:{lte:now}}}),db.serviceNonce.deleteMany({where:{expiresAt:{lte:now}}})]);await db.$disconnect();console.log(JSON.stringify({expiredRowsDeleted:result.reduce((a,r)=>a+r.count,0)}));})().catch(()=>process.exit(2));"""


def sha(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''):
            value.update(block)
    return value.hexdigest()


def raw_compose(value):
    if isinstance(value, str): return value.replace('$$', '$')
    if isinstance(value, list): return [raw_compose(item) for item in value]
    if isinstance(value, dict): return {key: raw_compose(item) for key, item in value.items()}
    return value


def replace_json(path, data):
    temporary = path.parent / ('ops-' + secrets.token_hex(8) + '.json')
    deploy.secure_json(temporary, data)
    os.replace(temporary, path)


def private_bytes(path, content):
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(content); stream.flush(); os.fsync(stream.fileno())


def release(identity, *, activation=False, allow_attention=False):
    folder, state, manifest = deploy.read_state(identity)
    allowed = {'deployed-disabled'} if activation else {'deployed-disabled', 'public-enabled'}
    if allow_attention and not activation: allowed.add('ops-attention')
    if state.get('status') not in allowed:
        raise deploy.DeployError('A healthy disabled or active deployment is required')
    app, caddy, _ = deploy.inventory(); agent = deploy.container('agent')
    if (app['Image'] != manifest['blogImage'] or agent['Image'] != manifest['agentImage']
            or caddy['Id'] != state['caddyId'] or agent['HostConfig'].get('PortBindings')):
        raise deploy.DeployError('Release image/private network identity changed')
    for target, name in [('/data/runtime', deploy.PROJECT + '_agent-runtime'),
                         ('/data/index', deploy.PROJECT + '_agent-index')]:
        deploy.require_mount(agent, target, name)
    return folder, state, manifest, app, caddy, agent


def caddy_header(content):
    """Only transform an unambiguous plain app proxy; complex configs need review."""
    if len(content) > 512 * 1024 or '\0' in content:
        raise deploy.DeployError('Caddy configuration unsupported')
    # Other sites may share Caddy. Only this exact upstream is in our scope;
    # reject duplicate/complex app targets while leaving every foreign proxy intact.
    uncommented = '\n'.join(line.partition('#')[0] for line in content.splitlines())
    targets = re.findall(r'(?<![A-Za-z0-9_.-])app:3000(?![A-Za-z0-9_:.\-])', uncommented)
    lines = list(re.finditer(r'^(?P<indent>[ \t]*)reverse_proxy[ \t]+app:3000[ \t]*\r?$', content, re.M))
    if len(targets) != 1 or len(lines) != 1:
        raise deploy.DeployError('Complex proxy configuration requires operator review')
    line = lines[0]
    indent = line.group('indent')
    replacement = (indent + 'reverse_proxy app:3000 {\n' + indent + '\theader_up '
                   'X-Carrykit-Client-IP {http.request.remote.host}\n' + indent + '}')
    return content[:line.start()] + replacement + content[line.end():]


def write_bound_file(path, content):
    # In-place write preserves a file bind mount's inode. Validate before this.
    descriptor = os.open(path, os.O_WRONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(content); stream.truncate(); stream.flush(); os.fsync(stream.fileno())


def install_proxy(folder, caddy):
    matches = [item for item in caddy.get('Mounts', []) if item.get('Destination') == '/etc/caddy/Caddyfile']
    if len(matches) != 1 or matches[0].get('Type') != 'bind':
        raise deploy.DeployError('Expected existing Caddyfile bind mount')
    source = Path(matches[0]['Source'])
    if (source.is_symlink() or source.resolve() != source or not source.is_file()
            or source.stat().st_uid != 0 or source.stat().st_mode & 0o022):
        raise deploy.DeployError('Caddyfile must be a protected regular root-owned file')
    original = source.read_bytes()
    candidate = caddy_header(original.decode('utf-8')).encode('utf-8')
    private_bytes(folder / 'pre-ops.Caddyfile', original)
    staged = folder / 'ops.Caddyfile'; private_bytes(staged, candidate)
    inside = '/tmp/carrykit-ops-' + secrets.token_hex(8) + '.caddy'
    deploy.docker('cp', str(staged), caddy['Id'] + ':' + inside)
    deploy.docker('exec', caddy['Id'], 'caddy', 'validate', '--config', inside, '--adapter', 'caddyfile')
    try:
        write_bound_file(source, candidate)
        deploy.docker('exec', caddy['Id'], 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
    except (deploy.DeployError, OSError):
        write_bound_file(source, original)
        deploy.docker('exec', caddy['Id'], 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
        raise deploy.DeployError('Proxy update failed; original configuration restored') from None
    if deploy.container('caddy')['Id'] != caddy['Id']:
        raise deploy.DeployError('Caddy was unexpectedly recreated')
    return {'source': str(source), 'sha256': hashlib.sha256(candidate).hexdigest(), 'containerId': caddy['Id']}


def active_runs(agent):
    value = deploy.docker('exec', agent['Id'], 'python', '-c', ACTIVE_QUERY).strip()
    if not value.isdecimal(): raise deploy.DeployError('Cannot establish active run count')
    return int(value)


def require_agent_uid(agent):
    identity = deploy.parsed(deploy.docker('exec', agent['Id'], 'python', '-c',
                                          'import os,json;print(json.dumps([os.getuid(),os.getgid()]))'))
    if identity != [10001, 10001]:
        raise deploy.DeployError('Maintenance requires the locked Agent UID/GID')


def wait_idle(agent, timeout=120):
    deadline = time.monotonic() + timeout
    while active_runs(agent):
        if time.monotonic() >= deadline: return False
        time.sleep(2)
    return True


def maintenance_command(agent, arguments, *, backup_root=None, readonly=False):
    # Same UID as the normal worker: SQLite WAL/SHM sidecars must never become root-owned.
    command = ['run', '--rm', '--network', 'none', '--read-only', '--user', '10001:10001',
               '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
               '--tmpfs', '/tmp:size=64m,mode=1777',
               '--mount', 'type=volume,src=' + deploy.PROJECT + '_agent-runtime,dst=/data/runtime' + (',readonly' if readonly else '')]
    if backup_root is not None:
        command += ['--mount', 'type=bind,src=' + str(backup_root) + ',dst=/backups']
    command += ['--entrypoint', 'python', agent['Image'], '-m', 'blog_assistant.web.maintenance', *arguments, '--workers-stopped']
    return deploy.parsed(deploy.docker(*command, timeout=600))


def marked_backup_root(folder):
    root = folder / 'agent-backups'
    if root.is_symlink() or root.resolve() != root: raise deploy.DeployError('Backup aliases rejected')
    root.mkdir(mode=0o700, exist_ok=True)
    if root.stat().st_uid != 0 or root.stat().st_mode & 0o077:
        raise deploy.DeployError('Backups must be root-owned and owner-only')
    return root


def prune_backups(folder, now=None):
    """Only delete expired, marked copies under our exact release backup root."""
    root = marked_backup_root(folder); removed = 0; now = time.time() if now is None else now
    for entry in root.iterdir():
        if (entry.is_symlink() or not entry.is_dir() or entry.resolve().parent != root
                or not re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{8}', entry.name)):
            raise deploy.DeployError('Unknown entry in managed backup directory')
        marker = deploy.load_secure(entry / 'managed-backup.json')
        if marker.get('owner') != OPS_MARKER or marker.get('releaseId') != folder.name:
            raise deploy.DeployError('Backup marker mismatch')
        created = marker.get('createdAt')
        if type(created) is not int or created > now: raise deploy.DeployError('Invalid backup timestamp')
        if created > now - RETENTION: continue
        for path in entry.rglob('*'):
            if path.is_symlink() or path.stat().st_dev != entry.stat().st_dev:
                raise deploy.DeployError('Backup retention cannot cross aliases or filesystems')
            if path.is_file() and path.stat().st_nlink != 1:
                raise deploy.DeployError('Hard-linked backup copy rejected')
        shutil.rmtree(entry)  # Validated expired backup copies, never the runtime volume.
        removed += 1
    return removed


def backup(identity):
    folder, state, manifest, app, caddy, agent = release(identity)
    if not wait_idle(agent): return {'status': 'SKIPPED_BUSY', 'modelCalls': 0}
    require_agent_uid(agent)
    root = marked_backup_root(folder)
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + secrets.token_hex(4)
    batch = root / stamp; batch.mkdir(mode=0o700)
    os.chown(batch, 10001, 10001)
    deploy.secure_json(batch / 'managed-backup.json', {'owner': OPS_MARKER, 'releaseId': identity, 'createdAt': int(time.time())})
    try:
        deploy.docker('stop', '--time', '30', agent['Id'])
        report = maintenance_command(agent, ['backup', '--data-dir', '/data/runtime', '--backup-dir', '/backups/data'], backup_root=batch)
        if report.get('status') != 'BACKED_UP': raise deploy.DeployError('Agent backup did not complete')
        restored = maintenance_command(agent, ['restore', '--backup-dir', '/backups/data', '--restore-dir', '/backups/restore-proof'], backup_root=batch, readonly=True)
        if restored.get('status') != 'RESTORED': raise deploy.DeployError('Isolated Agent restore did not complete')
    finally:
        deploy.docker('start', agent['Id'])
    manifest_path = batch / 'data' / 'manifest.json'
    proof = {'status': 'VERIFIED', 'backupDirectory': str(batch / 'data'),
             'databaseSha256': report['databaseSha256'], 'manifestSha256': sha(manifest_path),
             'restored': True, 'createdAt': int(time.time())}
    replace_json(folder / 'agent-backup-proof.json', proof)
    return {**proof, 'expiredBackupCopiesDeleted': prune_backups(folder), 'modelCalls': 0}


def systemd_units(identity, script):
    script = script.as_posix() if hasattr(script, 'as_posix') else str(script)
    if not re.fullmatch(r'/[a-zA-Z0-9_./-]+', str(script)):
        raise deploy.DeployError('Systemd script path must be simple and absolute')
    header = '# ' + OPS_MARKER + ' ' + identity + '\n'
    result = {}
    for name, action, calendar in [('maintenance', 'maintain', 'hourly'), ('backup', 'backup', '*-*-* 03:15:00 Asia/Shanghai')]:
        base = 'carrykit-agent-' + name
        result[base + '.service'] = (header + '[Unit]\nDescription=Carrykit Agent ' + name + '\nAfter=docker.service\n'
                                    '[Service]\nType=oneshot\nUser=root\nUMask=0077\nExecStart=/usr/bin/python3 ' + str(script)
                                    + ' ' + action + ' --release ' + identity + '\nTimeoutStartSec=1800\n')
        result[base + '.timer'] = (header + '[Unit]\nDescription=Schedule Carrykit Agent ' + name + '\n[Timer]\nOnCalendar='
                                  + calendar + '\nPersistent=true\nRandomizedDelaySec=30\n[Install]\nWantedBy=timers.target\n')
    return result


def install_timers(identity):
    if not Path('/run/systemd/system').is_dir() or not shutil.which('systemctl'):
        raise deploy.DeployError('Systemd unavailable; scheduling requires operator review')
    units = systemd_units(identity, Path(__file__).resolve())
    for name, text in units.items():
        path = Path('/etc/systemd/system') / name
        if path.is_symlink() or path.exists() and not path.read_text().startswith('# ' + OPS_MARKER + ' ' + identity + '\n'):
            raise deploy.DeployError('Systemd unit collision requires operator review')
        temporary = path.with_suffix(path.suffix + '.carrykit-' + secrets.token_hex(4))
        private_bytes(temporary, text.encode()); os.replace(temporary, path)
    deploy.run(['systemctl', 'daemon-reload'])
    deploy.run(['systemctl', 'enable', '--now', 'carrykit-agent-maintenance.timer', 'carrykit-agent-backup.timer'])
    for name in ['carrykit-agent-maintenance.timer', 'carrykit-agent-backup.timer']:
        if deploy.run(['systemctl', 'is-active', name]).strip() != 'active':
            raise deploy.DeployError('Required maintenance timer is not active')
    return {'hourlyMaintenance': True, 'dailyBackup': '03:15 Asia/Shanghai', 'retentionSeconds': RETENTION}


def prepare(identity):
    folder, state, manifest, app, caddy, agent = release(identity, activation=True)
    if (folder / 'ops-proof.json').exists(): raise deploy.DeployError('Operations already prepared; inspect protected proof')
    proof = backup(identity)
    if proof.get('status') != 'VERIFIED': raise deploy.DeployError('Verified Agent backup/restore required')
    proxy = install_proxy(folder, caddy)
    timers = install_timers(identity)
    proof = {'status': 'PREPARED', 'releaseId': identity, 'proxy': proxy, 'timers': timers,
             'agentBackupManifestSha256': proof['manifestSha256'], 'preparedAt': int(time.time())}
    deploy.secure_json(folder / 'ops-proof.json', proof)
    return {'status': 'PREPARED', 'releaseId': identity, 'offHostAgentBackupRequired': True,
            'agentBackup': deploy.load_secure(folder / 'agent-backup-proof.json'), 'proxyChangedWithoutRecreation': True,
            'modelCalls': 0}


def activation_config(current, credentials):
    if not isinstance(credentials, dict) or set(credentials) - {'modelApiKey', 'dailyLimit', 'subjectLimit'}:
        raise deploy.DeployError('Only the approved provider key and exact limits are accepted')
    if credentials.get('dailyLimit', '1') not in {'1', '1.00'} or credentials.get('subjectLimit', '0.5') not in {'0.5', '0.50'}:
        raise deploy.DeployError('Approved limits cannot be changed by activation')
    key = credentials.get('modelApiKey')
    if not isinstance(key, str) or not 10 <= len(key) <= 4096 or any(c in key for c in '\r\n\0'):
        raise deploy.DeployError('A valid provider key is required')
    config = raw_compose(json.loads(json.dumps(current)))
    app = config['services']['app']['environment']; agent = config['services']['agent']['environment']
    secrets_set = [app.get(name, '') for name in ['SESSION_SECRET', 'VISITOR_SESSION_SECRET', 'AGENT_REQUEST_SECRET', 'AGENT_CONTENT_SECRET']]
    if len(set(secrets_set)) != 4 or any(len(value.encode()) < 32 for value in secrets_set):
        raise deploy.DeployError('Four distinct protected application secrets are required')
    if app.get('AGENT_REQUEST_SECRET') != agent.get('AGENT_REQUEST_SECRET') or app.get('AGENT_CONTENT_SECRET') != agent.get('AGENT_CONTENT_SECRET'):
        raise deploy.DeployError('Internal service secret pair differs')
    app.update(ASSISTANT_ENABLED='true', ASSISTANT_PREVIEW_ENABLED='false', ASSISTANT_TRUST_PROXY_HEADER='true')
    agent.update(AGENT_WEB_ENABLED='true', AGENT_MODEL_API_KEY=key, AGENT_MODEL_BASE_URL='https://api.deepseek.com',
                 AGENT_MODEL='deepseek-flash', AGENT_DAILY_COST_LIMIT='1', AGENT_SUBJECT_DAILY_COST_LIMIT='0.5',
                 AGENT_PRICING_VERSION='deepseek-flash-cny-peak-20261027', AGENT_INPUT_PRICE_PER_MILLION='2',
                 AGENT_OUTPUT_PRICE_PER_MILLION='8', AGENT_SESSION_TTL_SECONDS='86400', AGENT_AUDIT_RETENTION_SECONDS='604800',
                 AGENT_BACKUP_RETENTION_SECONDS='604800', AGENT_MAX_CONCURRENT_RUNS='1', AGENT_MAX_QUEUE='4',
                 AGENT_QUEUE_TIMEOUT_SECONDS='30', AGENT_RUN_TIMEOUT_SECONDS='120', AGENT_SSE_HEARTBEAT_SECONDS='15',
                 AGENT_MAX_INPUT_BYTES='32000', AGENT_MAX_OUTPUT_TOKENS='512')
    return deploy.escape_compose(config)


def require_activation_proof(folder, identity, receipt_path):
    proof = deploy.load_secure(folder / 'ops-proof.json')
    backup_proof = deploy.load_secure(folder / 'agent-backup-proof.json')
    receipt = deploy.load_secure(receipt_path)
    if (proof.get('status') != 'PREPARED' or proof.get('releaseId') != identity
            or proof.get('agentBackupManifestSha256') != backup_proof.get('manifestSha256')
            or receipt.get('releaseId') != identity or receipt.get('offHostVerified') is not True
            or receipt.get('agentBackupManifestSha256') != backup_proof.get('manifestSha256')
            or receipt.get('agentDatabaseSha256') != backup_proof.get('databaseSha256')):
        raise deploy.DeployError('Prepared operations and verified off-host Agent backup receipt required')
    source = Path(proof['proxy']['source'])
    if source.is_symlink() or sha(source) != proof['proxy']['sha256']:
        raise deploy.DeployError('Proxy changed after trusted-header verification')
    return proof


def activate(identity, receipt_path, credentials):
    folder, state, manifest, app, caddy, agent = release(identity, activation=True)
    require_activation_proof(folder, identity, receipt_path)
    original = deploy.load_secure(folder / 'release.compose.json')
    candidate = activation_config(original, credentials)
    try:
        replace_json(folder / 'release.compose.json', candidate)
        deploy.compose(folder, 'release.compose.json', 'config', '--quiet')
        deploy.compose(folder, 'release.compose.json', 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'agent', 'app')
        fresh_agent = deploy.container('agent'); fresh_app = deploy.container('app')
        ready = "import urllib.request;assert urllib.request.urlopen('http://127.0.0.1:8000/health/ready',timeout=5).status==200"
        deadline = time.monotonic() + 90
        while True:
            try: deploy.docker('exec', fresh_agent['Id'], 'python', '-c', ready); break
            except deploy.DeployError:
                if time.monotonic() >= deadline: raise
                time.sleep(2)
        deploy.wait_http(fresh_app['Id'], '/assistant', 200)
        if deploy.container('caddy')['Id'] != caddy['Id']: raise deploy.DeployError('Caddy identity changed')
        # The page and readiness are free checks; a paid question is a separate operation.
        connection = deploy.PinnedServerHTTPSConnection(manifest['expectedServerAddress'])
        try:
            connection.request('GET', '/assistant', headers={'Host': 'carrykit.top', 'Connection': 'close'})
            response = connection.getresponse(); status = response.status; response.read(1024)
            if status != 200: raise deploy.DeployError('Public assistant page check failed')
        finally: connection.close()
    except Exception:
        replace_json(folder / 'release.compose.json', original)
        deploy.compose(folder, 'release.compose.json', 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'agent', 'app')
        deploy.update_state(folder, state, status='deployed-disabled', lastOpsFailureAt=int(time.time()))
        raise deploy.DeployError('Activation failed; disabled configuration restored') from None
    deploy.update_state(folder, state, status='public-enabled', enabledAt=int(time.time()), approvedDailyLimit='1', approvedSubjectLimit='0.5')
    return {'status': 'PUBLIC_ENABLED', 'releaseId': identity, 'dailyLimitCny': '1', 'subjectLimitCny': '0.5', 'modelCalls': 0}


def maintain(identity):
    folder, state, manifest, app, caddy, agent = release(identity)
    if not wait_idle(agent): return {'status': 'SKIPPED_BUSY', 'modelCalls': 0}
    require_agent_uid(agent)
    try:
        deploy.docker('stop', '--time', '30', agent['Id'])
        cleaned = maintenance_command(agent, ['cleanup', '--data-dir', '/data/runtime', '--audit-retention-seconds', str(RETENTION)])
        if cleaned.get('status') != 'CLEANED': raise deploy.DeployError('Agent cleanup incomplete')
        next_result = deploy.parsed(deploy.docker('exec', app['Id'], 'node', 'node_modules/tsx/dist/cli.mjs', '-e', NEXT_CLEANUP))
        pruned = prune_backups(folder)
        deploy.docker('start', agent['Id'])
    except Exception:
        # A failed retention pass is not a successful maintenance cycle. Leave
        # the worker closed for explicit operator recovery, including disable.
        try:
            deploy.docker('stop', '--time', '30', agent['Id'])
        finally:
            deploy.update_state(folder, state, status='ops-attention',
                                opsAttentionReason='CLEANUP_FAILED', opsFailureAt=int(time.time()))
        raise deploy.DeployError('Cleanup failed; Agent stopped and explicit operator recovery required') from None
    return {'status': 'MAINTAINED', 'agent': cleaned, 'next': next_result,
            'expiredBackupCopiesDeleted': pruned, 'modelCalls': 0}


def disable(identity):
    folder, state, manifest, app, caddy, agent = release(identity, allow_attention=True)
    config = raw_compose(deploy.load_secure(folder / 'release.compose.json'))
    config['services']['app']['environment']['ASSISTANT_ENABLED'] = 'false'
    agent_env = config['services']['agent']['environment']
    agent_env['AGENT_WEB_ENABLED'] = 'false'; agent_env.pop('AGENT_MODEL_API_KEY', None)
    replace_json(folder / 'release.compose.json', deploy.escape_compose(config))
    deploy.compose(folder, 'release.compose.json', 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'agent', 'app')
    deploy.wait_http(deploy.container('app')['Id'], '/assistant', 404)
    if deploy.container('caddy')['Id'] != caddy['Id']: raise deploy.DeployError('Caddy identity changed')
    deploy.update_state(folder, state, status='deployed-disabled', disabledAt=int(time.time()))
    return {'status': 'DISABLED', 'releaseId': identity, 'runtimePreserved': True, 'modelCalls': 0}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__); commands = parser.add_subparsers(dest='command', required=True)
    for name in ['prepare', 'backup', 'maintain', 'disable']:
        command = commands.add_parser(name); command.add_argument('--release', required=True)
    command = commands.add_parser('activate'); command.add_argument('--release', required=True)
    command.add_argument('--off-host-receipt', required=True); command.add_argument('--config-stdin', action='store_true', required=True)
    args = parser.parse_args(argv); lock = None
    try:
        def interrupted(_number, _frame):
            raise InterruptedError('Operations interrupted')
        signal.signal(signal.SIGTERM, interrupted)
        if hasattr(signal, 'SIGHUP'): signal.signal(signal.SIGHUP, interrupted)
        if not hasattr(os, 'geteuid') or os.geteuid() != 0: raise deploy.DeployError('Linux root is required')
        root = deploy.ROOT
        if root.is_symlink() or root.resolve() != root or root.stat().st_uid != 0 or root.stat().st_mode & 0o077:
            raise deploy.DeployError('Protected release root required')
        import fcntl
        descriptor = os.open(root / '.deploy.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        lock = os.fdopen(descriptor, 'w'); fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.command == 'activate':
            raw = sys.stdin.read(16385)
            if len(raw) > 16384: raise deploy.DeployError('Activation input too large')
            result = activate(args.release, args.off_host_receipt, json.loads(raw))
        else: result = {'prepare': prepare, 'backup': backup, 'maintain': maintain, 'disable': disable}[args.command](args.release)
        print(json.dumps(result, ensure_ascii=False, indent=2)); return 0
    except (deploy.DeployError, OSError, ValueError, KeyError, TypeError):
        print('Operations stopped: prerequisites, protected proof or health checks failed; credentials withheld.', file=sys.stderr)
        return 2
    finally:
        if lock is not None: lock.close()


if __name__ == '__main__': raise SystemExit(main())
