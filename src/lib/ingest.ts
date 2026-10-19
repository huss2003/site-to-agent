import { randomBytes } from "crypto";
import { chunkText } from "./chunk";
import { crawl } from "./crawl";
import type { Embedder } from "./embed";
import type { VectorStore } from "./store";
import type { Agent, Chunk, Progress } from "./types";

/** crawl -> extract -> chunk -> embed -> store. Emits progress events for SSE. */
export async function ingest(
  ctx: { store: VectorStore; embedder: Embedder },
  url: string,
  maxPages: number,
  emit: (p: Progress) => void,
  timeoutMs = Number(process.env.CRAWL_TIMEOUT_MS ?? 40_000),
): Promise<Agent> {
  emit({ stage: "discover", message: "Reading robots.txt and sitemap...", total: maxPages });
  const { pages, skippedRobots } = await crawl(url, {
    maxPages,
    timeoutMs,
    onPage: (n, u) => emit({ stage: "crawl", message: `Crawled ${u}`, pages: n, total: maxPages }),
  });
  if (!pages.length) throw new Error("No readable pages found (blocked by robots.txt, not HTML, or unreachable).");

  const agentId = randomBytes(5).toString("hex");
  const chunks: Chunk[] = pages.flatMap((p) =>
    chunkText(p.text).map((content) => ({ id: "", agentId, url: p.url, title: p.title, idx: 0, content })),
  );
  chunks.forEach((c, i) => ((c.id = `${agentId}:${i}`), (c.idx = i)));

  const rows: { chunk: Chunk; embedding: number[] }[] = [];
  for (let i = 0; i < chunks.length; i += 32) {
    const batch = chunks.slice(i, i + 32);
    const vecs = await ctx.embedder.embed(batch.map((c) => `${c.title}\n${c.content}`));
    batch.forEach((chunk, j) => rows.push({ chunk, embedding: vecs[j] }));
    emit({ stage: "embed", message: `Embedded ${rows.length}/${chunks.length} chunks`, pages: rows.length, total: chunks.length });
  }

  const host = new URL(url).hostname.replace(/^www\./, "");
  const agent: Agent = {
    id: agentId,
    url,
    name: pages[0].title.split(/\s[|\-–—]\s/)[0] || host,
    embedder: ctx.embedder.name,
    pages: pages.length,
    chunks: chunks.length,
    createdAt: new Date().toISOString(),
  };
  await ctx.store.putAgent(agent);
  await ctx.store.addChunks(rows);
  const note = skippedRobots.length ? ` (${skippedRobots.length} skipped by robots.txt)` : "";
  emit({ stage: "done", message: `Agent ready: ${pages.length} pages, ${chunks.length} chunks${note}`, agentId, pages: pages.length });
  return agent;
}
