import { describe, expect, it } from "vitest";
import { chunkText } from "../src/lib/chunk";
import { estTokens } from "../src/lib/text";

const para = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} talks about bread and cakes.`).join(" ");

describe("chunkText", () => {
  it("keeps short text as one chunk", () => {
    expect(chunkText("Hello world. Short page.")).toHaveLength(1);
  });
  it("splits long text under the token target", () => {
    const chunks = chunkText(para(400));
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(estTokens(c)).toBeLessThanOrEqual(800);
  });
  it("overlaps consecutive chunks", () => {
    const [a, b] = chunkText(para(400));
    const lastSentence = a.split(/(?<=\.)\s/).pop()!;
    expect(b.startsWith(a.split(/(?<=\.)\s/).slice(-2)[0]) || b.includes(lastSentence)).toBe(true);
  });
  it("hard-splits a single giant sentence", () => {
    const chunks = chunkText("x".repeat(10_000));
    expect(chunks.length).toBeGreaterThan(1);
  });
});
