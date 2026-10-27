from pathlib import Path
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import production_ops as ops


def config():
    secrets = {name: name + '-synthetic-0123456789012345678901234567890123456789'
               for name in ['SESSION_SECRET', 'VISITOR_SESSION_SECRET', 'AGENT_REQUEST_SECRET', 'AGENT_CONTENT_SECRET']}
    return {'services': {'app': {'environment': {**secrets, 'ASSISTANT_ENABLED': 'false'}},
                         'agent': {'environment': {key: secrets[key] for key in ['AGENT_REQUEST_SECRET', 'AGENT_CONTENT_SECRET']}}}}


class ActivationTests(unittest.TestCase):
    def test_disable_removes_provider_key_without_resetting_runtime(self):
        current = ops.activation_config(config(), {'modelApiKey': 'synthetic-provider-key'})
        release = (Path('/protected/release'), {'status': 'public-enabled'}, {}, {}, {'Id': 'caddy'}, {})
        with patch.object(ops, 'release', return_value=release), patch.object(ops.deploy, 'load_secure', return_value=current), \
             patch.object(ops, 'replace_json') as saved, patch.object(ops.deploy, 'compose'), \
             patch.object(ops.deploy, 'container', side_effect=[{'Id': 'app'}, {'Id': 'caddy'}]), \
             patch.object(ops.deploy, 'wait_http'), patch.object(ops.deploy, 'update_state'):
            result = ops.disable('release')
            value = ops.raw_compose(saved.call_args.args[1])
            self.assertEqual(value['services']['app']['environment']['ASSISTANT_ENABLED'], 'false')
            self.assertNotIn('AGENT_MODEL_API_KEY', value['services']['agent']['environment'])
            self.assertTrue(result['runtimePreserved'])

    def test_activation_preserves_session_and_fixes_approved_limits(self):
        source = config(); source['services']['app']['environment']['SESSION_SECRET'] += '$$literal'
        # Input is already escaped JSON Compose, as on the actual server.
        source = ops.deploy.escape_compose(source)
        activated = ops.raw_compose(ops.activation_config(source, {'modelApiKey': 'synthetic-provider-key'}))
        app = activated['services']['app']['environment']; agent = activated['services']['agent']['environment']
        self.assertTrue(app['SESSION_SECRET'].endswith('$$literal'))
        self.assertEqual(app['ASSISTANT_TRUST_PROXY_HEADER'], 'true')
        self.assertEqual(agent['AGENT_DAILY_COST_LIMIT'], '1')
        self.assertEqual(agent['AGENT_SUBJECT_DAILY_COST_LIMIT'], '0.5')
        self.assertEqual(agent['AGENT_MAX_CONCURRENT_RUNS'], '1')
        self.assertEqual(agent['AGENT_MODEL_BASE_URL'], 'https://api.deepseek.com')

    def test_larger_or_different_limits_rejected_without_secret_in_error(self):
        for update in [{'dailyLimit': '2'}, {'subjectLimit': '1'}, {'dailyLimit': 1},
                       {'model': 'other'}, {'modelApiKey': 'bad\ncredential'}]:
            credentials = {'modelApiKey': 'private-not-for-logs', **update}
            with self.assertRaises(ops.deploy.DeployError) as error:
                ops.activation_config(config(), credentials)
            self.assertNotIn('private-not-for-logs', str(error.exception))
            self.assertNotIn('credential', str(error.exception))

    def test_distinct_signing_and_visitor_secrets_required(self):
        source = config(); source['services']['app']['environment']['VISITOR_SESSION_SECRET'] = source['services']['app']['environment']['SESSION_SECRET']
        with self.assertRaises(ops.deploy.DeployError):
            ops.activation_config(source, {'modelApiKey': 'synthetic-provider-key'})

    def test_no_backup_proof_cannot_execute_activation_commands(self):
        with patch.object(ops.deploy, 'load_secure', side_effect=ops.deploy.DeployError('Missing proof')):
            with patch.object(ops.deploy, 'docker') as docker:
                with self.assertRaises(ops.deploy.DeployError):
                    ops.require_activation_proof(Path('/protected/release'), 'release', '/receipt')
                docker.assert_not_called()

    def test_unverified_offhost_receipt_rejected(self):
        values = [{'status': 'PREPARED', 'releaseId': 'release', 'agentBackupManifestSha256': 'hash'},
                  {'manifestSha256': 'hash', 'databaseSha256': 'db'},
                  {'releaseId': 'release', 'offHostVerified': False, 'agentBackupManifestSha256': 'hash', 'agentDatabaseSha256': 'db'}]
        with patch.object(ops.deploy, 'load_secure', side_effect=values):
            with self.assertRaises(ops.deploy.DeployError):
                ops.require_activation_proof(Path('/protected/release'), 'release', '/receipt')

    def test_activation_failure_restores_disabled_compose(self):
        original = ops.deploy.escape_compose(config())
        release = (Path('/protected/release'), {'status': 'deployed-disabled'},
                   {'expectedServerAddress': '192.0.2.1'}, {}, {'Id': 'caddy'}, {})
        calls = []
        def compose(*args):
            calls.append(args)
            if len(calls) == 2: raise ops.deploy.DeployError('synthetic failure')
        with patch.object(ops, 'release', return_value=release), patch.object(ops, 'require_activation_proof'), \
             patch.object(ops.deploy, 'load_secure', return_value=original), patch.object(ops, 'replace_json') as saved, \
             patch.object(ops.deploy, 'compose', side_effect=compose), patch.object(ops.deploy, 'update_state') as state:
            with self.assertRaises(ops.deploy.DeployError) as error:
                ops.activate('release', '/receipt', {'modelApiKey': 'synthetic-provider-key'})
            self.assertNotIn('synthetic-provider-key', str(error.exception))
            self.assertEqual(saved.call_args.args[1], original)
            self.assertEqual(state.call_args.kwargs['status'], 'deployed-disabled')


