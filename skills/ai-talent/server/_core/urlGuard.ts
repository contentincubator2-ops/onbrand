/**
 * urlGuard.ts — SSRF guard for all server-side URL fetching.
 *
 * 2026-06-28 (security scan): the app fetches user-supplied URLs in several
 * places (brand website/FB scraping, siteCrawl, LLM web-fetch tool). Without a
 * guard these are SSRF sinks — an attacker can point them at internal services
 * or the cloud metadata endpoint (169.254.169.254 on Azure/AWS/GCP) to exfil
 * managed-identity tokens.
 *
 * assertUrlSafe():
 *   - only http/https
 *   - reject hostname patterns (localhost, *.internal, *.local)
 *   - DNS-resolve the hostname and reject if ANY resolved address is a
 *     private / loopback / link-local / reserved range (v4 + v6)
 *
 * Callers must ALSO re-validate every redirect hop (fetch redirect:"manual"),
 * because the initial host can 302 to an internal address. See fetchReadable.
 *
 * Residual risk: DNS rebinding (resolve public, connect private on a later
 * lookup) is not fully closed without IP-pinning the socket. For a marketing
 * app this resolve-and-check + per-hop re-validation is the proportionate bar;
 * pin the socket if this ever handles higher-sensitivity fetches.
 */
import { lookup } from "node:dns/promises";

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
  /^metadata(\.google)?\.internal$/i,
];

/** True if an IPv4 dotted string is in a private / reserved / link-local range. */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true;                         // 0.0.0.0/8
  if (a === 10) return true;                        // 10.0.0.0/8 private
  if (a === 127) return true;                       // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;          // 169.254.0.0/16 link-local (cloud metadata!)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true;// 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true;            // 192.0.0.0/24 + 192.0.2.0/24 special-use
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true;                        // 224+ multicast / 240+ reserved / 255.255.255.255
  return false;
}

/** True if an IPv6 string is loopback / unspecified / ULA / link-local, or maps to a private v4. */
function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (addr === "::1" || addr === "::") return true;           // loopback / unspecified
  if (/^fe[89ab]/.test(addr)) return true;                    // fe80::/10 link-local
  if (/^f[cd]/.test(addr)) return true;                       // fc00::/7 unique-local
  // IPv4-mapped (::ffff:a.b.c.d) or embedded v4 → check the v4 part
  const v4 = addr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4?.[1]) return isPrivateIPv4(v4[1]);
  return false;
}

function isPrivateAddress(ip: string, family: number): boolean {
  return family === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/**
 * Throws if `rawUrl` is unsafe to fetch server-side. Resolves DNS and rejects
 * any host that maps to a private/reserved address. Call before EVERY fetch,
 * including each redirect hop.
 */
export async function assertUrlSafe(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`SSRF guard: invalid URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`SSRF guard: blocked protocol ${u.protocol}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(host))) {
    throw new Error(`SSRF guard: blocked host ${host}`);
  }
  // If the host is already a literal IP, check it directly.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIPv4(host)) throw new Error(`SSRF guard: private IPv4 ${host}`);
    return u;
  }
  if (host.includes(":")) {
    if (isPrivateIPv6(host)) throw new Error(`SSRF guard: private IPv6 ${host}`);
    return u;
  }
  // Otherwise resolve DNS and reject if ANY address is private.
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`SSRF guard: DNS resolution failed for ${host}`);
  }
  if (addrs.length === 0) throw new Error(`SSRF guard: no DNS records for ${host}`);
  for (const a of addrs) {
    if (isPrivateAddress(a.address, a.family)) {
      throw new Error(`SSRF guard: ${host} resolves to private address ${a.address}`);
    }
  }
  return u;
}
