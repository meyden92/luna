import { createFileRoute } from '@tanstack/react-router';
import { getPlatformSettings } from '@/db/queries/platform-settings';
import { checkScopedRateLimit, retryAfterSeconds } from '@/libs/api/rate-limit';
import { validateTokenKey } from '@/libs/auth/token-auth';
import { UnauthorizedError } from '@/libs/rbac/guards';
import { storeSharexUpload } from '@/libs/sharex-upload';

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
let inFlightSharexUploads = 0;

function tryAcquireUploadSlot(concurrency: number): boolean {
  if (inFlightSharexUploads >= concurrency) {
    return false;
  }
  inFlightSharexUploads += 1;
  return true;
}

function releaseUploadSlot(): void {
  inFlightSharexUploads = Math.max(0, inFlightSharexUploads - 1);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function authenticateTokenFromForm(formData: FormData, headers: Headers) {
  const authHeader = headers.get('authorization');
  let key: string | null = null;
  if (authHeader?.startsWith('Bearer ')) key = authHeader.slice(7);
  else key = formData.get('token')?.toString() || null;

  if (!key) throw new UnauthorizedError('Missing authentication token');

  const tokenRecord = await validateTokenKey(key);
  if (!tokenRecord) throw new UnauthorizedError('Invalid token');
  return { user: { id: tokenRecord.user.id, email: tokenRecord.user.email }, tokenRecord };
}

async function handle(request: Request): Promise<Response> {
  const { sharexMaxUploadMib, sharexUploadConcurrency } = await getPlatformSettings();
  const maxUploadBytes = sharexMaxUploadMib * 1024 * 1024;
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > maxUploadBytes + MULTIPART_OVERHEAD_BYTES) {
    return json({ error: 'File too large', code: 'PAYLOAD_TOO_LARGE' }, 413);
  }

  if (!tryAcquireUploadSlot(sharexUploadConcurrency)) {
    return new Response(JSON.stringify({ error: 'Server busy', code: 'SERVER_BUSY' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '5' },
    });
  }

  try {
    return await handleWithUploadSlot(request, maxUploadBytes);
  } finally {
    releaseUploadSlot();
  }
}

async function handleWithUploadSlot(request: Request, maxUploadBytes: number): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid form data', code: 'VALIDATION_FAILED' }, 400);
  }

  let auth: Awaited<ReturnType<typeof authenticateTokenFromForm>>;
  try {
    auth = await authenticateTokenFromForm(formData, request.headers);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return json({ error: err.message, code: 'UNAUTHORIZED' }, 401);
    }
    throw err;
  }

  const { user, tokenRecord } = auth;

  const rl = checkScopedRateLimit('uploadSharex', user.id);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfterSeconds(rl.retryAfterMs) },
    });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return json({ error: 'Missing required fields', code: 'VALIDATION_FAILED' }, 400);
  }
  if (file.size > maxUploadBytes) {
    return json({ error: 'File too large', code: 'PAYLOAD_TOO_LARGE' }, 413);
  }

  return storeSharexUpload(user.id, tokenRecord, file);
}

export const Route = createFileRoute('/api/upload/sharex')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
