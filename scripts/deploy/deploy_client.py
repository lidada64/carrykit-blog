"""SSH coordinator: audit first, then transfer a verified, disabled release.

Connection details live in an ignored JSON file with host/user/port/identity/
knownHosts. Passwords and private key contents are never read by this program.
"""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

import package_release
import backup_crypto


def command(arguments, *, data=None, capture=True):
    result = subprocess.run(arguments, input=data, stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None)
    if result.returncode:
        raise RuntimeError(f'{Path(arguments[0]).name} failed ({result.returncode}); no credentials echoed')
    return result.stdout if capture else b''


class Connection:
    def __init__(self, path):
        config = json.loads(Path(path).read_text(encoding='utf-8'))
        host = config['host']; user = config['user']; port = config['port']
        if (not re.fullmatch(r'[a-zA-Z0-9.-]+', host)
                or not re.fullmatch(r'[a-z_][a-z0-9_-]*', user)
                or type(port) is not int or not 1 <= port <= 65535):
            raise ValueError('Invalid SSH connection')
        identity = Path(config['identity']).resolve()
        known = Path(config['knownHosts']).resolve()
        if not identity.is_file() or not known.is_file() or '"' in str(known):
            raise ValueError('Existing private key and pinned known-host file required')
        self.destination = user + '@' + host
        self.host = host
        self.common = ['-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
                       '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15',
                       '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4',
                       '-o', 'UserKnownHostsFile="' + known.as_posix() + '"', '-i', str(identity)]
        self.port = str(port)

    def ssh(self, args, *, data=None):
        return command(['ssh', *self.common, '-p', self.port, self.destination,
                        shlex.join(args)], data=data)

    def upload(self, source, destination):
        command(['scp', *self.common, '-P', self.port, str(source),
                 self.destination + ':' + destination], capture=False)

    def download(self, source, destination):
        command(['scp', *self.common, '-P', self.port, self.destination + ':' + source,
                 str(destination)], capture=False)


def audit(connection):
    # Execute the reviewed read-only mode from stdin; no server file is created.
    program = Path(__file__).with_name('remote_deploy.py').read_bytes()
    result = json.loads(connection.ssh(['python3', '-', 'audit'], data=program))
    return result


def protected_directory(path):
    path.mkdir(mode=0o700, parents=True, exist_ok=False)
    if os.name == 'nt':
        owner = command(['whoami']).decode().strip()
        command(['icacls', str(path), '/inheritance:r', '/grant:r', owner + ':(OI)(CI)F'])
    else:
        path.chmod(0o700)


def server_manifest(root, source, address):
    ipaddress.ip_address(address)
    validations = json.loads((root / 'validation.json').read_text(encoding='utf-8'))
    for key in ['blogLint', 'blogBuild', 'agentOffline']:
        if validations.get(key) is not True:
            raise ValueError('Release validation incomplete: ' + key)
    for kind in ['blog', 'agent']:
        if validations.get(kind + 'Revision') != source['sources'][kind]['revision']:
            raise ValueError('Validation report does not match frozen revisions')
    return {
        'releaseId': source['release'], 'project': 'carrykit-blog', 'domain': 'carrykit.top',
        'expectedServerAddress': address,
        'blogRevision': source['sources']['blog']['revision'],
        'agentRevision': source['sources']['agent']['revision'],
        'blogImage': source['images']['blog']['id'], 'agentImage': source['images']['agent']['id'],
        'reviewed': True, 'migrationRollbackCompatible': True,
        'validated': {key: validations[key] for key in ['blogLint', 'blogBuild', 'agentOffline']},
    }


