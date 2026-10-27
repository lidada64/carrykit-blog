"""Build an explicit two-repository release without staging unrelated working changes.

Prepare creates immutable source snapshots and optional local release refs. Docker
build/export are separate commands; none connects to a server or calls a model.
"""
import argparse
import hashlib
import gzip
import io
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tarfile
import tempfile

BLOG_PATHS = (
    'Dockerfile', '.dockerignore', '.env.example', 'eslint.config.mjs',
    'prisma/schema.prisma', 'prisma/migrations/20261026064659_assistant_visitor_identity',
    'src/lib/assistant', 'src/app/(site)/assistant', 'src/components/assistant',
    'src/app/api/assistant', 'src/app/api/internal/agent-content',
    'src/i18n/en.ts', 'src/i18n/zh.ts', 'scripts/deploy',
    'src/components/blog/blog-list.tsx',
    'docker-compose.agent.yml', 'docker-compose.preflight.yml',
)
AGENT_PATHS = (
    'Dockerfile', '.dockerignore', 'requirements-web.in', 'requirements-web.lock',
    'code/blog_assistant/web', 'code/test_web_http.py',
    'code/test_web_runtime.py', 'code/test_web_signing.py',
    'code/test_web_maintenance.py', 'code/test_agent_conversation.py',
    'code/test_agent_reasoning.py',
    'requirements-embedding.txt', 'code/blog_assistant', 'code/agent_core',
    'code/test_web_retrieval.py', 'code/test_web_agent.py',
)
EXPECTED_BASE = {
    'blog': '94beebf8ea1fbed93de58aa8325c24aa6fe3fca0',
    'agent': '28372a3a155826559a8852a32fb74f9cefb21402',
}


def run(args, *, cwd=None, env=None, data=None):
    result = subprocess.run(args, cwd=cwd, env=env, input=data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        # Commands never include credentials. Do not echo Docker's expanded environment.
        raise RuntimeError(f'{Path(str(args[0])).name} failed ({result.returncode})')
    return result.stdout


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def overlay_files(repository, allowed):
    """Only explicit source; reject links and secret/runtime files in allowed dirs."""
    files = []
    for name in allowed:
        source = repository / name
        if not source.exists() or source.is_symlink():
            raise ValueError('Missing source or source alias: ' + name)
        for path in sorted(source.rglob('*')) if source.is_dir() else [source]:
            if '__pycache__' in path.parts:
                continue
            if path.is_symlink():
                raise ValueError('Source aliases are unsupported')
            if path.is_dir():
                continue
            if (path.name.startswith('.env') and path.name != '.env.example'
                    or path.suffix.lower() in {'.db', '.sqlite', '.pem', '.key', '.pyc'}):
                raise ValueError('Runtime/secret file in source allowlist')
            files.append((path.relative_to(repository).as_posix(), path))
    # Overlapping explicit boundaries must not re-hash/write the same blob.
    return sorted({name:path for name,path in files}.items())


def source_snapshot(repository, kind, allowed, release, freeze):
    base = run(['git', 'rev-parse', 'HEAD'], cwd=repository).decode().strip()
    if base != EXPECTED_BASE[kind]:
        raise ValueError(kind + ' HEAD changed; review and update the explicit release baseline')
    ref = 'refs/heads/codex/deploy-' + release
    existing = subprocess.run(['git', 'show-ref', '--verify', '--quiet', ref], cwd=repository)
    if existing.returncode == 0:
        raise ValueError('Release ref already exists; choose another release ID')
    with tempfile.TemporaryDirectory(prefix='carrykit-index-') as directory:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(directory) / 'index'))
        run(['git', 'read-tree', base], cwd=repository, env=env)
        if kind=='agent':
            allowed=tuple(allowed)+('code/blog_agent.py','code/test_fixtures')+tuple(
                path.relative_to(repository).as_posix() for path in sorted((repository/'code').glob('test_*.py')))
        selected = overlay_files(repository, allowed)
        for name, path in selected:
            blob = run(['git', 'hash-object', '-w', '--stdin'], cwd=repository,
                       data=path.read_bytes()).decode().strip()
            previous = run(['git', 'ls-tree', base, '--', name], cwd=repository).decode()
            mode = previous.split()[0] if previous else '100644'
            run(['git', 'update-index', '--add', '--cacheinfo', mode, blob, name],
                cwd=repository, env=env)
        tree = run(['git', 'write-tree'], cwd=repository, env=env).decode().strip()
    commit = None
    if freeze:
        message = f'chore: freeze {kind} deployment {release}\n\nIntegration-Id: {release}\n'
        commit = run(['git', 'commit-tree', tree, '-p', base], cwd=repository,
                     data=message.encode()).decode().strip()
        # Empty old-value requires a new ref; never overwrite any existing branch.
        run(['git', 'update-ref', ref, commit, '0' * 40], cwd=repository)
    return {'baseRevision': base, 'tree': tree, 'revision': commit,
            'releaseRef': ref if freeze else None,
            'overlay': {name: sha(path) for name, path in selected}}


