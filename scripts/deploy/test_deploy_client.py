import json
import contextlib
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from unittest.mock import patch

import deploy_client as client


class SSHBoundaryTests(unittest.TestCase):
    def test_activation_passes_provider_credentials_only_through_explicit_stdin(self):
        credentials = {'modelApiKey': 'synthetic-provider-key-never-in-arguments'}
        for resume in [False, True]:
            with self.subTest(resume_prepared=resume), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                ops = root / 'production_ops.py'; ops.write_text('synthetic frozen controller')
                payload = b'synthetic runtime backup bytes'
                digest = hashlib.sha256(payload).hexdigest()
                manifest_bytes = json.dumps({'files': [{'path': 'runtime.sqlite', 'bytes': len(payload),
                                                       'sha256': digest}]}).encode()
                prepared = json.dumps({'agentBackup': {
                    'backupDirectory': '/opt/carrykit-blog/releases/test-release/agent-backups/20261027T000000Z-1234abcd/data',
                    'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(), 'databaseSha256': digest}}).encode()
                def download(source, destination):
                    self.assertTrue(source.endswith('/manifest.json'))
                    Path(destination).write_bytes(manifest_bytes)
                def ssh(arguments, **kwargs):
                    if arguments[0] == 'cat': return payload
                    if len(arguments) > 2 and arguments[2] == 'prepare': return prepared
                    return b'{"status":"PUBLIC_ENABLED","modelCalls":0}'
                connection = SimpleNamespace(ssh=Mock(side_effect=ssh), upload=Mock(), download=Mock(side_effect=download))
                output = io.StringIO()
                with patch.object(client.package_release, 'load_release', return_value=(root, {'release': 'test-release'})), \
                     patch.object(client, 'operations_source', return_value=(ops, client.package_release.sha(ops))), \
                     patch.object(client, 'protected_directory', side_effect=lambda path: path.mkdir(parents=True)), \
                     patch.object(client.backup_crypto, 'protect', return_value={'plaintextSha256': digest}) as protect, \
                     patch.object(client, 'verified_prepared_result', return_value=prepared) as verify, \
                     contextlib.redirect_stdout(output):
                    client.activate_release(connection, root, root / 'backups', credentials, resume_prepared=resume)
                activation = connection.ssh.call_args
                self.assertEqual(activation.args[0][2], 'activate')
                self.assertIn('--config-stdin', activation.args[0])
                self.assertIn('--off-host-receipt', activation.args[0])
                self.assertEqual(json.loads(activation.kwargs['data']), credentials)
                for call in connection.ssh.call_args_list:
                    self.assertNotIn(credentials['modelApiKey'], json.dumps(call.args))
                    if 'data' in call.kwargs:
                        self.assertEqual(call.args[0][2], 'activate')
                self.assertNotIn(credentials['modelApiKey'], output.getvalue())
                protect.assert_called_once()
                prepare_calls = [call for call in connection.ssh.call_args_list
                                 if len(call.args[0]) > 2 and call.args[0][2] == 'prepare']
                if resume:
                    verify.assert_called_once_with(connection, '/opt/carrykit-blog/incoming/test-release', 'test-release')
                    self.assertEqual(prepare_calls, [])
                else:
                    verify.assert_not_called()
                    self.assertEqual(len(prepare_calls), 1)

    def test_resume_prepared_cli_flag_reaches_the_verified_resume_path(self):
        credentials = {'modelApiKey': 'synthetic-private-key'}
        connection = object()
        arguments = ['deploy_client.py', '--connection', 'private-connection.json', 'activate',
                     'release-directory', '--backup-dir', 'private-backups', '--credentials-stdin', '--resume-prepared']
        with patch('sys.argv', arguments), patch('sys.stdin', io.StringIO(json.dumps(credentials))), \
             patch.object(client, 'Connection', return_value=connection), patch.object(client, 'activate_release') as activate:
            client.main()
        activate.assert_called_once_with(connection, 'release-directory', 'private-backups', credentials,
                                         resume_prepared=True)

    def test_frozen_operations_patch_cannot_escape_the_release(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root).resolve()
            proof = {'revision': 'a' * 40, 'sha256': 'b' * 64, 'path': '../production_ops.py'}
            with self.assertRaises(ValueError): client.operations_source(root, {'opsController': proof})
            proof['path'] = 'ops-patch/production_ops.py'
            self.assertEqual(client.operations_source(root, {'opsController': proof}),
                             (root / proof['path'], proof['sha256']))

    def test_upload_hands_the_verified_release_to_backup_and_uses_frozen_script(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root); archive = root / 'images.tar.gz'; archive.write_bytes(b'synthetic-image-archive')
            revision = 'a' * 40
            (root / 'validation.json').write_text(json.dumps({'blogRevision': revision, 'agentRevision': revision,
                'blogLint': True, 'blogBuild': True, 'agentOffline': True}))
            source = {'release': 'test-release', 'sources': {name: {'revision': revision} for name in ['blog', 'agent']},
                      'images': {name: {'architecture': 'amd64', 'id': 'sha256:' + 'b' * 64, 'size': 1024}
                                 for name in ['blog', 'agent']},
                      'imageArchive': {'name': archive.name, 'sha256': client.package_release.sha(archive),
                                       'bytes': archive.stat().st_size}}
            info = {'os': 'linux', 'architecture': 'x86_64', 'dataBytes': {'database': 1024, 'wal': 0, 'uploads': 0},
                    'diskFreeBytes': 10**12, 'dockerDiskFreeBytes': 10**12,
                    'memory': {'MemAvailableKiB': 1024 * 1024}}
            connection = SimpleNamespace(host='192.0.2.1', ssh=Mock(return_value=b'{"status":"prepared"}'), upload=Mock())
            with patch.object(client.package_release, 'load_release', return_value=(root, source)), \
                    patch.object(client, 'audit', return_value=info):
                self.assertEqual(client.upload_release(connection, root),
                                 ('test-release', '/opt/carrykit-blog/incoming/test-release'))
            self.assertEqual(connection.upload.call_args_list[-1].args[0], root / 'blog/scripts/deploy/remote_deploy.py')

    def test_host_shell_syntax_rejected_before_executing_ssh(self):
        with tempfile.TemporaryDirectory() as root:
            config = Path(root) / 'connection.json'
            config.write_text(json.dumps({'host': 'host;bad', 'user': 'root', 'port': 22}))
            with patch.object(client, 'command') as execute:
                with self.assertRaises(ValueError): client.Connection(config)
                execute.assert_not_called()

    def test_pinned_host_and_explicit_identity_are_always_passed(self):
        with tempfile.TemporaryDirectory(prefix='ssh space ') as root:
            root = Path(root); key = root / 'key'; hosts = root / 'known_hosts'
            key.touch(); hosts.touch()
            path = root / 'connection.json'
            path.write_text(json.dumps({'host': 'example.test', 'user': 'root', 'port': 22,
                                        'identity': str(key), 'knownHosts': str(hosts)}))
            connection = client.Connection(path)
            with patch.object(client, 'command', return_value=b'{}') as execute:
                connection.ssh(['python3', '-c', 'print("a b")'])
                args = execute.call_args.args[0]
                self.assertIn('StrictHostKeyChecking=yes', args)
                self.assertIn('BatchMode=yes', args)
                self.assertIn('IdentitiesOnly=yes', args)
                self.assertIn(str(key.resolve()), args)
                self.assertIn('UserKnownHostsFile="' + hosts.resolve().as_posix() + '"', args)

    def test_different_revision_cannot_reuse_validation(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            (root / 'validation.json').write_text(json.dumps({
                'blogLint': True, 'blogBuild': True, 'agentOffline': True,
                'blogRevision': 'old', 'agentRevision': 'old'}))
            with self.assertRaises(ValueError):
                client.server_manifest(root, {'sources': {'blog': {'revision': 'new'}}}, '192.0.2.1')


if __name__ == '__main__': unittest.main()
