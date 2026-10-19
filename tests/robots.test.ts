import { describe, expect, it } from "vitest";
import { parseRobots } from "../src/lib/robots";

describe("parseRobots", () => {
  const txt = `
# comment
User-agent: *
Disallow: /private/
Disallow: /*.pdf$
Allow: /private/public.html
Sitemap: https://x.test/sitemap.xml

User-agent: site-to-agent
Disallow: /secret
`;
  it("prefers the group that names our user-agent", () => {
    const r = parseRobots(txt);
    expect(r.allowed("/secret/page")).toBe(false);
    expect(r.allowed("/private/a")).toBe(true); // '*' group ignored when ours matches
  });
  it("applies wildcard group, wildcards, $ and longest-match Allow", () => {
    const r = parseRobots(txt, "otherbot");
    expect(r.allowed("/private/a.html")).toBe(false);
    expect(r.allowed("/private/public.html")).toBe(true);
    expect(r.allowed("/files/a.pdf")).toBe(false);
    expect(r.allowed("/files/a.pdf?x=1")).toBe(true);
    expect(r.allowed("/menu")).toBe(true);
  });
  it("collects sitemaps and treats empty Disallow as allow-all", () => {
    expect(parseRobots(txt).sitemaps).toEqual(["https://x.test/sitemap.xml"]);
    expect(parseRobots("User-agent: *\nDisallow:").allowed("/anything")).toBe(true);
  });
});
