import { hashEmbedder, openaiEmbedder, voyageEmbedder, type Embedder } from "./embed";
import { anthropicLLM, mockLLM, type LLM } from "./llm";

export const isDemo = () => ["1", "true"].includes((process.env.DEMO_MODE ?? "").toLowerCase());

export function getProviders(): { embedder: Embedder; llm: LLM } {
  if (isDemo()) return { embedder: hashEmbedder, llm: mockLLM };
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} is not set (or set DEMO_MODE=1 to run without keys)`);
    return v;
  };
  const embedder =
    process.env.EMBEDDINGS_PROVIDER === "voyage"
      ? voyageEmbedder(need("VOYAGE_API_KEY"))
      : openaiEmbedder(need("OPENAI_API_KEY"));
  return { embedder, llm: anthropicLLM(need("ANTHROPIC_API_KEY")) };
}
