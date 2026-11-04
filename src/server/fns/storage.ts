import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { storageByKind, storageUsage } from '@/db/queries/files';
import { userStorageQuotaMiB } from '@/db/queries/storage';
import { env } from '@/libs/env';
import { storageQuotaMiBToBytes } from '@/libs/storage-quota';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const proxyImageSchema = z.object({ imageUrl: z.string().min(1) });

// Hosts the image proxy is allowed to fetch from: the deployment's own CDN,
// derived from CDN_URL, plus any extras in PROXY_ALLOWED_DOMAINS
// (comma-separated). Resolved lazily so importing this module never touches the
// environment.
let allowedProxyHosts: Set<string> | undefined;

function getAllowedProxyHosts(): Set<string> {
  if (allowedProxyHosts) return allowedProxyHosts;
  const hosts = new Set<string>();
  // CDN_URL is validated as a URL by the env schema.
  hosts.add(new URL(env.CDN_URL).hostname);
  for (const entry of env.PROXY_ALLOWED_DOMAINS?.split(',') ?? []) {
    const host = entry.trim();
    if (host) hosts.add(host);
  }
  allowedProxyHosts = hosts;
  return hosts;
}

export const proxyImage = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(proxyImageSchema)
  .handler(async ({ data }) => {
    let valid: URL;
    try {
      valid = new URL(data.imageUrl);
    } catch {
      throw new Error('Invalid URL format');
    }
    if (!['http:', 'https:'].includes(valid.protocol)) throw new Error('Invalid URL protocol');
    if (!getAllowedProxyHosts().has(valid.hostname)) throw new Error('Domain not allowed');

    const response = await fetch(valid.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'LunaShare-Image-Proxy/1.0' },
    });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);

    const buf = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    return new Response(buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': buf.byteLength.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  });

export const getStorageUsage = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(
    async ({
      context,
    }): Promise<{
      totalBytes: number;
      fileCount: number;
      quotaBytes: number;
      byKind: { image: number; video: number; audio: number; other: number };
    }> => {
      const userId = userIdFromCtx(context);
      const [{ totalBytes, fileCount }, quotaMiB, byKind] = await Promise.all([
        storageUsage(userId),
        userStorageQuotaMiB(userId),
        storageByKind(userId),
      ]);
      return { totalBytes, fileCount, quotaBytes: storageQuotaMiBToBytes(quotaMiB), byKind };
    },
  );
