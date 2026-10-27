import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const CLIENT_IP_HEADER = "x-carrykit-client-ip";
export type IpOperation = "create" | "submit" | "control";

const limits = {
  create: { milliseconds: 10 * 60_000, maximum: 5 },
  submit: { milliseconds: 60_000, maximum: 30 },
} as const;

export class IpAdmissionError extends Error {
  constructor(public readonly code: "AGENT_UNAVAILABLE" | "RATE_LIMITED") {
    super(code);
  }
}

function publicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  const [first, second] = parts;
  if (first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168) || (first === 100 && second >= 64 && second <= 127)) {
    throw new IpAdmissionError("AGENT_UNAVAILABLE");
  }
  return parts.join(".");
}

function networkIdentity(value: string | null) {
  if (!value || value !== value.trim() || /[,\s%]/u.test(value)) throw new IpAdmissionError("AGENT_UNAVAILABLE");
  const version = isIP(value);
  if (version === 4) return publicIpv4(value);
  if (version !== 6) throw new IpAdmissionError("AGENT_UNAVAILABLE");
  // The URL parser canonicalizes equivalent IPv6 spellings, including mapped IPv4.
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  if (canonical.startsWith("::ffff:")) {
    const words = canonical.slice(7).split(":");
    if (words.length !== 2) throw new IpAdmissionError("AGENT_UNAVAILABLE");
    const first = Number.parseInt(words[0], 16), second = Number.parseInt(words[1], 16);
    return publicIpv4(`${first >> 8}.${first & 255}.${second >> 8}.${second & 255}`);
  }
  if (canonical === "::" || canonical === "::1" || /^(?:f[cd]|fe[89ab]|ff)/u.test(canonical)) {
    throw new IpAdmissionError("AGENT_UNAVAILABLE");
  }
  const halves = canonical.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const words = halves.length === 2 ? [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right] : left;
  // A /64 prevents a client rotating interface addresses to obtain fresh buckets.
  return `${words.slice(0, 4).map(word => Number.parseInt(word, 16).toString(16)).join(":")}/64`;
}

export interface IpBucket {
  key: string;
  maximum: number;
  expiresAt: Date;
}

export function ipRateBucket(header: string | null, secret: string, trusted: boolean, operation: IpOperation, now = Date.now()): IpBucket | null {
  if (!trusted || Buffer.byteLength(secret) < 32 || !Number.isSafeInteger(now) || now < 0) {
    throw new IpAdmissionError("AGENT_UNAVAILABLE");
  }
  const identity = networkIdentity(header);
  // Cancellation/close still require the trusted proxy, but should not be blocked
  // by a create/submit IP bucket. Their owner-bound visitor limit remains active.
  if (operation === "control") return null;
  const policy = limits[operation];
  const start = Math.floor(now / policy.milliseconds) * policy.milliseconds;
  const digest = createHmac("sha256", secret)
    .update(`carrykit-ip-rate-v1\n${operation}\n${start}\n${identity}`).digest("hex");
  return { key: `assistant-ip:${operation}:${start}:${digest}`, maximum: policy.maximum,
    expiresAt: new Date(start + policy.milliseconds + 60_000) };
}

export async function consumeIpBucket(bucket: IpBucket | null, increment: (bucket: IpBucket) => Promise<number>) {
  if (!bucket) return;
  const count = await increment(bucket);
  if (!Number.isSafeInteger(count) || count < 1) throw new IpAdmissionError("AGENT_UNAVAILABLE");
  if (count > bucket.maximum) throw new IpAdmissionError("RATE_LIMITED");
}
