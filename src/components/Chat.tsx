"use client";
import { useState } from "react";
import type { Citation } from "@/lib/types";

interface Turn {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  refused?: boolean;
}

export default function Chat({ agentId, name, url, embed }: { agentId: string; name: string; url: string; embed: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<{ turn: number; n: number } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setTurns([...next, { role: "assistant", content: json.answer, citations: json.citations, refused: json.refused }]);
      setSel(json.citations.length ? { turn: next.length, n: 1 } : null);
    } catch (err) {
      setTurns([...next, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "failed"}`, refused: true }]);
    } finally {
      setBusy(false);
    }
  }

  const active = sel ? turns[sel.turn]?.citations : undefined;
  const snippet = typeof window !== "undefined"
    ? `<script src="${window.location.origin}/widget.js" data-agent="${agentId}" async></script>`
    : "";

  return (
    <div className={`mx-auto flex ${embed ? "h-screen" : "min-h-screen max-w-5xl"} flex-col gap-4 p-4 md:flex-row`}>
      <section className="flex min-h-0 flex-1 flex-col">
        {!embed && (
          <header className="mb-3">
            <h1 className="text-2xl font-semibold">{name}</h1>
            <p className="text-sm text-slate-400">Answers grounded in {url}</p>
          </header>
        )}
        <div className="flex-1 space-y-3 overflow-auto rounded-lg border border-slate-800 bg-slate-900 p-4">
          {!turns.length && <p className="text-slate-500">Ask anything about this website.</p>}
          {turns.map((t, ti) => (
            <div key={ti} className={t.role === "user" ? "text-right" : ""}>
              <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left ${
                t.role === "user" ? "bg-indigo-500" : t.refused ? "bg-amber-950 text-amber-200" : "bg-slate-800"}`}>
                {t.content.split(/(\[\d+\])/).map((part, i) => {
                  const m = /^\[(\d+)\]$/.exec(part);
                  return m ? (
                    <button key={i} onClick={() => setSel({ turn: ti, n: Number(m[1]) })} className="mx-0.5 align-super text-xs text-indigo-300 hover:underline">
                      [{m[1]}]
                    </button>
                  ) : (
                    <span key={i}>{part}</span>
                  );
                })}
              </div>
            </div>
          ))}
          {busy && <p className="text-slate-500">Thinking...</p>}
        </div>
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question..."
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 outline-none focus:border-indigo-400" />
          <button disabled={busy} className="rounded-lg bg-indigo-500 px-4 py-2 font-medium disabled:opacity-50">Send</button>
        </form>
      </section>

      {!embed && (
        <aside className="md:w-80">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Sources</h2>
          <ul className="space-y-2">
            {active?.map((c) => (
              <li key={c.n} className={`rounded-lg border p-3 text-sm ${sel?.n === c.n ? "border-indigo-400 bg-slate-900" : "border-slate-800"}`}>
                <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-indigo-300 hover:underline">
                  [{c.n}] {c.title}
                </a>
                <p className="mt-1 text-slate-400">{c.snippet}...</p>
              </li>
            )) ?? <li className="text-sm text-slate-500">Citations appear here.</li>}
          </ul>
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-slate-400">Embed this agent</summary>
            <code className="mt-2 block break-all rounded bg-slate-900 p-2 text-xs text-slate-300">{snippet}</code>
          </details>
        </aside>
      )}
    </div>
  );
}
