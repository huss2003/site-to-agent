"use client";
import { useState } from "react";
import { readSSE } from "@/lib/sse";
import type { Progress } from "@/lib/types";

export default function IngestForm({ demo }: { demo: boolean }) {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(15);
  const [log, setLog] = useState<Progress[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const last = log[log.length - 1];
  const agentId = last?.stage === "done" ? last.agentId : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLog([]);
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, maxPages }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "request failed");
      for await (const ev of readSSE(res)) {
        if (ev.event === "error") setError((ev.data as { message: string }).message);
        else setLog((l) => [...l, ev.data as Progress]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const frac = (last?.pages ?? 0) / (last?.total || 1);
  const pct = !last ? 0 : last.stage === "done" ? 100 : last.stage === "embed" ? 60 + 40 * frac : Math.min(60, frac * 60);

  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <p className="text-sm text-indigo-300">{demo ? "Demo mode: local embeddings + mock LLM, no keys needed" : "Live mode"}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Turn any website into a grounded chat agent.</h1>
      <p className="mt-4 text-slate-400">
        Paste a URL. We crawl it (respecting robots.txt), index it, and give you an agent that answers only from the
        site, with citations, plus an embeddable widget.
      </p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourbusiness.com"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-indigo-400"
        />
        <input
          type="number"
          min={1}
          max={50}
          value={maxPages}
          onChange={(e) => setMaxPages(Number(e.target.value))}
          title="Max pages"
          className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-3"
        />
        <button disabled={busy} className="rounded-lg bg-indigo-500 px-5 py-3 font-medium hover:bg-indigo-400 disabled:opacity-50">
          {busy ? "Building..." : "Build agent"}
        </button>
      </form>

      {(log.length > 0 || error) && (
        <div className="mt-8 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="h-2 overflow-hidden rounded bg-slate-800">
            <div className="h-full bg-indigo-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm text-slate-400">
            {log.slice(-12).map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          {agentId && (
            <a href={`/a/${agentId}`} className="mt-4 inline-block rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950">
              Open your agent
            </a>
          )}
        </div>
      )}
    </div>
  );
}
