"""Guard the release source boundary, independently of Docker or production access."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import package_release as release


class ReleaseBoundaryTests(unittest.TestCase):
    def test_build_context_change_cannot_claim_the_frozen_revision(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root); source = path / 'app.py'
            source.write_text('original', encoding='utf-8')
            expected = {'app.py': release.sha(source)}
            release.verify_context(path, expected)
            source.write_text('different', encoding='utf-8')
            with self.assertRaises(ValueError): release.verify_context(path, expected)

    def test_private_environment_is_rejected_even_inside_an_allowed_directory(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root); (path / 'web').mkdir()
            (path / 'web' / '.env').write_text('secret=test', encoding='utf-8')
            with self.assertRaises(ValueError):
                release.overlay_files(path, ['web'])

    def test_only_explicit_paths_are_selected_and_generated_python_is_excluded(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root); (path / 'web').mkdir(); (path / 'private').mkdir()
            (path / 'web' / 'app.py').write_text('pass', encoding='utf-8')
            (path / 'private' / 'article.md').write_text('private', encoding='utf-8')
            (path / 'web' / '__pycache__').mkdir()
            (path / 'web' / '__pycache__' / 'app.pyc').write_bytes(b'compiled')
            self.assertEqual([name for name, _ in release.overlay_files(path, ['web'])], ['web/app.py'])

    def test_unfrozen_manifest_cannot_build_or_export(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'release.json').write_text('{"status":"review-only","sources":{}}')
            with self.assertRaises(ValueError):
                release.load_release(root)

    def test_changed_git_baseline_stops_before_any_source_write(self):
        with patch.object(release, 'run', return_value=b'not-the-approved-baseline\n') as command:
            with self.assertRaises(ValueError):
                release.source_snapshot(Path('.'), 'blog', [], 'test-release', True)
            self.assertEqual(command.call_count, 1)


if __name__ == '__main__':
    unittest.main()
