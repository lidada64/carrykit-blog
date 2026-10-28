import copy
import unittest
from unittest.mock import patch
import upgrade_agent as upgrade
from test_production_ops import config


class UpgradeBoundaryTests(unittest.TestCase):
    def test_migration_uses_target_image_private_mount_and_runtime_uid(self):
        from pathlib import PurePosixPath
        image='sha256:'+'a'*64
        with patch.object(upgrade.deploy,'docker',return_value='MIGRATED: schema v1') as docker:
            upgrade.migrate_runtime(image,restored_root=PurePosixPath('/private/backup'))
            args=docker.call_args.args
            self.assertIn(image,args)
            self.assertIn('10001:10001',args)
            self.assertIn('type=bind,src=/private/backup,dst=/backups',args)
            self.assertEqual(args[-1],'/backups/restore-proof')
            upgrade.migrate_runtime(image)
            args=docker.call_args.args
            self.assertIn('type=volume,src=carrykit-blog_agent-runtime,dst=/data/runtime',args)
            self.assertEqual(args[-1],'/data/runtime')

    def test_unconfirmed_migration_blocks_upgrade(self):
        with patch.object(upgrade.deploy,'docker',return_value='not migrated'):
            with self.assertRaises(upgrade.deploy.DeployError):
                upgrade.migrate_runtime('sha256:'+'a'*64)

    def test_only_agent_image_resource_and_capacity_change(self):
        before=config()
        before['services']['agent']['environment'].update(AGENT_DAILY_COST_LIMIT='1',AGENT_SUBJECT_DAILY_COST_LIMIT='0.10')
        original=copy.deepcopy(before)
        after=upgrade.ops.raw_compose(upgrade.upgraded_config(before,'sha256:'+'a'*64))
        self.assertEqual(before,original)
        self.assertEqual(after['services']['app'],before['services']['app'])
        self.assertEqual(after['services']['agent']['environment']['AGENT_DAILY_COST_LIMIT'],'1')
        self.assertEqual(after['services']['agent']['environment']['AGENT_SUBJECT_DAILY_COST_LIMIT'],'0.5')
        self.assertEqual(after['services']['agent']['environment']['AGENT_MAX_INPUT_BYTES'],'524288')
        self.assertEqual(after['services']['agent']['environment']['AGENT_MAX_OUTPUT_TOKENS'],'8192')

    def test_mutable_tags_are_rejected(self):
        with self.assertRaises(upgrade.deploy.DeployError):
            upgrade.upgraded_config(config(),'agent:latest')

    def test_paired_blog_image_is_explicit_and_other_config_is_preserved(self):
        before=config()
        after=upgrade.ops.raw_compose(upgrade.upgraded_config(before,'sha256:'+'a'*64,'sha256:'+'b'*64))
        self.assertEqual(after['services']['app']['image'],'sha256:'+'b'*64)
        self.assertEqual(after['services']['app']['environment'],before['services']['app']['environment'])
        with self.assertRaises(upgrade.deploy.DeployError):
            upgrade.upgraded_config(before,'sha256:'+'a'*64,'blog:latest')

    def test_stale_proof_never_stops_worker(self):
        with patch.object(upgrade.ops,'release',return_value=(None,None,None,{'Image':'app'},None,{'Image':'agent'})), \
             patch.object(upgrade.deploy,'load_secure',return_value={'expectedAgentImage':'different'}), \
             patch.object(upgrade.deploy,'docker') as docker:
            with self.assertRaises(upgrade.deploy.DeployError):upgrade.upgrade('release',None)
            docker.assert_not_called()
