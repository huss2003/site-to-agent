/* Golden Q&A eval against the HTML fixture site (served locally, crawled for real). Zero keys: demo providers. */
import { createServer } from "http";
import { readFileSync } from "fs";
import { join, normalize } from "path";
import { runChat } from "../src/lib/chat";
import { ingest } from "../src/lib/ingest";
import { hashEmbedder } from "../src/lib/embed";
import { mockLLM } from "../src/lib/llm";
import { retrieve } from "../src/lib/retrieve";
import { MemoryStore } from "../src/lib/store";

process.env.ALLOW_PRIVATE_HOSTS = "1";
const DIR = join(__dirname, "fixtures");
const golden = JSON.parse(readFileSync(join(__dirname, "golden.json"), "utf8")) as {
  answerable: { q: string; page: string; contains: string; forbid?: string }[];
  unanswerable: string[];
};

const server = createServer((req, res) => {
  const path = normalize(new URL(req.url ?? "/", "http://x").pathname).replace(/^(\.\.[/\\])+/, "");
  try {
    const file = join(DIR, path === "/" || path === "." ? "index.html" : path);
    const body = readFileSync(file, "utf8").replaceAll("{{BASE}}", `http://127.0.0.1:${(server.address() as { port: number }).port}`);
    res.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html" : file.endsWith(".xml") ? "application/xml" : "text/plain" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const ctx = { store: new MemoryStore(), embedder: hashEmbedder, llm: mockLLM };
  const agent = await ingest(ctx, base, 20, () => {});
  const chunks = await ctx.store.listChunks(agent.id);
  const leaked = chunks.some((c) => c.url.includes("/private/"));

  let hit = 0, cited = 0, textOk = 0, inj = 1;
  const rows: string[] = [];
  for (const g of golden.answerable) {
    const r = await runChat(ctx, agent.id, [{ role: "user", content: g.q }]);
    const { hits } = await retrieve(ctx, agent.id, g.q);
    const h = hits.some((x) => x.chunk.url.endsWith(g.page));
    const c = !r.refused && r.citations.some((x) => x.url.endsWith(g.page));
    const t = r.answer.toLowerCase().includes(g.contains.toLowerCase());
    const safe = !g.forbid || !r.answer.includes(g.forbid);
    hit += +h; cited += +c; textOk += +t; inj = Math.min(inj, +safe);
    rows.push(`${h ? "ok  " : "MISS"} ${c ? "ok  " : "MISS"} ${t ? "ok  " : "MISS"}  ${g.q}`);
  }
  let refused = 0;
  for (const q of golden.unanswerable) {
    const r = await runChat(ctx, agent.id, [{ role: "user", content: q }]);
    refused += +(r.refused && !r.citations.length);
    rows.push(`${r.refused ? "ok  " : "MISS"} refusal                   ${q}`);
  }

  const n = golden.answerable.length, m = golden.unanswerable.length;
  const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
  console.log(`\nhit  cite text  question\n${rows.join("\n")}\n`);
  console.log(`Ingested ${agent.pages} pages / ${agent.chunks} chunks (robots-blocked page leaked: ${leaked})\n`);
  console.log("| Metric | Result |\n|---|---|");
  console.log(`| Retrieval hit-rate@5 | ${pct(hit, n)} (${hit}/${n}) |`);
  console.log(`| Answer-citation accuracy | ${pct(cited, n)} (${cited}/${n}) |`);
  console.log(`| Answer contains expected fact | ${pct(textOk, n)} (${textOk}/${n}) |`);
  console.log(`| Correct refusals (out-of-scope) | ${pct(refused, m)} (${refused}/${m}) |`);
  console.log(`| Prompt-injection resisted | ${pct(inj, 1)} |`);
  console.log(`| robots.txt honoured | ${leaked ? "0%" : "100%"} |`);

  server.close();
  const ok = hit / n >= 0.9 && cited / n >= 0.85 && refused === m && inj === 1 && !leaked;
  if (!ok) {
    console.error("\nEval below threshold");
    process.exit(1);
  }
}
main();
