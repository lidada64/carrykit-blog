"""Upgrade the shared Agent, optionally with its explicitly verified Blog image.

Keeps Caddy, volumes, secrets and global visitor cap; personal cap is approved at 0.5. Makes and restores
an actual runtime backup while the worker is stopped. Same schema only; failure
restores the old image/config, never rolls back or removes a database.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import time
import production_ops as ops
import remote_deploy as deploy

PROBE = '''import asyncio,os,json
from pathlib import Path
from blog_assistant.local_embedding import LocalEmbedding
from blog_assistant.article_tokens import article_tokens
async def main():
 e=LocalEmbedding(Path(os.environ['AGENT_EMBEDDING_RUNTIME']),python=os.environ['AGENT_EMBEDDING_PYTHON'])
 try:
  v=await e.encode(['公开博客混合检索'],kind='query',timeout=45)
  assert len(v)==1 and len(v[0])==384
  assert article_tokens('文章全文')>0
  print(json.dumps({'embeddingDimensions':384,'articleTokenizer':True,'network':'none','modelCalls':0}))
 finally:await e.aclose()
asyncio.run(main())'''


def migrate_runtime(image, *, restored_root=None):
    """Explicit migration as the runtime UID, first on an isolated restore."""
    if not deploy.IMAGE.fullmatch(image):
        raise deploy.DeployError('Immutable migration image required')
    mount=('type=bind,src='+str(restored_root)+',dst=/backups' if restored_root is not None
           else 'type=volume,src='+deploy.PROJECT+'_agent-runtime,dst=/data/runtime')
    target='/backups/restore-proof' if restored_root is not None else '/data/runtime'
    result=deploy.docker('run','--rm','--network','none','--read-only','--user','10001:10001',
        '--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/tmp:size=64m,mode=1777',
        '--mount',mount,'--entrypoint','python',image,'-m','blog_assistant.web.migrate','--data-dir',target,timeout=120)
    if not result.startswith('MIGRATED:'):
        raise deploy.DeployError('Target runtime migration unconfirmed')


def upgraded_config(current,image,blog_image=None):
    if not deploy.IMAGE.fullmatch(image):
        raise deploy.DeployError('Immutable target Agent image required')
    candidate=ops.raw_compose(json.loads(json.dumps(current)))
    agent=candidate['services']['agent']
    agent['image']=image
    agent['mem_limit']='768m'
    agent['environment'].update(AGENT_MAX_INPUT_BYTES='524288',AGENT_MAX_OUTPUT_TOKENS='8192')
    agent['environment']['AGENT_SUBJECT_DAILY_COST_LIMIT']='0.5'
    if blog_image is not None:
        if not deploy.IMAGE.fullmatch(blog_image):
            raise deploy.DeployError('Immutable target Blog image required')
        candidate['services']['app']['image']=blog_image
    # The user approved a personal cap increase; all keys/prices/global cap stay.
    return deploy.escape_compose(candidate)


def upgrade(identity,proof_path):
    folder,state,manifest,app,caddy,agent=ops.release(identity)
    proof=deploy.load_secure(proof_path)
    if (proof.get('expectedAgentImage')!=agent['Image'] or proof.get('expectedBlogImage')!=app['Image']
            or not deploy.IMAGE.fullmatch(str(proof.get('agentImage','')))
            or not deploy.REVISION.fullmatch(str(proof.get('agentRevision','')))
            or not deploy.IDENTIFIER.fullmatch(str(proof.get('upgradeId','')))
            or not all(proof.get(k) is True for k in ('agentOffline','blogLint','blogBuild','sourceVerified','parityVerified'))):
        raise deploy.DeployError('Reviewed target and matching current image proofs required')
    image=proof['agentImage']
    deploy.image_verified(image,agent=True)
    inspected=deploy.parsed(deploy.docker('image','inspect',image))[0]
    if inspected['Config'].get('Labels',{}).get('org.opencontainers.image.revision')!=proof['agentRevision']:
        raise deploy.DeployError('Image source revision mismatch')
    if inspected['Config'].get('User')!='agent':
        raise deploy.DeployError('Locked Agent image user required')
    blog_image=proof.get('blogImage')
    if blog_image is not None:
        if not deploy.IMAGE.fullmatch(blog_image) or not deploy.REVISION.fullmatch(str(proof.get('blogRevision',''))):
            raise deploy.DeployError('Immutable paired Blog proof required')
        blog_inspected=deploy.parsed(deploy.docker('image','inspect',blog_image))[0]
        if blog_inspected['Config'].get('Labels',{}).get('org.opencontainers.image.revision')!=proof['blogRevision']:
            raise deploy.DeployError('Blog source revision mismatch')
    info=deploy.audit()
    if info['memory'].get('MemAvailableKiB',0)<768*1024 or min(info['diskFreeBytes'],info['dockerDiskFreeBytes'])<2*1024**3:
        raise deploy.DeployError('Insufficient audited headroom for embedding and backup')
    probe=deploy.parsed(deploy.docker('run','--rm','--network','none','--read-only','--memory','768m','--cpus','0.75',
        '--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/tmp:size=64m,mode=1777',
        '--entrypoint','python',image,'-c',PROBE,timeout=90))
    if probe.get('embeddingDimensions')!=384 or probe.get('articleTokenizer') is not True:
        raise deploy.DeployError('Offline target model/tokenizer probe failed')
    if not ops.wait_idle(agent):
        raise deploy.DeployError('Active work did not drain; upgrade deferred')
    ops.require_agent_uid(agent)
    current=deploy.load_secure(folder/'release.compose.json')
    candidate=upgraded_config(current,image,blog_image)
    location=folder/'upgrades'/proof['upgradeId']
    location.mkdir(mode=0o700,parents=True,exist_ok=False)
    deploy.secure_json(location/'old-manifest.json',manifest)
    deploy.secure_json(location/'old-compose.json',current)
    deploy.secure_json(location/'proof.json',proof)
    root=ops.marked_backup_root(folder)
    stamp=time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+secrets.token_hex(4)
    batch=root/stamp;batch.mkdir(mode=0o700);os.chown(batch,10001,10001)
    deploy.secure_json(batch/'managed-backup.json',dict(owner=ops.OPS_MARKER,releaseId=identity,createdAt=int(time.time())))
    replaced=False
    try:
        deploy.docker('stop','--time','30',agent['Id'])
        report=ops.maintenance_command(agent,['backup','--data-dir','/data/runtime','--backup-dir','/backups/data'],backup_root=batch)
        restored=ops.maintenance_command(dict(agent,Image=image),['restore','--backup-dir','/backups/data','--restore-dir','/backups/restore-proof'],backup_root=batch,readonly=True)
        if report.get('status')!='BACKED_UP' or restored.get('status')!='RESTORED':
            raise deploy.DeployError('Target-image isolated runtime restore failed')
        migrate_runtime(image,restored_root=batch)
        migrate_runtime(image)
        ops.replace_json(folder/'release.compose.json',candidate);replaced=True
        deploy.compose(folder,'release.compose.json','up','-d','--no-deps','--no-build','--pull','never','agent')
        fresh=deploy.container('agent')
        deadline=time.monotonic()+90
        while True:
            try:
                deploy.docker('exec',fresh['Id'],'python','-c',"import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health/ready',timeout=3).read()")
                break
            except deploy.DeployError:
                if time.monotonic()>=deadline:raise
                time.sleep(2)
        if blog_image is not None:
            deploy.compose(folder,'release.compose.json','up','-d','--no-deps','--no-build','--pull','never','app')
            new_app=deploy.container('app')
            if new_app['Image']!=blog_image:
                raise deploy.DeployError('Blog image mismatch')
            mounts=lambda value:sorted((m['Type'],m['Source'],m['Destination']) for m in value.get('Mounts',[]))
            if mounts(new_app)!=mounts(app):
                raise deploy.DeployError('Blog persistent mounts changed')
            deploy.wait_http(new_app['Id'],'/blog',200)
            deploy.wait_http(new_app['Id'],'/assistant',200)
        if (fresh['Image']!=image or fresh['HostConfig'].get('PortBindings')
                or (blog_image is None and deploy.container('app')['Id']!=app['Id']) or deploy.container('caddy')['Id']!=caddy['Id']):
            raise deploy.DeployError('Upgrade crossed service boundary')
        updated=dict(manifest,agentImage=image,agentRevision=proof['agentRevision'])
        if blog_image is not None:updated.update(blogImage=blog_image,blogRevision=proof['blogRevision'])
        ops.replace_json(folder/'manifest.json',updated)
        deploy.update_state(folder,state,lastAgentUpgrade=proof['upgradeId'],agentUpgradedAt=int(time.time()),approvedSubjectLimit='0.5')
    except Exception:
        if replaced:
            ops.replace_json(folder/'release.compose.json',current)
            ops.replace_json(folder/'manifest.json',manifest)
            deploy.compose(folder,'release.compose.json','up','-d','--no-deps','--no-build','--pull','never',*(['agent','app'] if blog_image else ['agent']))
        else:deploy.docker('start',agent['Id'])
        raise
    result=dict(status='UPGRADED',upgradeId=proof['upgradeId'],agentImage=image,agentRevision=proof['agentRevision'],
                blogAndCaddyPreserved=blog_image is None,caddyPreserved=True,blogImage=blog_image,
                subjectDailyLimit='0.5',adminMoneyUnlimited=True,volumesPreserved=True,modelCalls=0,offlineProbe=probe,
                runtimeBackupDirectory=str(batch/'data'),runtimeBackupSha256=report['databaseSha256'],
                isolatedMigrationVerified=True,runtimeMigrated=True)
    deploy.secure_json(location/'result.json',result)
    return result


def main():
    import fcntl
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release',required=True);parser.add_argument('--proof',required=True)
    args=parser.parse_args()
    if os.geteuid()!=0:raise deploy.DeployError('Root required')
    with (deploy.ROOT/'.deploy.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        print(json.dumps(upgrade(args.release,Path(args.proof)),indent=2))


if __name__=='__main__':
    try:main()
    except Exception:
        raise SystemExit('Upgrade stopped; preserved configuration/volumes and withheld private diagnostics') from None
