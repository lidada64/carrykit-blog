2026-10-27 rag09 update: full shared Agent is deployed, with the Blog assistant link. Visitor personal cap is CNY0.50/UTC day; visitor aggregate remains CNY1. Authenticated admin scope bypasses both monetary caps and uses a separate ledger. Sign in through the existing admin login and start a new assistant conversation. Latest verified evidence is in the [capability audit](../../../Agent/docs/public-agent-parity.md). The root operator for future activation must use this updated production_ops.py (the deployed copy is in the rag09-upgrade incoming directory); dated 06 metrics below are historical.

# Carrykit deployment automation

Current production state (2026-10-27): release `carrykit-20261027-06` is
`public-enabled` at `https://carrykit.top/assistant`. Blog revision
`38814f41ddefb2ae12ccc6144d54e253ef416264`; the entire Agent tree equals the
validated release 05 tree (579 tests passed). Final deployment checks: 55 passed.
The actual production backup restored and migrated from three to four Blog
migrations. Existing Caddy/container volumes and the unrelated `srv` remain.
Initial Blog/Agent off-host DPAPI copies were decrypted in memory and verified.
Hourly maintenance and daily 03:15 Asia/Shanghai backup timers are active; one
manually triggered maintenance service completed with exit 0. This does not
claim a scheduled daily backup has already run or continuous off-host delivery.

One authorized real QA completed with the Hooks article source: 1531 input and
56 output tokens; conservative usage-derived CNY 0.003510, not an invoice.
Reload restored the answer/source; accounting remained one run/provider call
after refresh and maintenance. Site/visitor daily caps are CNY1/0.50, resetting
at 00:00 UTC (08:00 China time). Messages expire after 24 hours; backup rotation
is seven days. Working branches/index were preserved and release refs remain
local, without push. Historical candidate failures and full evidence remain in
the ignored release directory; secrets never belong in this README.

Current scope: initial installation into the existing `carrykit-blog` project,
with **both assistant flags false**, followed by guarded public activation. An
existing Agent installation is rejected by the initial deploy command until a
separate reviewed upgrade is prepared. `srv` is outside all update operations;
the existing Caddy container is retained, with a validated header reload during
activation preparation. The preparation preserves other Caddy site blocks; a
multi-site configuration is reviewed and validated rather than replaced.

The Python scripts use the standard library, Git, Docker, OpenSSH and SCP. Build
on the workstation, not the 2GB VPS. The remote host needs Python 3, Docker and
Compose; SQLite backup/restore helpers run in the pinned Agent image. A real
server audit and backup/restore gate precede any app replacement.

1. Install a dedicated public SSH key through an already authenticated client.
   Keep its private key in a protected ignored directory. Create an ignored
   connection JSON containing `host`, `user`, integer `port`, absolute `identity`
   and absolute `knownHosts`. Host verification is strict; reuse a verified host
   record, never disable checking. Do not paste a password or private key into chat.
2. Run read-only audit:

   ```sh
   python scripts/deploy/deploy_client.py --connection /private/connection.json audit
   ```

3. Freeze the explicit source boundary in local release refs. This preserves
   the working branches and index, including unrelated Hero/RAG edits. It
   creates commits reachable under `codex/deploy-<release>`, without pushing.
   The baseline SHAs in `package_release.py` must be reviewed before a new base.

   ```sh
   python scripts/deploy/package_release.py prepare --blog /source/blog --agent /source/Agent --release carrykit-20261027-01 --output /private/release --freeze
   ```

4. Review the additive migration and source diffs. Build (step 5), then use
   `package_release.py verify <release-directory> --python <venv-python>
   --agent-repository <Agent-repo> --node-dependencies <Blog-node_modules>`.
   This runs lint against the frozen Blog source and the unified Agent suite
   in a separate source clone, so test caches cannot pollute build contexts.
   It creates `validation.json` and retains reports. Do not manually mark failed
   checks true. Build verifies the entire source file/hash list before using a
   frozen revision label; unknown context files stop it.
5. Build using the architecture returned by audit (`linux/amd64` or
   `linux/arm64`), with `https://carrykit.top` baked into Next metadata:

   ```sh
   python scripts/deploy/package_release.py build /private/release --platform linux/amd64
   python scripts/deploy/package_release.py export /private/release
   ```

