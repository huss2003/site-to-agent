import { extractPage } from "./extract";
import { fetchRobots } from "./robots";
import { assertPublicHost, assertPublicUrl, readCapped, safeFetch } from "./safefetch";

export { assertPublicUrl };

export interface Page {
  url: string;
  title: string;
  text: string;
}
export interface CrawlOpts {
  maxPages: number;
  timeoutMs: number;
  onPage?: (count: number, url: string) => void;
}

const UA = "site-to-agent/0.1 (+https://github.com/huss2003/site-to-agent)";
const HEADERS = { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9" };
const SKIP_EXT = /\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|gz|css|js|json|xml|mp[34]|mov|woff2?|ttf)$/i;
const CONCURRENCY = 4;

export function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol) || SKIP_EXT.test(u.pathname)) return null;
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.href;
  } catch {
    return null;
  }
}

const MAX_PAGE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = Number(process.env.CRAWL_MAX_BYTES ?? 20_000_000);

async function get(url: string, timeout = 8000) {
  return safeFetch(url, { headers: HEADERS, timeoutMs: timeout });
}

/** Read sitemap.xml (and robots-declared sitemaps), following one level of sitemap indexes. */
export async function readSitemaps(origin: string, declared: string[]): Promise<string[]> {
  const urls: string[] = [];
  const seen = new Set<string>();
  const visit = async (loc: string, depth: number) => {
    if (seen.has(loc) || seen.size > 6) return;
    seen.add(loc);
    try {
      const res = await get(loc);
      if (!res.ok) return;
      const xml = await readCapped(res, MAX_PAGE_BYTES);
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
      if (/<sitemapindex/i.test(xml) && depth < 1) for (const l of locs.slice(0, 3)) await visit(l, depth + 1);
      else urls.push(...locs);
    } catch {
      /* unreachable sitemap: fall back to link crawling */
    }
  };
  for (const s of new Set([`${origin}/sitemap.xml`, ...declared])) await visit(s, 0);
  return urls.slice(0, 500);
}

/** Same-origin crawl: sitemap URLs first, then BFS over links. Honours robots.txt, page cap and deadline. */
export async function crawl(startUrl: string, opts: CrawlOpts) {
  const start = new URL(startUrl);
  await assertPublicHost(start);
  const origin = start.origin;
  const deadline = Date.now() + opts.timeoutMs;
  const robots = await fetchRobots(origin, HEADERS);
  const first = normalizeUrl(start.href, start.href)!;

  const queue: string[] = [first];
  const seen = new Set(queue);
  const enqueue = (href: string, base: string) => {
    const u = normalizeUrl(href, base);
    if (u && seen.size < 2000 && new URL(u).origin === origin && !seen.has(u)) {
      seen.add(u);
      queue.push(u);
    }
  };
  for (const s of await readSitemaps(origin, robots.sitemaps)) enqueue(s, origin);

  const pages: Page[] = [];
  const skippedRobots: string[] = [];
  let active = 0;
  let bytes = 0;

  const visit = async (url: string) => {
    const u = new URL(url);
    if (!robots.allowed(u.pathname + u.search)) return void skippedRobots.push(url);
    try {
      const res = await get(url);
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return;
      if (new URL(res.url).origin !== origin) return;
      const html = await readCapped(res, MAX_PAGE_BYTES);
      bytes += html.length;
      const ex = extractPage(html, res.url);
      ex.links.forEach((l) => enqueue(l, res.url));
      if (ex.text.length >= 80 && pages.length < opts.maxPages) {
        pages.push({ url: normalizeUrl(res.url, res.url) ?? url, title: ex.title, text: ex.text });
        opts.onPage?.(pages.length, url);
      }
    } catch {
      /* timeouts and network errors just skip the page */
    }
  };

  const worker = async () => {
    while (pages.length < opts.maxPages && Date.now() < deadline && bytes < MAX_TOTAL_BYTES) {
      const next = queue.shift();
      if (!next) {
        if (!active) return;
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      active++;
      try {
        await visit(next);
      } finally {
        active--;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { pages, skippedRobots };
}