class ProxyAndTimerTests(unittest.TestCase):
    def test_plain_proxy_overrides_client_header_from_socket_peer(self):
        candidate = ops.caddy_header('{$SITE_DOMAIN} {\n\tencode gzip\n\treverse_proxy app:3000\n}\n')
        self.assertIn('header_up X-Carrykit-Client-IP {http.request.remote.host}', candidate)
        self.assertEqual(candidate.count('reverse_proxy'), 1)
        self.assertNotIn('X-Forwarded-For', candidate)

    def test_complex_or_multiple_proxies_require_review(self):
        for source in ['reverse_proxy app:3000 {\n header_up Foo bar\n}',
                       'reverse_proxy app:3000\nreverse_proxy app:3000\n',
                       'reverse_proxy app:3000\nreverse_proxy http://app:3000\n',
                       'reverse_proxy app:3000\nreverse_proxy {\n to app:3000\n}\n',
                       'reverse_proxy other:3000\n', 'route {\nrespond OK\n}']:
            with self.assertRaises(ops.deploy.DeployError): ops.caddy_header(source)

    def test_two_site_config_changes_only_the_unique_blog_proxy(self):
        blog = 'carrykit.example.invalid {\n  encode gzip\n  reverse_proxy app:3000\n}\n'
        foreign = '\n# Independent service: preserve byte for byte.\nsrv.example.invalid {\n\tencode zstd gzip\n\treverse_proxy srv-app:3000 {\n\t\theader_up X-Existing untouched\n\t}\n}\n'
        source = blog + foreign
        candidate = ops.caddy_header(source)
        self.assertEqual(candidate, ops.caddy_header(blog) + foreign)
        self.assertTrue(candidate.endswith(foreign))
        self.assertEqual(candidate.count('header_up X-Carrykit-Client-IP'), 1)

    def test_non_app_proxies_and_commented_targets_are_untouched(self):
        prefix = '# Example only: reverse_proxy app:3000\nother.example.invalid {\n reverse_proxy other:80\n}\n'
        target = 'carrykit.example.invalid {\n reverse_proxy app:3000\n}\n'
        suffix = 'third.example.invalid {\n reverse_proxy app:30000\n}\n'
        self.assertEqual(ops.caddy_header(prefix + target + suffix), prefix + ops.caddy_header(target) + suffix)

    def test_bound_file_write_preserves_inode(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'Caddyfile'; path.write_bytes(b'original')
            inode = path.stat().st_ino
            ops.write_bound_file(path, b'new')
            self.assertEqual(path.stat().st_ino, inode)
            self.assertEqual(path.read_bytes(), b'new')

    def test_timers_use_explicit_timezone_and_contain_no_secrets(self):
        units = ops.systemd_units('release-01', Path('/opt/carrykit-blog/incoming/release-01/production_ops.py'))
        self.assertIn('03:15:00 Asia/Shanghai', units['carrykit-agent-backup.timer'])
        self.assertIn('OnCalendar=hourly', units['carrykit-agent-maintenance.timer'])
        self.assertNotIn('API_KEY', ''.join(units.values()))
        self.assertIn('UMask=0077', units['carrykit-agent-backup.service'])


class MaintenanceSafetyTests(unittest.TestCase):
    def test_backup_stop_failure_still_restarts_agent(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / 'release'; folder.mkdir()
            backups = folder / 'agent-backups'; backups.mkdir()
            release = (folder, {}, {}, {}, {}, {'Id': 'agent'})
            calls = []
            def docker(*args, **kwargs):
                calls.append(args)
                if args[0] == 'stop': raise ops.deploy.DeployError('failed stop')
                return ''
            with patch.object(ops, 'release', return_value=release), patch.object(ops, 'wait_idle', return_value=True), \
                 patch.object(ops, 'require_agent_uid'), patch.object(ops, 'marked_backup_root', return_value=backups), \
                 patch.object(ops.os, 'chown', create=True), patch.object(ops.deploy, 'docker', side_effect=docker):
                with self.assertRaises(ops.deploy.DeployError): ops.backup('release')
                self.assertEqual(calls[-1], ('start', 'agent'))

    def test_backup_marker_is_outside_strict_snapshot_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / 'release'; folder.mkdir()
            backups = folder / 'agent-backups'; backups.mkdir()
            release = (folder, {}, {}, {}, {}, {'Id': 'agent'})
            def helper(agent, arguments, *, backup_root, **kwargs):
                if arguments[0] == 'backup':
                    data = backup_root / 'data'; data.mkdir(); (data / 'manifest.json').write_text('{"files":[]}')
                    self.assertFalse((data / 'managed-backup.json').exists())
                    self.assertTrue((backup_root / 'managed-backup.json').exists())
                    return {'status': 'BACKED_UP', 'databaseSha256': 'synthetic-db-hash'}
                self.assertEqual(arguments[arguments.index('--restore-dir') + 1], '/backups/restore-proof')
                return {'status': 'RESTORED'}
            with patch.object(ops, 'release', return_value=release), patch.object(ops, 'wait_idle', return_value=True), \
                 patch.object(ops, 'require_agent_uid'), patch.object(ops, 'marked_backup_root', return_value=backups), \
                 patch.object(ops.os, 'chown', create=True), patch.object(ops.deploy, 'docker'), \
                 patch.object(ops, 'maintenance_command', side_effect=helper), patch.object(ops, 'prune_backups', return_value=0):
                result = ops.backup('release')
                self.assertEqual(result['status'], 'VERIFIED')
                self.assertEqual(result['databaseSha256'], 'synthetic-db-hash')

    def test_retention_only_removes_marked_expired_copies(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / 'release'; folder.mkdir(); backups = folder / 'agent-backups'; backups.mkdir()
            expired = backups / '20261019T000000Z-1234abcd'; expired.mkdir()
            live = backups / '20261027T000000Z-abcd1234'; live.mkdir()
            for item, created in [(expired, 1), (live, 1000000)]:
                (item / 'managed-backup.json').write_text(json.dumps({'owner': ops.OPS_MARKER, 'releaseId': 'release', 'createdAt': created}))
                (item / 'runtime.sqlite').write_bytes(b'synthetic backup copy')
            with patch.object(ops, 'marked_backup_root', return_value=backups), \
                 patch.object(ops.deploy, 'load_secure', side_effect=lambda path: json.loads(Path(path).read_text())):
                self.assertEqual(ops.prune_backups(folder, now=1000000), 1)
            self.assertFalse(expired.exists()); self.assertTrue(live.exists())

    def test_busy_service_skips_without_stop(self):
        release = (Path('/protected/release'), {}, {}, {}, {}, {})
        with patch.object(ops, 'release', return_value=release), patch.object(ops, 'wait_idle', return_value=False), \
             patch.object(ops.deploy, 'docker') as docker:
            self.assertEqual(ops.maintain('release')['status'], 'SKIPPED_BUSY')
            docker.assert_not_called()

    def test_cleanup_failure_keeps_agent_closed_and_records_attention(self):
        release = (Path('/protected/release'), {}, {}, {}, {}, {'Id': 'agent'})
        with patch.object(ops, 'release', return_value=release), patch.object(ops, 'wait_idle', return_value=True), \
             patch.object(ops, 'require_agent_uid'), \
             patch.object(ops, 'maintenance_command', side_effect=ops.deploy.DeployError('failure')), \
             patch.object(ops.deploy, 'docker') as docker, patch.object(ops.deploy, 'update_state') as state:
            with self.assertRaises(ops.deploy.DeployError): ops.maintain('release')
            self.assertEqual(docker.call_args.args, ('stop', '--time', '30', 'agent'))
            self.assertFalse(any(call.args[0] == 'start' for call in docker.call_args_list))
            self.assertEqual(state.call_args.kwargs['status'], 'ops-attention')

    def test_complete_retention_pass_restarts_only_after_all_cleanup(self):
        release = (Path('/protected/release'), {}, {}, {'Id': 'app'}, {}, {'Id': 'agent'})
        with patch.object(ops, 'release', return_value=release), patch.object(ops, 'wait_idle', return_value=True), \
             patch.object(ops, 'require_agent_uid'), patch.object(ops, 'maintenance_command', return_value={'status': 'CLEANED'}), \
             patch.object(ops, 'prune_backups', return_value=0), \
             patch.object(ops.deploy, 'docker', return_value='{"expiredRowsDeleted":0}') as docker:
            result = ops.maintain('release')
            self.assertEqual(result['status'], 'MAINTAINED')
            self.assertEqual(docker.call_args.args, ('start', 'agent'))

    def test_expired_next_row_cleanup_failure_also_keeps_worker_closed(self):
        release = (Path('/protected/release'), {}, {}, {'Id': 'app'}, {}, {'Id': 'agent'})
        def docker(*args, **kwargs):
            if args[0] == 'exec': raise ops.deploy.DeployError('Next cleanup failed')
            return ''
        with patch.object(ops, 'release', return_value=release), patch.object(ops, 'wait_idle', return_value=True), \
             patch.object(ops, 'require_agent_uid'), patch.object(ops, 'maintenance_command', return_value={'status': 'CLEANED'}), \
             patch.object(ops.deploy, 'docker', side_effect=docker) as execute, patch.object(ops.deploy, 'update_state') as state:
            with self.assertRaises(ops.deploy.DeployError): ops.maintain('release')
            self.assertFalse(any(call.args[0] == 'start' for call in execute.call_args_list))
            self.assertEqual(state.call_args.kwargs['status'], 'ops-attention')

    def test_backup_source_volume_rw_for_sqlite_exclusive_lock(self):
        with patch.object(ops.deploy, 'docker', return_value='{"status":"BACKED_UP"}') as docker:
            ops.maintenance_command({'Image': 'image'}, ['backup'], backup_root=Path('/backups'))
            arguments = docker.call_args.args
            self.assertIn('type=volume,src=carrykit-blog_agent-runtime,dst=/data/runtime', arguments)
            self.assertIn('none', arguments)
            self.assertIn('--workers-stopped', arguments)
            self.assertIn('10001:10001', arguments)
            self.assertNotIn('DAC_OVERRIDE', arguments)
            self.assertIn('--tmpfs', arguments)
            self.assertIn('/tmp:size=64m,mode=1777', arguments)

    def test_retention_never_follows_unknown_or_symlink_entries(self):
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root); (folder / 'unmarked-user-folder').mkdir()
            with patch.object(ops, 'marked_backup_root', return_value=folder):
                with self.assertRaises(ops.deploy.DeployError): ops.prune_backups(folder, now=1000000)
            self.assertTrue((folder / 'unmarked-user-folder').exists())


if __name__ == '__main__': unittest.main()
