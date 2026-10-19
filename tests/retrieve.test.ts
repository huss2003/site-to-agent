import { describe, expect, it } from "vitest";
import { bm25Scores, rrf } from "../src/lib/retrieve";

describe("rrf", () => {
  it("rewards documents ranked well in both lists", () => {
    const r = rrf([["a", "b", "c"], ["b", "a", "d"]]);
    expect(r.map((x) => x.id).slice(0, 2).sort()).toEqual(["a", "b"]);
    expect(r.find((x) => x.id === "a")!.score).toBeCloseTo(1 / 61 + 1 / 62);
  });
  it("includes docs found by only one retriever", () => {
    expect(rrf([["a"], ["z"]]).map((x) => x.id).sort()).toEqual(["a", "z"]);
  });
  it("orders by fused score", () => {
    const r = rrf([["x", "y"], ["x", "y"]]);
    expect(r[0].id).toBe("x");
  });
});

describe("bm25Scores", () => {
  const docs = [
    { id: "1", text: "We sell sourdough bread and croissants" },
    { id: "2", text: "Our hours are nine to five" },
    { id: "3", text: "Bread bread bread, baked fresh" },
  ];
  it("ranks matching docs and drops non-matching", () => {
    const r = bm25Scores("fresh bread", docs);
    expect(r.map((x) => x.id)).toEqual(["3", "1"]);
  });
  it("matches simple plurals via stemming", () => {
    expect(bm25Scores("croissant", docs)[0].id).toBe("1");
  });
});
