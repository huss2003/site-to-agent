export interface Chunk {
  id: string;
  agentId: string;
  url: string;
  title: string;
  idx: number;
  content: string;
}
export interface Agent {
  id: string;
  url: string;
  name: string;
  embedder: string;
  pages: number;
  chunks: number;
  createdAt: string;
}
export interface Msg {
  role: "user" | "assistant";
  content: string;
}
export interface Citation {
  n: number;
  url: string;
  title: string;
  snippet: string;
}
export interface ChatResult {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  refused: boolean;
}
export interface Progress {
  stage: "discover" | "crawl" | "embed" | "done";
  message: string;
  pages?: number;
  total?: number;
  agentId?: string;
}
