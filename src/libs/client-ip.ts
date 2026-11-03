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

  const forwardedFor = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return forwardedFor?.at(-trustedProxyHops) ?? socketIp;
}