6. From Windows, deploy and keep an owner-only, DPAPI-encrypted off-host backup:

   ```sh
   python scripts/deploy/deploy_client.py --connection /private/connection.json deploy /private/release --backup-dir /private/backups
   ```

The client audits capacity and mounts, transfers a compressed checksummed image
archive, verifies the remote SHA256, imports images and prepares protected JSON
Compose files under `/opt/carrykit-blog/releases/<release>`. It preserves the
actual running app environment, including the session secret, and escapes
literal dollar signs for Compose. New service secrets are generated on the VPS;
they are never returned to the client. Existing original Compose files are not
overwritten. The generated Compose path is the authoritative path for this
release's future operations; do not later run an old `docker compose up` from
the original directory and assume it includes the new service.

Backup briefly stops app writes, uses SQLite Online Backup API on a read-only
mount, pairs uploads with that boundary, restarts the old app, then restores to
a new isolated volume with network disabled. Target-image migration and
business table counts must pass. The client copies backup DB/uploads off-host
and verifies hashes before uploading a receipt. Apply stops the old app and
rechecks the exact DB/WAL/uploads fingerprint: if any data changed since backup,
it restarts the old app and refuses migration. Review and repeat using a new
release ID. It never silently accepts an outdated backup.

Only app is recreated, Agent is added privately and its runtime volume is
explicitly migrated. HTTPS `/blog=200`, `/assistant=404`, private live health
and unchanged Caddy identity are checked. On failure the old image/config is
restored; the additive migration remains. There is no automatic destructive
schema rollback or volume deletion. Source/restore/test volumes and old images
are retained. Allow a maintenance window: this is a single-instance deployment,
not a zero-downtime or high-availability system.

Off-host DB, uploads and runtime artifacts are received in memory, SHA256 checked,
protected with Windows CurrentUser DPAPI, then actually decrypted in memory to
verify recovery before the receipt is sent. Plaintext backup payloads are not
written locally. This binds recovery to that Windows user's DPAPI profile;
preserve it. To recover into a new protected file on the same account:

```sh
python scripts/deploy/backup_crypto.py /private/blog.db.dpapi --output /private/new-restore/blog.db
```

Public activation requires separate user authorization of model/limits. The
approved settings for this deployment are DeepSeek Flash, CNY1/site/day and
CNY0.50/visitor/day, accounted conservatively at peak input/output rates. The
existing ledger resets at 00:00 UTC (08:00 China time); UI discloses this.

```sh
# Supply JSON {"modelApiKey":"..."} through secure stdin, never command args.
python scripts/deploy/deploy_client.py --connection /private/connection.json activate /private/release --backup-dir /private/backups --credentials-stdin
```

Activation first prepares the trusted Caddy header, real runtime backup/isolated
restore, an encrypted off-host runtime copy and systemd maintenance timers. It
then passes credentials through encrypted SSH stdin. Provider keys stay in the
root-only production configuration. It checks ready/page status without paying
for a question. Model smoke tests are separate, bounded operations. Proxy headers
are HMAC bucketed; IPv4 and IPv6 /64 limits are disclosed in both dictionaries.
The periodic backups are server-local; the initial verified recovery copy is
off-host. Continuous daily off-host delivery still needs an available backup
destination; do not claim it from a workstation that may be offline.

For manual recovery, use the same uploaded script:

```sh
python3 /opt/carrykit-blog/incoming/<release>/remote_deploy.py status --release <release>
python3 /opt/carrykit-blog/incoming/<release>/remote_deploy.py rollback --release <release>
```

Do not bypass an activation prerequisite. Maintenance/backup run with workers
stopped and use single-instance maintenance windows; busy runs may defer a pass.
The earlier three synthetic test calls remain separate from the newly authorized
production daily limits. Deployment/activation/health scripts never ask a model.

SSH interruptions are recovered by querying the credential-free systemd prepare
job and its persisted release state, before resuming. A missing `--config-stdin`
once stopped activation at argument parsing; the client fix and frozen OPS
controller provenance are retained in release 06. Re-run only after reading the
actual state; never infer success from a disconnected SSH session.
