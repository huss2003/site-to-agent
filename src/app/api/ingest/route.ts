import { assertPublicUrl } from "@/lib/crawl";
import { ingest } from "@/lib/ingest";
import { getProviders } from "@/lib/providers";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let url: URL;
  try {
    url = new URL(String(body?.url ?? ""));
    assertPublicUrl(url);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "invalid url" }, { status: 400 });
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
