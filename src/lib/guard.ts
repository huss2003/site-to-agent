/** Per-instance API guards: body-size cap and fixed-window rate limit (in-memory; use a shared store at scale). */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw new GuardError("request body too large", 413);
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new GuardError("request body too large", 413);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class GuardError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const hits = new Map<string, { n: number; reset: number }>();

export function rateLimit(req: Request, bucket: string, limit: number, windowMs: number) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "anon";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const e = hits.get(key);
  if (!e || e.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
  else if (++e.n > limit) throw new GuardError("rate limit exceeded, try again later", 429);
}