def prepare(args):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{3,60}', args.release):
        raise ValueError('Use a lowercase release ID with digits and hyphens')
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    repos = {'blog': Path(args.blog).resolve(), 'agent': Path(args.agent).resolve()}
    result = {'release': args.release, 'siteUrl': 'https://carrykit.top',
              'status': 'frozen' if args.freeze else 'review-only', 'sources': {}}
    for kind, allowed in [('blog', BLOG_PATHS), ('agent', AGENT_PATHS)]:
        info = source_snapshot(repos[kind], kind, allowed, args.release, args.freeze)
        source = info['revision'] or info['tree']
        archive = run(['git', 'archive', source], cwd=repos[kind])
        target = output / kind
        target.mkdir()
        with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
            bundle.extractall(target, filter='data')
        if kind == 'agent' and getattr(args,'embedding_runtime',None):
            runtime = Path(args.embedding_runtime).resolve()
            model = json.loads((runtime/'embedding-manifest.json').read_text(encoding='utf-8'))
            if (model.get('model')!='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
                    or model.get('runtime')!='fastembed-0.9.0' or model.get('dimension')!=384
                    or not re.fullmatch(r'[a-f0-9]{40}',model.get('revision',''))):
                raise ValueError('Approved frozen embedding model required')
            destination = target/'embedding-runtime'
            destination.mkdir()
            shutil.copyfile(runtime/'embedding-manifest.json',destination/'embedding-manifest.json')
            tokenizer=hashlib.sha1(b'https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken').hexdigest()
            token_source=runtime/'tokenizers'/tokenizer
            if not token_source.is_file():
                raise ValueError('Explicit offline article tokenizer is required')
            token_out=destination/'tokenizers'/tokenizer
            token_out.parent.mkdir()
            shutil.copyfile(token_source,token_out)
            name = 'models--Qdrant--paraphrase-multilingual-MiniLM-L12-v2-onnx-Q'
            source = runtime/'embedding-models'/name
            snapshot = source/'snapshots'/model['revision']
            # Only the selected public model, no CLI caches, articles or venv.
            for filename in ['config.json','model_optimized.onnx','special_tokens_map.json','tokenizer_config.json','tokenizer.json']:
                path = snapshot/filename
                out = destination/'embedding-models'/name/'snapshots'/model['revision']/filename
                out.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(path,out)
            reference = destination/'embedding-models'/name/'refs/main'
            reference.parent.mkdir(parents=True)
            reference.write_text(model['revision'],encoding='utf-8')
            info['embeddingAssets'] = model
        info['context'] = kind
        info['contextFiles'] = {path.relative_to(target).as_posix(): sha(path)
                                for path in target.rglob('*') if path.is_file()}
        result['sources'][kind] = info
    (output / 'release.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('Prepared source snapshots:', output)
    print('No working branch or staging area was changed.')


def load_release(directory):
    root = Path(directory).resolve()
    manifest = json.loads((root / 'release.json').read_text(encoding='utf-8'))
    if (manifest.get('status') != 'frozen'
            or not all(info.get('revision') for info in manifest['sources'].values())):
        raise ValueError('Freeze both source revisions before building a production release')
    return root, manifest


def build(args):
    root, manifest = load_release(args.directory)
    if args.platform not in {'linux/amd64', 'linux/arm64'}:
        raise ValueError('Unsupported target platform')
    # Architecture comes from the read-only server audit, never infer it from VPS marketing.
    for kind in ['blog', 'agent']:
        verify_context(root / kind, manifest['sources'][kind]['contextFiles'])
        tag = 'carrykit-' + kind + ':' + manifest['release']
        command = ['docker', 'build', '--platform', args.platform, '--tag', tag,
                   '--label', 'org.opencontainers.image.revision=' + manifest['sources'][kind]['revision']]
        if kind == 'blog':
            command += ['--build-arg', 'SITE_URL=' + manifest['siteUrl']]
        elif args.resolve_pypi:
            # A per-build official-host mapping avoids a broken Docker DNS path.
            # HTTPS still validates the original PyPI names; no global DNS or
            # certificate settings are changed and no mirror is substituted.
            mapping = {}
            for host in ['pypi.org', 'files.pythonhosted.org']:
                address = socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
                command += ['--add-host', host + ':' + address]
                mapping[host] = address
            manifest['pypiBuildResolution'] = mapping
        subprocess.run(command + [str(root / kind)], check=True)
        inspected = json.loads(run(['docker', 'image', 'inspect', tag]))[0]
        manifest.setdefault('images', {})[kind] = {
            'tag': tag, 'id': inspected['Id'], 'size': inspected['Size'],
            'architecture': inspected['Architecture'], 'os': inspected['Os'],
        }
        (root / 'release.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('Built two production-origin images; no deployment or model call performed.')


def verify_context(directory, expected):
    """Frozen source must survive verification unchanged; ignore build outputs only."""
    def generated(name):
        parts = Path(name).parts
        return (any(part in {'.next', 'node_modules', '__pycache__'} for part in parts)
                or name.startswith('src/generated/') or name == 'next-env.d.ts')
    for name, digest in expected.items():
        path = directory / name
        if path.is_symlink() or not path.is_file() or sha(path) != digest:
            raise ValueError('Frozen source context changed: ' + name)
    for path in directory.rglob('*'):
        name = path.relative_to(directory).as_posix()
        if generated(name):
            continue
        if path.is_symlink() or path.is_file() and name not in expected:
            raise ValueError('Unexpected file in frozen context: ' + name)


def export(args):
    root, manifest = load_release(args.directory)
    if set(manifest.get('images', {})) != {'blog', 'agent'}:
        raise ValueError('Build and inspect both images first')
    archive = root / 'images.tar.gz'
    if archive.exists():
        raise ValueError('Preserve existing image archive; use a new release directory')
    process = subprocess.Popen(['docker', 'save'] +
                               [manifest['images'][kind]['tag'] for kind in ['blog', 'agent']],
                               stdout=subprocess.PIPE)
    with gzip.open(archive, 'wb', compresslevel=3) as output:
        shutil.copyfileobj(process.stdout, output, length=1024 * 1024)
    process.stdout.close()
    if process.wait():
        raise RuntimeError('docker save failed; preserve the partial archive for diagnosis')
    manifest['imageArchive'] = {'name': archive.name, 'sha256': sha(archive), 'bytes': archive.stat().st_size}
    (root / 'release.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('Exported image archive with SHA256; contains no deployment credentials.')


def verify(args):
    """Run tests in a separate checkout so test caches cannot taint build sources."""
    root, manifest = load_release(args.directory)
    for kind in ['blog', 'agent']:
        verify_context(root / kind, manifest['sources'][kind]['contextFiles'])
    result = {'blogRevision': manifest['sources']['blog']['revision'],
              'agentRevision': manifest['sources']['agent']['revision'],
              'blogLint': False, 'blogBuild': False, 'agentOffline': False}
    validation_path = root / 'validation.json'
    validation_path.write_text(json.dumps(result, indent=2), encoding='utf-8')
    with (root / 'blog-lint.log').open('wb') as log:
        subprocess.run(['node', str(Path(args.node_dependencies).resolve() / 'eslint/bin/eslint.js'), '.'],
                       cwd=root / 'blog', stdout=log, stderr=subprocess.STDOUT, check=True)
    result['blogLint'] = True
    # Do not put the test source beneath the immutable build context. Some legacy
    # offline tests deliberately generate local SQLite/tokenizer caches.
    source = root / 'verification-agent-source'
    source.mkdir(exist_ok=False)
    archive = run(['git', 'archive', manifest['sources']['agent']['revision']], cwd=args.agent_repository)
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
        bundle.extractall(source, filter='data')
    report = root / 'agent-offline-report'
    with (root / 'agent-offline.log').open('wb') as log:
        subprocess.run([str(Path(args.python).resolve()), str(source / 'code/evaluate_agent.py'),
                        '--mode', 'offline', '--output-dir', str(report)], cwd=source,
                       env={**os.environ,'TIKTOKEN_CACHE_DIR':str(root/'agent/embedding-runtime/tokenizers')},
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    evaluation = json.loads((report / 'report.json').read_text(encoding='utf-8'))
    if evaluation.get('passed') is not True:
        raise ValueError('Unified offline evaluation failed')
    result['agentOffline'] = True
    result['agentTests'] = evaluation['tests']
    latest = json.loads((root / 'release.json').read_text(encoding='utf-8'))
    result['blogBuild'] = 'blog' in latest.get('images', {})
    validation_path.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('Frozen source lint and offline verification passed:', result['agentTests'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('prepare')
    p.add_argument('--blog', required=True); p.add_argument('--agent', required=True)
    p.add_argument('--release', required=True); p.add_argument('--output', required=True)
    p.add_argument('--freeze', action='store_true', help='Create new local release refs; do not checkout/push')
    p.add_argument('--embedding-runtime', help='Approved local MiniLM assets; no CLI data is copied')
    p.set_defaults(action=prepare)
    p = commands.add_parser('build'); p.add_argument('directory'); p.add_argument('--platform', required=True)
    p.add_argument('--resolve-pypi', action='store_true', help='Resolve official PyPI hosts on the workstation for this build only')
    p.set_defaults(action=build)
    p = commands.add_parser('export'); p.add_argument('directory'); p.set_defaults(action=export)
    p = commands.add_parser('verify'); p.add_argument('directory')
    p.add_argument('--python', required=True); p.add_argument('--agent-repository', required=True)
    p.add_argument('--node-dependencies', required=True); p.set_defaults(action=verify)
    args = parser.parse_args(); args.action(args)


if __name__ == '__main__':
    main()
