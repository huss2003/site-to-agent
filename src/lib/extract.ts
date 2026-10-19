import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface Extracted {
  title: string;
  text: string;
  links: string[];
}

const BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,div,br,tr,section,blockquote";

/** Pull main-content text (Readability) and outgoing links from raw HTML. Scripts are never executed. */
export function extractPage(html: string, url: string): Extracted {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;
  const links = [...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");
  const pageTitle = doc.title.trim();
  const article = new Readability(doc.cloneNode(true) as Document, { charThreshold: 50 }).parse();

  let root: Element | null = null;
  if (article?.content) root = new JSDOM(article.content).window.document.body;
  else {
    doc.querySelectorAll("script,style,nav,header,footer,noscript").forEach((e) => e.remove());
    root = doc.body;
  }
  root?.querySelectorAll(BLOCKS).forEach((e) => e.append("\n"));
  const text = (root?.textContent ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  dom.window.close();
  return { title: (article?.title || pageTitle || url).trim(), text, links };
}
