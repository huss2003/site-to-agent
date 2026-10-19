import { estTokens, splitSentences } from "./text";

/** Sentence-aware chunker: ~`target` tokens per chunk with ~`overlap` tokens carried over. */
export function chunkText(text: string, { target = 800, overlap = 100 } = {}): string[] {
  const hardSplit = (s: string) =>
    estTokens(s) <= target ? [s] : (s.match(new RegExp(`.{1,${target * 4}}`, "gs")) ?? [s]);
  const units = splitSentences(text).flatMap(hardSplit);
  const out: string[] = [];
  let cur: string[] = [];
  let tok = 0;
  for (const u of units) {
    const t = estTokens(u) + 0.25; // +0.25 for the joining space
    if (tok + t > target && cur.length) {
      out.push(cur.join(" "));
      const tail: string[] = [];
      let o = 0;
      for (let i = cur.length - 1; i >= 0; i--) {
        const x = estTokens(cur[i]) + 0.25;
        if (o + x > overlap) break;
        tail.unshift(cur[i]);
        o += x;
      }
      cur = tail;
      tok = o;
    }
    cur.push(u);
    tok += t;
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}
