import type { Embedder } from "./embed";
import type { VectorStore } from "./store";
import { tokenize } from "./text";
import type { Chunk } from "./types";

/** BM25 (k1=1.5, b=0.75) over an in-memory corpus. Returns only docs with a positive score, best first. */
export function bm25Scores(query: string, docs: { id: string; text: string }[], k1 = 1.5, b = 0.75) {
  const q = [...new Set(tokenize(query))];
  const toks = docs.map((d) => tokenize(d.text));
  const avg = toks.reduce((s, t) => s + t.length, 0) / (docs.length || 1) || 1;
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  return docs
    .map((d, i) => {
      const tf = new Map<string, number>();
      toks[i].forEach((w) => tf.set(w, (tf.get(w) ?? 0) + 1));
      let score = 0;
      for (const w of q) {
        const f = tf.get(w);
        if (!f) continue;
        const n = df.get(w) ?? 0;
        const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avg));
      }
      return { id: d.id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b2) => b2.score - a.score);
}

/** Reciprocal Rank Fusion: score(d) = sum over rankings of 1 / (k + rank). */
export function rrf(rankings: string[][], k = 60): { id: string; score: number }[] {
  const s = new Map<string, number>();
  for (const r of rankings) r.forEach((id, i) => s.set(id, (s.get(id) ?? 0) + 1 / (k + i + 1)));
  return [...s].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}

export interface Hit {
  chunk: Chunk;
  score: number;
  cos: number;
  coverage: number;
}

/** Hybrid retrieval. `relevant` is false when nothing lexically or semantically matches (-> "I don't know"). */
export async function retrieve(
  ctx: { store: VectorStore; embedder: Embedder },
  agentId: string,
  query: string,
  topK = 5,
): Promise<{ hits: Hit[]; relevant: boolean }> {
  const qTerms = [...new Set(tokenize(query))];
  if (!qTerms.length) return { hits: [], relevant: false };
  const [[qv], all] = await Promise.all([ctx.embedder.embed([query]), ctx.store.listChunks(agentId)]);
  const vec = await ctx.store.vectorSearch(agentId, qv, 20);
  const kw = bm25Scores(query, all.map((c) => ({ id: c.id, text: `${c.title} ${c.content}` }))).slice(0, 20);
  const byId = new Map(all.map((c) => [c.id, c]));
  const cos = new Map(vec.map((v) => [v.chunk.id, v.score]));

  const fused = rrf([vec.map((v) => v.chunk.id), kw.map((k) => k.id)]).slice(0, topK);
  const hits: Hit[] = fused.flatMap((f) => {
    const chunk = byId.get(f.id) ?? vec.find((v) => v.chunk.id === f.id)?.chunk;
    if (!chunk) return [];
    const have = new Set(tokenize(`${chunk.title} ${chunk.content}`));
    const coverage = qTerms.filter((t) => have.has(t)).length / qTerms.length;
    return [{ chunk, score: f.score, cos: cos.get(f.id) ?? 0, coverage }];
  });
  const relevant = hits.some((h) => h.coverage >= 0.5 || h.cos >= ctx.embedder.minCos);
  return { hits, relevant };
}
