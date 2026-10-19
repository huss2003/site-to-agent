import { lookup } from "dns/promises";
import { BlockList, isIP } from "net";

/** SSRF guard: private, loopback, link-local (incl. cloud metadata), CGNAT, multicast, reserved, ULA, mapped. */
const block = new BlockList();
for (const [a, p] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) block.addSubnet(a, p, "ipv4");
for (const [a, p] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) block.addSubnet(a, p, "ipv6");

const allowPrivate = () => process.env.ALLOW_PRIVATE_HOSTS === "1";

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (!v) return true;
  if (v === 6 && /^::ffff:/i.test(ip)) return true; // v4-mapped/translated: never needed for crawling
  return block.check(ip, v === 4 ? "ipv4" : "ipv6");
}

/** Sync checks: scheme, credentials, port, obvious local names and IP literals. */
export function assertPublicUrl(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs are supported");
  if (u.username || u.password) throw new Error("URLs with credentials are not allowed");
  if (allowPrivate()) return;
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("Only ports 80 and 443 are allowed");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !isIP(h))
    throw new Error("Private or local addresses are not allowed");
  if (isIP(h) && isBlockedIp(h)) throw new Error("Private or local addresses are not allowed");
}

/** Async check: every resolved address must be public (Node runtime). */
export async function assertPublicHost(u: URL) {
  assertPublicUrl(u);
  if (allowPrivate()) return;
  const h = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(h) ? [{ address: h }] : await lookup(h, { all: true, verbatim: true });
  if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) throw new Error("Private or local addresses are not allowed");
}

/**
 * fetch with SSRF checks on every redirect hop. Residual TOCTOU window between lookup and connect
 * (DNS rebinding) remains; see README.
 */
export async function safeFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}, maxHops = 5): Promise<Response> {
  const signal = AbortSignal.timeout(init.timeoutMs ?? 8000);
  let cur = new URL(url);
  for (let hop = 0; ; hop++) {
    await assertPublicHost(cur);
    const res = await fetch(cur, { ...init, redirect: "manual", signal });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      if (hop >= maxHops) throw new Error("Too many redirects");
      await res.body?.cancel();
      cur = new URL(loc, cur);
      continue;
    }
    Object.defineProperty(res, "url", { value: cur.href }); // final URL after manual redirects
    return res;
  }
}

/** Read a response body as text, aborting past `maxBytes`. */
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new Error("Response too large");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    parts.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(parts));
}
