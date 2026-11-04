/**
 * The URL fal should POST a finished request to, or null when fal could not
 * reach this instance: the public base URL must be `https` on a public host.
 * Without webhooks the poller finishes every Generation (development, E2E,
 * instances behind NAT). Pure.
 */
export const WEBHOOK_PATH = '/api/studio/fal-webhook';

export function studioWebhookUrl(baseUrl: string | undefined): string | null {
  if (!baseUrl || !URL.canParse(baseUrl)) return null;
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || !isPublicHost(url.hostname)) return null;
  return `${url.origin}${WEBHOOK_PATH}`;
}

function isPublicHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (host.includes(':')) return isPublicIpv6(host);
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (ipv4) return isPublicIpv4(Number(ipv4[1]), Number(ipv4[2]));
  // A single-label name (a Compose service) or a reserved suffix never resolves publicly.
  if (!host.includes('.')) return false;
  return !/\.(localhost|local|internal|lan|home\.arpa|test|invalid|example)$/.test(host);
}

/** Judged by the first two octets; `100.64.0.0/10` is CGNAT, which Tailscale uses. */
function isPublicIpv4(a: number, b: number): boolean {
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPublicIpv6(host: string): boolean {
  // URL parsing writes an IPv4-mapped address in hex: `::ffff:10.0.0.1` arrives as `::ffff:a00:1`.
  const mapped = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host);
  if (mapped) {
    const high = Number.parseInt(mapped[1] as string, 16);
    return isPublicIpv4(high >> 8, high & 0xff);
  }
  return !(host === '::' || host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host));
}
