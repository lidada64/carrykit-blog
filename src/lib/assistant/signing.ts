import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/** Internal-only authentication. Callers must durably claim nonce after verification. */
export class InternalAuthError extends Error {
  constructor() { super("Invalid internal request"); }
}

export type InternalIdentity = {
  subject: string; scope: string; audience: string; requestId: string;
  nonce: string; issuedAt: number; expiresAt: number;
};
type RequestData = { secret: string; method: string; target: string; body?: string; nowSeconds?: number };
type SignData = RequestData & { subject: string; scope: string; audience: string; requestId?: string };
type VerifyData = RequestData & { headers: Headers | Record<string, string>; scope: string; audience: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const label = /^[A-Za-z0-9:_-]{1,128}$/u;

function canonical(data: RequestData, identity: InternalIdentity): string {
  if (typeof data.secret !== "string" || Buffer.byteLength(data.secret, "utf8") < 32
    || !/^[A-Z]{3,8}$/u.test(data.method) || !/^\/(?!\/)[\x21-\x7e]*$/u.test(data.target)
    || data.target.includes("#") || data.target.length > 4096
    || !label.test(identity.subject) || !label.test(identity.scope) || !label.test(identity.audience)
    || !uuid.test(identity.requestId) || !uuid.test(identity.nonce)
    || !Number.isSafeInteger(identity.issuedAt) || !Number.isSafeInteger(identity.expiresAt)) throw new InternalAuthError();
  return ["carrykit-agent-v1", data.method, data.target,
    createHash("sha256").update(data.body ?? "", "utf8").digest("hex"),
    identity.subject, identity.scope, identity.audience, identity.requestId,
    String(identity.issuedAt), String(identity.expiresAt), identity.nonce].join("\n");
}

function signature(data: RequestData, identity: InternalIdentity): string {
  return createHmac("sha256", data.secret).update(canonical(data, identity), "utf8").digest("hex");
}

export function signInternalRequest(data: SignData): Record<string, string> {
  const issuedAt = data.nowSeconds ?? Math.floor(Date.now() / 1000);
  const identity: InternalIdentity = { subject: data.subject, scope: data.scope, audience: data.audience,
    requestId: data.requestId ?? randomUUID(), nonce: randomUUID(), issuedAt, expiresAt: issuedAt + 60 };
  return { "x-agent-subject": identity.subject, "x-agent-scope": identity.scope,
    "x-agent-audience": identity.audience, "x-agent-request-id": identity.requestId,
    "x-agent-nonce": identity.nonce, "x-agent-issued-at": String(issuedAt),
    "x-agent-expires-at": String(identity.expiresAt), "x-agent-signature": signature(data, identity) };
}

export function verifyInternalRequest(data: VerifyData): InternalIdentity {
  const headers = new Map<string, string>();
  const entries = data.headers instanceof Headers ? data.headers.entries() : Object.entries(data.headers);
  for (const [key, value] of entries) {
    const normalized = key.toLowerCase();
    if (headers.has(normalized) || typeof value !== "string") throw new InternalAuthError();
    headers.set(normalized, value);
  }
  const get = (name: string) => headers.get(`x-agent-${name}`) ?? "";
  const issued = get("issued-at"), expires = get("expires-at"), supplied = get("signature");
  if (!/^[0-9]{1,12}$/u.test(issued) || !/^[0-9]{1,12}$/u.test(expires) || !/^[a-f0-9]{64}$/u.test(supplied)) throw new InternalAuthError();
  const identity: InternalIdentity = { subject: get("subject"), scope: get("scope"), audience: get("audience"),
    requestId: get("request-id"), nonce: get("nonce"), issuedAt: Number(issued), expiresAt: Number(expires) };
  const now = data.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || identity.scope !== data.scope || identity.audience !== data.audience
    || identity.expiresAt <= now || identity.issuedAt > now + 5 || identity.expiresAt <= identity.issuedAt
    || identity.expiresAt - identity.issuedAt > 60) throw new InternalAuthError();
  const expected = signature(data, identity);
  if (!timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"))) throw new InternalAuthError();
  return identity;
}
