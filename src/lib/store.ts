import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Agent, Chunk } from "./types";

export interface VectorHit {
  chunk: Chunk;
  score: number;
}
export interface VectorStore {
  putAgent(a: Agent): Promise<void>;
  getAgent(id: string): Promise<Agent | null>;
  addChunks(rows: { chunk: Chunk; embedding: number[] }[]): Promise<void>;
  vectorSearch(agentId: string, embedding: number[], k: number): Promise<VectorHit[]>;
  listChunks(agentId: string): Promise<Chunk[]>;
}

export class MemoryStore implements VectorStore {
  private agents = new Map<string, Agent>();
  private rows = new Map<string, { chunk: Chunk; embedding: number[] }[]>();
  async putAgent(a: Agent) {
    this.agents.set(a.id, a);
  }
  async getAgent(id: string) {
    return this.agents.get(id) ?? null;
  }
  async addChunks(rows: { chunk: Chunk; embedding: number[] }[]) {
    for (const r of rows) {
      const list = this.rows.get(r.chunk.agentId) ?? [];
      list.push(r);
      this.rows.set(r.chunk.agentId, list);
    }
  }
  async vectorSearch(agentId: string, q: number[], k: number) {
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    return (this.rows.get(agentId) ?? [])
      .map((r) => ({ chunk: r.chunk, score: dot(q, r.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
  async listChunks(agentId: string) {
    return (this.rows.get(agentId) ?? []).map((r) => r.chunk);
  }
}

type ChunkRow = { id: string; agent_id: string; url: string; title: string; idx: number; content: string };
const toChunk = (r: ChunkRow): Chunk => ({
  id: r.id,
  agentId: r.agent_id,
  url: r.url,
  title: r.title,
  idx: r.idx,
  content: r.content,
});
const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(`Supabase: ${r.error.message}`);
  return r.data;
};

/** pgvector-backed store. Needs supabase/schema.sql applied. */
export class SupabaseStore implements VectorStore {
  constructor(private db: SupabaseClient) {}
  async putAgent(a: Agent) {
    must(
      await this.db.from("agents").upsert({
        id: a.id, url: a.url, name: a.name, embedder: a.embedder,
        pages: a.pages, chunks: a.chunks, created_at: a.createdAt,
      }),
    );
  }
  async getAgent(id: string) {
    const r = must(await this.db.from("agents").select("*").eq("id", id).maybeSingle());
    return r ? { id: r.id, url: r.url, name: r.name, embedder: r.embedder, pages: r.pages, chunks: r.chunks, createdAt: r.created_at } : null;
  }
  async addChunks(rows: { chunk: Chunk; embedding: number[] }[]) {
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100).map(({ chunk: c, embedding }) => ({
        id: c.id, agent_id: c.agentId, url: c.url, title: c.title, idx: c.idx, content: c.content,
        embedding: JSON.stringify(embedding),
      }));
      must(await this.db.from("chunks").insert(batch));
    }
  }
  async vectorSearch(agentId: string, embedding: number[], k: number) {
    const rows = must(
      await this.db.rpc("match_chunks", { p_agent: agentId, query_embedding: JSON.stringify(embedding), match_count: k }),
    ) as (ChunkRow & { similarity: number })[];
    return rows.map((r) => ({ chunk: toChunk(r), score: r.similarity }));
  }
  async listChunks(agentId: string) {
    const rows = must(
      await this.db.from("chunks").select("id,agent_id,url,title,idx,content").eq("agent_id", agentId).order("idx"),
    ) as ChunkRow[];
    return rows.map(toChunk);
  }
}

const g = globalThis as unknown as { __storeSingleton?: VectorStore };
/** Supabase when configured, otherwise a process-wide in-memory store (survives dev hot reloads). */
export function getStore(): VectorStore {
  if (!g.__storeSingleton) {
    const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
    g.__storeSingleton = url && key ? new SupabaseStore(createClient(url, key, { auth: { persistSession: false } })) : new MemoryStore();
  }
  return g.__storeSingleton;
}
