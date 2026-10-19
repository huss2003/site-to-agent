import { tokenize } from "./text";

export const DIM = 1024; // matches vector(1024) in supabase/schema.sql

export interface Embedder {
  name: string;
  /** Cosine similarity above which a hit counts as relevant on its own. */
  minCos: number;
  embed(texts: string[]): Promise<number[][]>;
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Deterministic signed feature-hashing of unigrams + bigrams, L2-normalised. No network, no keys. */
export function hashVector(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  const toks = tokenize(text);
  const add = (f: string, w: number) => {
    const h = fnv(f);
    v[h % DIM] += (h >>> 20) & 1 ? w : -w;
  };
  toks.forEach((t, i) => {
    add(t, 1);
    if (i > 0) add(`${toks[i - 1]} ${t}`, 0.5);
  });
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export const hashEmbedder: Embedder = {
  name: "hash-1024",
  minCos: 0.35,
  embed: async (texts) => texts.map(hashVector),
};

async function remote(url: string, key: string, body: object): Promise<number[][]> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

async function batched(texts: string[], fn: (b: string[]) => Promise<number[][]>, size = 64) {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += size) out.push(...(await fn(texts.slice(i, i + size))));
  return out;
}

export const openaiEmbedder = (key: string): Embedder => ({
  name: "openai-3-small-1024",
  minCos: 0.4,
  embed: (texts) =>
    batched(texts, (input) =>
      remote("https://api.openai.com/v1/embeddings", key, {
        model: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
        input,
        dimensions: DIM,
      }),
    ),
});

export const voyageEmbedder = (key: string): Embedder => ({
  name: "voyage-3-1024",
  minCos: 0.4,
  embed: (texts) =>
    batched(texts, (input) =>
      remote("https://api.voyageai.com/v1/embeddings", key, { model: "voyage-3", input }),
    ),
});
