import { z } from 'zod';

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function httpUrlSchema(maxLength = 2048) {
  return z.string().trim().max(maxLength).url().refine(isHttpUrl, 'URL must use http or https');
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets as [number, number, number, number];
}

function isDisallowedIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a >= 224) return true; // multicast & reserved
  return false;
}

function isDisallowedIpv6(rawHost: string): boolean {
  const host = rawHost.toLowerCase();
  if (host === '::' || host === '::1' || host === '0:0:0:0:0:0:0:0' || host === '0:0:0:0:0:0:0:1') {
    return true;
  }
  // IPv4-mapped IPv6: ::ffff:a.b.c.d 或 URL 规范化后的 ::ffff:xxxx:xxxx
  const mappedDotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) {
    const octets = parseIpv4(mappedDotted[1]);
    return octets ? isDisallowedIpv4(octets) : true;
  }
  const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    return isDisallowedIpv4([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
  }
  // Unique Local Addresses (fc00::/7) and Link-Local (fe80::/10) and Multicast (ff00::/8)
  const firstSegment = host.split(':')[0];
  if (firstSegment) {
    const value = Number.parseInt(firstSegment, 16);
    if (Number.isFinite(value)) {
      if ((value & 0xfe00) === 0xfc00) return true; // fc00::/7
      if ((value & 0xffc0) === 0xfe80) return true; // fe80::/10
      if ((value & 0xff00) === 0xff00) return true; // ff00::/8
    }
  }
  return false;
}

/** 拦截环回、内网、链路本地、云元数据及本地保留域名，降低元数据抓取 SSRF 风险。 */
export function isDisallowedMetadataHost(rawHostname: string): boolean {
  const normalized = rawHostname.trim().toLowerCase().replace(/\.+$/, '');
  if (!normalized) return true;

  // URL.hostname 对 IPv6 带方括号，例如 "[::1]"
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    return isDisallowedIpv6(normalized.slice(1, -1));
  }
  if (normalized.includes(':')) {
    return isDisallowedIpv6(normalized);
  }

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.home.arpa')
  ) {
    return true;
  }

  const ipv4 = parseIpv4(normalized);
  if (ipv4) return isDisallowedIpv4(ipv4);

  return false;
}

export function isSafePublicHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return !isDisallowedMetadataHost(parsed.hostname);
  } catch {
    return false;
  }
}
