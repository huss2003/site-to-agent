import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBlockedIp } from "../src/lib/safefetch";

describe("ssrf guard", () => {
  it("blocks private, loopback, link-local, metadata, mapped and ULA", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1"])
      expect(isBlockedIp(ip), ip).toBe(true);
    expect(isBlockedIp("93.184.216.34")).toBe(false);
  });
  it("rejects bad schemes, ports, credentials and local names", () => {
    for (const u of ["file:///etc/passwd", "http://localhost/", "http://[::1]/", "http://2130706433/", "http://a:b@example.com/", "http://example.com:6379/", "http://metadata/"])
      expect(() => assertPublicUrl(new URL(u)), u).toThrow();
    expect(() => assertPublicUrl(new URL("https://example.com/"))).not.toThrow();
  });
});
