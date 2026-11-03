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
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host.includes(':')) return !(host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host));
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return !(a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254));
  }
  // A single-label name (a Compose service) or a reserved local suffix never resolves publicly.
  if (!host.includes('.')) return false;
  return !/\.(localhost|local|internal|lan|home\.arpa)$/.test(host);
}
