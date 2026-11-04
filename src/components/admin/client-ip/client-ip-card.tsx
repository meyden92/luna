import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProxyWarning } from '@/libs/client-ip';
import { queryKeys } from '@/libs/query-keys';
import { getClientIpDiagnosis } from '@/server/fns/admin/client-ip';
import styles from './client-ip-card.module.css';

type Diagnosis = Awaited<ReturnType<typeof getClientIpDiagnosis>>;

const WARNING_TEXT: Record<ProxyWarning, (d: Diagnosis) => string> = {
  'proxy-untrusted': () =>
    'A proxy appears to be in front of the app, but TRUSTED_PROXY_HOPS is 0. Every user shares the proxy’s address, and with it one sign-in rate limit.',
  'hops-exceed-chain': (d) =>
    `TRUSTED_PROXY_HOPS is ${d.trustedProxyHops}, but X-Forwarded-For has only ${d.chain.length} ${d.chain.length === 1 ? 'entry' : 'entries'}, so the connection address is used instead.`,
  'derived-private': () => 'The derived address is a private one, most likely a proxy’s. TRUSTED_PROXY_HOPS is probably too low.',
  'hops-differ-from-cloudflare': (d) =>
    `Cloudflare reports your address at hop ${d.suggestedHops}. Set TRUSTED_PROXY_HOPS=${d.suggestedHops}.`,
};

/**
 * Shows how the app derives the client IP its rate limiters and audit log use, from the admin's own request, and
 * warns when TRUSTED_PROXY_HOPS looks wrong (#236). Mounted on the admin start page.
 */
export function ClientIpCard() {
  const { data } = useQuery({ queryKey: queryKeys.adminClientIp.diagnosis, queryFn: () => getClientIpDiagnosis() });

  return (
    <Card className={styles.card}>
      <CardHeader>
        <CardTitle>Client IP</CardTitle>
        <CardDescription>
          How the app derives your address from this request. Rate limits and the audit log use the derived address; if it is not your own,
          TRUSTED_PROXY_HOPS is wrong.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data ? (
          <>
            <dl className={styles.facts}>
              <dt>Derived address</dt>
              <dd className="type-mono">{data.derivedIp ?? 'unknown'}</dd>
              <dt>TRUSTED_PROXY_HOPS</dt>
              <dd className="type-mono">{data.trustedProxyHops}</dd>
              <dt>Connection</dt>
              <dd className="type-mono">{data.socketIp ?? 'unknown'}</dd>
              <dt>X-Forwarded-For</dt>
              <dd className="type-mono">
                {data.chain.length === 0 ? 'none' : data.chain.map(({ ip, hop }) => `${ip} (hop ${hop})`).join(', ')}
              </dd>
            </dl>
            {data.warnings.map((warning) => (
              <Alert
                key={warning}
                variant="destructive"
                className={styles.warning}
              >
                <AlertTitle>Check TRUSTED_PROXY_HOPS</AlertTitle>
                <AlertDescription>{WARNING_TEXT[warning](data)}</AlertDescription>
              </Alert>
            ))}
          </>
        ) : (
          '…'
        )}
      </CardContent>
    </Card>
  );
}
