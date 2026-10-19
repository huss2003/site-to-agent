const STOP = new Set(
  ("a an the and or but if of to in on at by for with from as is are was were be been being it its this that " +
    "these those i you we they he she do does did can could will would should may might what which who whom how " +
    "when where why your our their my me us not no yes there here about into than then so also any all").split(" "),
);

/** Very small stemmer: enough to match plural/tense variants without a dependency. */
export const stem = (w: string) =>
  w.length <= 3 ? w : w.replace(/ies$/, "y").replace(/(ing|ed|s)$/, "").replace(/e$/, "");

export function tokenize(s: string): string[] {
  const words = s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}

/** Rough token estimate (~4 chars per token for English). */
export const estTokens = (s: string) => Math.ceil(s.length / 4);

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
