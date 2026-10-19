import { readCapped, safeFetch } from "./safefetch";

export interface Robots {
  allowed(path: string): boolean;
  sitemaps: string[];
}
const ALLOW_ALL: Robots = { allowed: () => true, sitemaps: [] };
const DENY_ALL: Robots = { allowed: () => false, sitemaps: [] };

/** Minimal RFC 9309 parser: group selection by UA, longest-match wins, `*` and `$` wildcards. */
export function parseRobots(txt: string, ua = "site-to-agent"): Robots {
  type Group = { agents: string[]; rules: { allow: boolean; re: RegExp; len: number }[] };
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap" && val) sitemaps.push(val);
    else if ((key === "allow" || key === "disallow") && cur && val) {
      const src = val.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      cur.rules.push({ allow: key === "allow", re: new RegExp("^" + src), len: val.length });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && ua.toLowerCase().includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  return {
    sitemaps,
    allowed(path) {
      const m = rules.filter((r) => r.re.test(path)).sort((a, b) => b.len - a.len || Number(b.allow) - Number(a.allow));
      return m.length ? m[0].allow : true;
    },
  };
}

export async function fetchRobots(origin: string, headers: HeadersInit): Promise<Robots> {
  try {
    const res = await safeFetch(`${origin}/robots.txt`, { headers, timeoutMs: 6000 });
    if (res.ok) return parseRobots(await readCapped(res, 500_000));
    return res.status >= 500 ? DENY_ALL : ALLOW_ALL; // 4xx: no robots; 5xx: be conservative
  } catch {
    return ALLOW_ALL;
  }
}
