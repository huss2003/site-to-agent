import { GuardError, rateLimit, readJson } from "@/lib/guard";
import { ingest } from "@/lib/ingest";
import { getProviders } from "@/lib/providers";
import { assertPublicHost } from "@/lib/safefetch";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { url?: unknown; maxPages?: unknown } | null;
  let url: URL;
  try {
    rateLimit(req, "ingest", Number(process.env.INGEST_RATE_LIMIT ?? 5), 10 * 60_000);
    body = (await readJson(req, 4_096)) as typeof body;
    url = new URL(String(body?.url ?? ""));
    await assertPublicHost(url);
  } catch (e) {
    const status = e instanceof GuardError ? e.status : 400;
    return Response.json({ error: e instanceof Error ? e.message : "invalid url" }, { status });
  }
  const maxPages = Math.min(50, Math.max(1, Number(body?.maxPages) || 15));
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        await ingest({ store: getStore(), embedder: getProviders().embedder }, url.href, maxPages, (p) =>
          send("progress", p),
        );
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : "ingest failed" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