def upload_release(connection, directory):
    root, source = package_release.load_release(directory)
    info = audit(connection)
    (root / 'server-audit.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    if info['os'] != 'linux':
        raise ValueError('Linux server required')
    arch = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(info['architecture'], info['architecture'])
    if any(image['architecture'] != arch for image in source['images'].values()):
        raise ValueError('Server/image architecture mismatch')
    archive = source['imageArchive']; path = root / archive['name']
    if path.name != 'images.tar.gz' or package_release.sha(path) != archive['sha256']:
        raise ValueError('Archive verification failed')
    data = info['dataBytes']
    if any(type(data.get(key)) is not int or data[key] < 0 for key in ['database', 'wal', 'uploads']):
        raise ValueError('Cannot establish database/uploads backup capacity')
    required = (archive['bytes'] * 2 + sum(image['size'] for image in source['images'].values()) * 2
                + (data['database'] + data['wal']) * 2 + data['uploads'] * 3 + 2 * 1024**3)
    if min(info['diskFreeBytes'], info['dockerDiskFreeBytes']) < required:
        raise ValueError('Insufficient conservative disk reserve for import, backup and rollback')
    if info['memory'].get('MemAvailableKiB', 0) < 512 * 1024:
        raise ValueError('Less than 512MiB available; review server capacity before deployment')
    manifest = server_manifest(root, source, connection.host)
    destination = '/opt/carrykit-blog/incoming/' + source['release']
    # No model keys are in these files. mkdir rejects pre-existing release paths.
    connection.ssh(['python3', '-c',
                    'import os,pathlib; p=pathlib.Path(__import__("sys").argv[1]); '
                    'assert p.resolve()==p and not p.exists(); os.umask(0o077); '
                    'p.parent.mkdir(mode=0o700,parents=True,exist_ok=True); p.mkdir(mode=0o700)', destination])
    manifest_path = root / 'server-manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('Uploading compressed release images. The existing website remains running.', flush=True)
    connection.upload(path, destination + '/images.tar.gz')
    connection.upload(manifest_path, destination + '/server-manifest.json')
    connection.upload(root / 'blog/scripts/deploy/remote_deploy.py', destination + '/remote_deploy.py')
    verify = ('import hashlib,sys,pathlib,subprocess; p=pathlib.Path(sys.argv[1]); '
              'h=hashlib.sha256(); f=p.open("rb"); '
              '[h.update(b) for b in iter(lambda:f.read(1048576),b"")]; f.close(); '
              'assert h.hexdigest()==sys.argv[2]; '
              'subprocess.run(["docker","load","--input",str(p)],check=True,stdout=subprocess.DEVNULL)')
    connection.ssh(['python3', '-c', verify, destination + '/images.tar.gz', archive['sha256']])
    result = connection.ssh(['python3', destination + '/remote_deploy.py', 'prepare',
                             '--manifest', destination + '/server-manifest.json'])
    print(result.decode())
    return source['release'], destination


def operations_source(root, manifest):
    """Operations can have an explicit frozen patch revision without relabeling app images."""
    controller = manifest.get('opsController')
    if controller is None:
        return (root / 'blog/scripts/deploy/production_ops.py',
                manifest['sources']['blog']['contextFiles']['scripts/deploy/production_ops.py'])
    if (not isinstance(controller, dict)
            or not re.fullmatch(r'[0-9a-f]{40}', str(controller.get('revision', '')))
            or not re.fullmatch(r'[0-9a-f]{64}', str(controller.get('sha256', '')))):
        raise ValueError('Invalid frozen operations-controller proof')
    path = root / controller['path']
    if path.resolve() != path.absolute() or not path.resolve().is_relative_to(root.resolve()) or path.is_symlink():
        raise ValueError('Operations-controller source must stay inside the release')
    return path, controller['sha256']


def verified_prepared_result(connection, destination, identity):
    """Resume a completed server-owned prepare job without repeating its mutations."""
    program = '''import sys,json,pathlib
sys.path.insert(0,sys.argv[1]);import production_ops as ops
folder,state,manifest,app,caddy,agent=ops.release(sys.argv[2],activation=True)
proof=ops.deploy.load_secure(folder/'ops-proof.json');backup=ops.deploy.load_secure(folder/'agent-backup-proof.json')
assert proof.get('status')=='PREPARED' and proof.get('releaseId')==sys.argv[2]
assert backup.get('status')=='VERIFIED' and backup.get('restored') is True
assert proof.get('agentBackupManifestSha256')==backup.get('manifestSha256')
assert ops.sha(pathlib.Path(proof['proxy']['source']))==proof['proxy']['sha256']
assert agent.get('State',{}).get('Running') is True
for unit in ['carrykit-agent-maintenance.timer','carrykit-agent-backup.timer']:
 assert ops.deploy.run(['systemctl','is-active',unit]).strip()=='active'
print(json.dumps({'status':'PREPARED','releaseId':sys.argv[2],'agentBackup':backup,'resumed':True,'modelCalls':0}))
'''
    return connection.ssh(['python3', '-c', program, destination, identity])


def activate_release(connection, directory, local_backups, credentials, *, resume_prepared=False):
    root, source = package_release.load_release(directory)
    identity = source['release']
    destination = '/opt/carrykit-blog/incoming/' + identity
    ops, expected = operations_source(root, source)
    if package_release.sha(ops) != expected:
        raise ValueError('Frozen operations script changed')
    connection.upload(ops, destination + '/production_ops.py')
    if source.get('opsController'):
        proof_path = root / 'ops-controller-proof.json'
        proof_path.write_text(json.dumps(source['opsController'], indent=2), encoding='utf-8')
        connection.upload(proof_path, destination + '/ops-controller-proof.json')
        connection.ssh(['chmod', '600', destination + '/ops-controller-proof.json'])
    print('Verifying trusted proxy, runtime backup/restore and maintenance timers.', flush=True)
    if resume_prepared:
        prepared_bytes = verified_prepared_result(connection, destination, identity)
    else:
        prepared_bytes = connection.ssh(['python3', destination + '/production_ops.py', 'prepare', '--release', identity])
    prepared = json.loads(prepared_bytes)
    proof = prepared['agentBackup']
    remote = proof['backupDirectory']
    prefix = '/opt/carrykit-blog/releases/' + identity + '/agent-backups/'
    if not remote.startswith(prefix) or '..' in remote.split('/') or not remote.endswith('/data'):
        raise ValueError('Unexpected managed backup location')
    local = Path(local_backups).resolve() / identity / 'agent'
    protected_directory(local)
    connection.download(remote + '/manifest.json', local / 'manifest.json')
    if package_release.sha(local / 'manifest.json') != proof['manifestSha256']:
        raise ValueError('Agent backup manifest hash mismatch')
    manifest = json.loads((local / 'manifest.json').read_text(encoding='utf-8'))
    seen = set()
    for entry in manifest['files']:
        name = entry['path']
        artifact = re.fullmatch(r'sessions/([0-9a-f]{64})/artifacts/\1/[0-9a-f]{64}\.json', name)
        if name in seen or name != 'runtime.sqlite' and not artifact:
            raise ValueError('Unexpected backup file path')
        seen.add(name)
        path = local / name
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        payload = connection.ssh(['cat', remote + '/' + name])
        if len(payload) != entry['bytes']:
            raise ValueError('Off-host runtime artifact verification failed')
        protected = backup_crypto.protect(payload, Path(str(path) + '.dpapi'), entry['sha256'])
        (Path(str(path) + '.encryption.json')).write_text(json.dumps(protected), encoding='utf-8')
        if name == 'runtime.sqlite' and protected['plaintextSha256'] != proof['databaseSha256']:
            raise ValueError('Off-host Agent database verification failed')
    if 'runtime.sqlite' not in seen:
        raise ValueError('Off-host Agent database verification failed')
    receipt = {'releaseId': identity, 'offHostVerified': True,
               'agentBackupManifestSha256': proof['manifestSha256'],
               'agentDatabaseSha256': proof['databaseSha256']}
    path = local / 'receipt.json'; path.write_text(json.dumps(receipt), encoding='utf-8')
    receipt_path = destination + '/agent-off-host-receipt.json'
    connection.upload(path, receipt_path); connection.ssh(['chmod', '600', receipt_path])
    (local / 'prepare-result.json').write_bytes(prepared_bytes)
    print('Off-host runtime backup verified; enabling the authorized daily limits.', flush=True)
    activated = connection.ssh(['python3', destination + '/production_ops.py', 'activate',
                                 '--release', identity, '--off-host-receipt', receipt_path, '--config-stdin'],
                                data=json.dumps(credentials).encode('utf-8'))
    (local / 'activation-result.json').write_bytes(activated)
    print(activated.decode())


def backup_and_apply(connection, identity, destination, local_backups):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', identity):
        raise ValueError('Invalid release ID')
    script = destination + '/remote_deploy.py'
    print('Creating a quiescent backup and checking migrations in an isolated volume.', flush=True)
    print(connection.ssh(['python3', script, 'backup', '--release', identity]).decode())
    local = Path(local_backups).resolve() / identity
    protected_directory(local)
    remote = '/opt/carrykit-blog/releases/' + identity + '/backup/'
    connection.download(remote + 'report.json', local / 'report.json')
    report = json.loads((local / 'report.json').read_text(encoding='utf-8'))
    for filename, key in [('blog.db', 'databaseSha256'), ('uploads.tar', 'uploadsSha256')]:
        payload = connection.ssh(['cat', remote + filename])
        protected = backup_crypto.protect(payload, local / (filename + '.dpapi'), report[key])
        (local / (filename + '.encryption.json')).write_text(json.dumps(protected), encoding='utf-8')
    receipt = {'releaseId': identity, 'offHostVerified': True,
               'databaseSha256': report['databaseSha256'], 'uploadsSha256': report['uploadsSha256']}
    local_receipt = local / 'off-host-receipt.json'
    local_receipt.write_text(json.dumps(receipt), encoding='utf-8')
    target = destination + '/off-host-receipt.json'
    connection.upload(local_receipt, target)
    connection.ssh(['chmod', '600', target])
    print('Off-host backup verified. Deploying the disabled image pair.', flush=True)
    result = connection.ssh(['python3', script, 'apply', '--release', identity,
                             '--off-host-receipt', target])
    (local / 'deployment-result.json').write_bytes(result)
    print(result.decode())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--connection', required=True)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('audit')
    p = commands.add_parser('deploy'); p.add_argument('directory'); p.add_argument('--backup-dir', required=True)
    p = commands.add_parser('activate'); p.add_argument('directory'); p.add_argument('--backup-dir', required=True)
    p.add_argument('--credentials-stdin', action='store_true', required=True)
    p.add_argument('--resume-prepared', action='store_true', help='Verify and resume an already-completed server prepare task')
    args = parser.parse_args(); connection = Connection(args.connection)
    if args.command == 'audit':
        print(json.dumps(audit(connection), indent=2))
    elif args.command == 'deploy':
        identity, destination = upload_release(connection, args.directory)
        backup_and_apply(connection, identity, destination, args.backup_dir)
    else:
        raw = sys.stdin.read(16385)
        if len(raw) > 16384:
            raise ValueError('Credential input too large')
        activate_release(connection, args.directory, args.backup_dir, json.loads(raw), resume_prepared=args.resume_prepared)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, KeyError, OSError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
