import type { Msg } from "./types";
import { splitSentences, tokenize } from "./text";

export interface Source {
  n: number;
  url: string;
  title: string;
  text: string;
}
export interface LLM {
  name: string;
  complete(req: { system: string; messages: Msg[]; sources: Source[]; question: string }): Promise<string>;
}

export const anthropicLLM = (key: string): LLM => ({
  name: "anthropic",
  async complete({ system, messages }) {
    const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 700,
        system,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    return json.content.map((c) => c.text ?? "").join("").trim();
  },
});

/** Deterministic extractive "LLM": picks the best-matching source sentences and cites them. */
export const mockLLM: LLM = {
  name: "mock-extractive",
  async complete({ question, sources }) {
    const q = new Set(tokenize(question));
    const scored = sources.flatMap((s) =>
      splitSentences(s.text).map((sentence, i) => {
        const toks = new Set(tokenize(sentence));
        const hits = [...q].filter((t) => toks.has(t)).length;
        return { n: s.n, sentence, i, score: hits / (q.size || 1) };
      }),
    );
    const best = scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.n - b.n || a.i - b.i)
      .slice(0, 2);
    if (!best.length) return "I don't know.";
    return best.map((b) => `${b.sentence.replace(/[.!?]+$/, "")}. [${b.n}]`).join(" ");
  },
};
