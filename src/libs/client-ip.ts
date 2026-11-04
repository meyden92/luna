/**
 * The client's IP address, for rate limiting and session tracking (#100).
 *
 * With `trustedProxyHops` (`TRUSTED_PROXY_HOPS`) above 0 it is the entry that
 * many places from the right of `x-forwarded-for`: the address the outermost
 * trusted proxy saw. Entries further left came from the client and are never
 * used. With 0, or when no such entry exists, it is the socket peer, so a
 * client reaching the origin directly cannot choose its own address.
 */
export function clientIp(headers: Headers, trustedProxyHops: number, socketIp: string | undefined): string | undefined {
  if (trustedProxyHops <= 0) return socketIp;
  return forwardedChain(headers).at(-trustedProxyHops) ?? socketIp;
}

/** The `x-forwarded-for` entries, left (client side) to right (nearest proxy). */
function forwardedChain(headers: Headers): string[] {
  return (
    headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean) ?? []
  );
}

/** Loopback, private-network, shared (CGNAT, e.g. Tailscale) and link-local addresses, IPv4, IPv6 and IPv4-mapped. */
export function isPrivateIp(ip: string): boolean {
  const address = ip.toLowerCase().replace(/^::ffff:(?=\d+\.)/, '');
  const octets = address.split('.').map(Number);
  if (octets.length === 4) {
    const [a, b] = octets as [number, number];
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return address === '::1' || /^f[cd]/.test(address) || /^fe[89ab]/.test(address);
}

/** A detectable sign that `TRUSTED_PROXY_HOPS` does not match the proxies in front of the app. */
export type ProxyWarning =
  /** Hops is 0, yet the connection comes from a private address and carries `x-forwarded-for`. */
  | 'proxy-untrusted'
  /** More hops are trusted than the chain has entries, so the socket address is used. */
  | 'hops-exceed-chain'
  /** The derived address is private: probably a proxy's, so too few hops are trusted. */
  | 'derived-private'
  /** Cloudflare's `cf-connecting-ip` sits at a different hop than the configured one. */
  | 'hops-differ-from-cloudflare';

/**
 * How `clientIp` resolves the given request, for the admin panel's diagnostics
 * card (#236). `chain` lists `x-forwarded-for` left to right, each entry with
 * the hop value that would select it. A hop count that is too high cannot be
 * detected unless Cloudflare reports the address (`suggestedHops`).
 */
export function proxyDiagnosis(headers: Headers, trustedProxyHops: number, socketIp: string | undefined) {
  const entries = forwardedChain(headers);
  const chain = entries.map((ip, index) => ({ ip, hop: entries.length - index }));
  const derivedIp = clientIp(headers, trustedProxyHops, socketIp);
  const cloudflareIp = headers.get('cf-connecting-ip');
  const suggestedHops = chain.findLast((entry) => entry.ip === cloudflareIp)?.hop ?? null;

  const warnings: ProxyWarning[] = [];
  if (trustedProxyHops === 0 && chain.length > 0 && socketIp && isPrivateIp(socketIp)) warnings.push('proxy-untrusted');
  if (trustedProxyHops > chain.length && trustedProxyHops > 0) warnings.push('hops-exceed-chain');
  else if (trustedProxyHops > 0 && derivedIp && isPrivateIp(derivedIp)) warnings.push('derived-private');
  if (suggestedHops !== null && suggestedHops !== trustedProxyHops) warnings.push('hops-differ-from-cloudflare');

  return { socketIp: socketIp ?? null, chain, trustedProxyHops, derivedIp: derivedIp ?? null, suggestedHops, warnings };
}
