import { beforeAll, describe, expect, it } from "vitest";
import { ChatError, REFUSAL, runChat } from "../src/lib/chat";
import { hashEmbedder } from "../src/lib/embed";
import { mockLLM, type LLM } from "../src/lib/llm";
import { MemoryStore } from "../src/lib/store";
import type { Chunk } from "../src/lib/types";

const store = new MemoryStore();
const embedder = hashEmbedder;
const chunk = (i: number, title: string, content: string): Chunk => ({ id: `a:${i}`, agentId: "a", url: `https://x.test/${i}`, title, idx: i, content });

beforeAll(async () => {
  await store.putAgent({ id: "a", url: "https://x.test", name: "X", embedder: embedder.name, pages: 2, chunks: 2, createdAt: "" });
  const chunks = [
    chunk(0, "Menu", "Our sourdough loaf costs $8. Croissants cost $4."),
    chunk(1, "Hours", "We are open Monday to Friday from 7am to 6pm."),
  ];
  const vecs = await embedder.embed(chunks.map((c) => `${c.title}\n${c.content}`));
  await store.addChunks(chunks.map((chunk, i) => ({ chunk, embedding: vecs[i] })));
});

const ask = (q: string, llm: LLM = mockLLM) => runChat({ store, embedder, llm }, "a", [{ role: "user", content: q }]);

describe("runChat", () => {
  it("answers in-scope questions with valid citations", async () => {
    const r = await ask("How much is a sourdough loaf?");
    expect(r.grounded).toBe(true);
    expect(r.answer).toMatch(/\$8.*\[1\]/);
    expect(r.citations[0].url).toBe("https://x.test/0");
  });
  it("refuses with no relevant context, without calling the LLM", async () => {
    const llm: LLM = { name: "boom", complete: async () => { throw new Error("must not be called"); } };
    const r = await ask("What is the capital of France?", llm);
    expect(r).toMatchObject({ answer: REFUSAL, refused: true, grounded: false, citations: [] });
  });
  it("refuses when the model answers without citing sources", async () => {
    const r = await ask("How much is a sourdough loaf?", { name: "nocite", complete: async () => "About eight dollars." });
    expect(r.refused).toBe(true);
  });
  it("ignores fabricated citation numbers", async () => {
    const r = await ask("How much is a sourdough loaf?", { name: "fake", complete: async () => "It costs $8 [7]." });
    expect(r.refused).toBe(true);
  });
  it("validates input and agent existence", async () => {
    await expect(runChat({ store, embedder, llm: mockLLM }, "nope", [{ role: "user", content: "hi there" }])).rejects.toMatchObject({ status: 404 });
    await expect(runChat({ store, embedder, llm: mockLLM }, "a", [])).rejects.toBeInstanceOf(ChatError);
  });
});
