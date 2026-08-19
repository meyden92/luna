import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  claimFormShareView as claimFormShareViewRow,
  getFormShareWithFields,
  getRevealableFormShareField,
  getViewableFile as getViewableFileRow,
} from '@/db/queries/features';
import { RATE_LIMITS } from '@/libs/api/rate-limit';
import { getCDNImage } from '@/libs/utils';
import { appMiddleware } from '@/server/server-fn';

export type ViewableFile = {
  id: string;
  title: string | null;
  url: string;
  contentType: string;
  size: number | null;
  tags: string | null;
  private: boolean;
  createdAt: string;
  ownerId: string;
  owner: { id: string; name: string | null; image: string | null };
  cdnUrl: string;
  shareUrl: string;
  metadata: {
    artist: string | null;
    lyrics: string | null;
    duration: number | null;
    width: number | null;
    height: number | null;
  } | null;
};

export type ViewableFileResult =
  | { status: 'ok'; file: ViewableFile }
  | { status: 'forbidden'; authenticated: boolean }
  | { status: 'not-found' };

export const getViewableFile = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'none', rateLimit: RATE_LIMITS.publicFileView }))
  .validator((id: unknown) => {
    if (typeof id !== 'string' || !id) throw new Error('id required');
    return id;
  })
  .handler(async ({ data: id }): Promise<ViewableFileResult> => {
    const startedAt = Date.now();
    const info = await getViewableFileRow(id);
    if (!info) return { status: 'not-found' };

    if (info.private) {
      const [{ getRequestHeaders }, { getOptionalAuthenticatedUser }, { isUserAdmin }] = await Promise.all([
        import('@tanstack/react-start/server'),
        import('@/libs/rbac/guards'),
        import('@/libs/rbac/service'),
      ]);
      const viewerId = (await getOptionalAuthenticatedUser(getRequestHeaders()))?.id;
      if (!viewerId) return { status: 'forbidden', authenticated: false };
      if (viewerId !== info.ownerId) {
        const admin = await isUserAdmin(viewerId);
        if (!admin) return { status: 'forbidden', authenticated: true };
      }
      const [{ createDeliverySession, deliverySessionCookie }, { setCookie }] = await Promise.all([
        import('@/libs/delivery-session'),
        import('@tanstack/react-start/server'),
      ]);
      const deliveryCookie = deliverySessionCookie(createDeliverySession({ kind: 'file', fileId: info.id }));
      const [cookiePair, ...cookieAttributes] = deliveryCookie.split('; ');
      const [, cookieValue] = (cookiePair ?? '').split('=');
      setCookie('ls_dlv', cookieValue ?? '', {
        httpOnly: true,
        secure: deliveryCookie.includes('; Secure'),
        sameSite: 'lax',
        path: '/api/d',
        maxAge: Number(cookieAttributes.find((attr) => attr.startsWith('Max-Age='))?.slice('Max-Age='.length) ?? 900),
      });
    }

    const cdnUrl = info.private ? `/api/d/${info.id}` : getCDNImage(`/${info.ownerId}/${info.url}`);
    const { getPublicOrigin } = await import('@/libs/request-origin');
    const [{ recordViewEvent }, { recordEgress }] = await Promise.all([
      import('@/libs/analytics/view-events'),
      import('@/libs/egress/record'),
    ]);
    void recordViewEvent({ targetKind: 'file', targetId: info.id, ownerId: info.ownerId, serverMs: Date.now() - startedAt }).catch(
      () => undefined,
    );
    if (!info.private) {
      void recordEgress({ ownerId: info.ownerId, fileId: info.id, bytes: info.size, rendition: 'original', wasEstimated: true }).catch(
        () => undefined,
      );
    }

    return {
      status: 'ok',
      file: {
        id: info.id,
        title: info.title,
        url: info.url,
        contentType: info.contentType,
        size: info.size ?? null,
        tags: info.tags,
        private: info.private,
        createdAt: info.createdAt.toISOString(),
        ownerId: info.ownerId,
        owner: { id: info.owner.id, name: info.owner.name, image: info.owner.image },
        cdnUrl,
        shareUrl: `${getPublicOrigin()}/view/${info.id}`,
        metadata: info.metadata
          ? {
              artist: info.metadata.artist,
              lyrics: info.metadata.lyrics,
              duration: info.metadata.duration,
              width: info.metadata.width,
              height: info.metadata.height,
            }
          : null,
      },
    };
  });

export type FormShareView = {
  id: string;
  title: string | null;
  fields: Array<{ id: string; label: string; value: string | null; type: string; isSensitive: boolean; sortOrder: number }>;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  status: 'ok' | 'expired-time' | 'expired-views' | 'not-found';
};

export type FormShareClaim = Pick<FormShareView, 'id' | 'expiresAt' | 'maxViews' | 'viewCount' | 'status'> & {
  viewToken: string | null;
};

const formShareIdSchema = z.string().min(1);
const revealFormShareFieldSchema = z.object({
  shareId: z.string().min(1),
  fieldId: z.string().min(1),
  token: z.string().min(1),
});
const FORM_SHARE_VIEW_TOKEN_MS = 30 * 60_000;

async function formShareTokenKey(): Promise<Buffer> {
  const { env } = await import('@/libs/env');
  return Buffer.from(env.FORM_FIELD_ENCRYPTION_KEY, 'base64');
}

async function signFormShareViewToken(shareId: string, expiresAt: Date | null): Promise<string> {
  const { createHmac } = await import('node:crypto');
  const expiresAtMs = expiresAt?.getTime();
  const exp = Math.min(Date.now() + FORM_SHARE_VIEW_TOKEN_MS, expiresAtMs ?? Number.POSITIVE_INFINITY);
  const payload = Buffer.from(JSON.stringify({ shareId, exp }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', await formShareTokenKey())
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

async function verifyFormShareViewToken(token: string, shareId: string): Promise<boolean> {
  const { createHmac, timingSafeEqual } = await import('node:crypto');
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = createHmac('sha256', await formShareTokenKey())
    .update(payload)
    .digest('base64url');
  const signatureBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expected, 'base64url');
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { shareId?: unknown; exp?: unknown };
    return data.shareId === shareId && typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

function notFoundFormShare(id: string): FormShareView {
  return {
    id,
    title: null,
    fields: [],
    expiresAt: null,
    maxViews: null,
    viewCount: 0,
    status: 'not-found',
  };
}

export const getFormShareForView = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'none', rateLimit: RATE_LIMITS.publicFormShareView }))
  .validator(formShareIdSchema)
  .handler(async ({ data: id }): Promise<FormShareView> => {
    const share = await getFormShareWithFields(id);

    if (!share) {
      return notFoundFormShare(id);
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return {
        id: share.id,
        title: share.title,
        fields: [],
        expiresAt: share.expiresAt.toISOString(),
        maxViews: share.maxViews,
        viewCount: share.viewCount,
        status: 'expired-time',
      };
    }

    if (share.maxViews !== null && share.viewCount >= share.maxViews) {
      return {
        id: share.id,
        title: share.title,
        fields: [],
        expiresAt: share.expiresAt?.toISOString() ?? null,
        maxViews: share.maxViews,
        viewCount: share.viewCount,
        status: 'expired-views',
      };
    }

    const fields = share.fields
      .filter((field) => field.type !== 'hidden')
      .map((field) => ({
        id: field.id,
        label: field.label,
        value: field.isSensitive ? null : field.value,
        type: field.type,
        isSensitive: field.isSensitive,
        sortOrder: field.sortOrder,
      }));

    return {
      id: share.id,
      title: share.title,
      fields,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      maxViews: share.maxViews,
      viewCount: share.viewCount,
      status: 'ok',
    };
  });

export const claimFormShareView = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'none', rateLimit: RATE_LIMITS.publicFormShareClaim }))
  .validator(formShareIdSchema)
  .handler(async ({ data: id }): Promise<FormShareClaim> => {
    // The claim is atomic inside the query function: it locks the row, decides
    // whether the share is still viewable, and increments the counter in one
    // transaction, so concurrent viewers cannot both slip past `maxViews`.
    const claimed = await claimFormShareViewRow(id);

    if (claimed.status === 'not-found') {
      return { id, expiresAt: null, maxViews: null, viewCount: 0, status: 'not-found', viewToken: null };
    }

    if (claimed.status !== 'ok') {
      return {
        id: claimed.id,
        expiresAt: claimed.expiresAt?.toISOString() ?? null,
        maxViews: claimed.maxViews,
        viewCount: claimed.viewCount,
        status: claimed.status,
        viewToken: null,
      };
    }

    return {
      id: claimed.id,
      expiresAt: claimed.expiresAt?.toISOString() ?? null,
      maxViews: claimed.maxViews,
      viewCount: claimed.viewCount,
      status: 'ok',
      viewToken: claimed.hasSensitiveFields ? await signFormShareViewToken(claimed.id, claimed.expiresAt) : null,
    };
  });

export const revealFormShareField = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'none', rateLimit: RATE_LIMITS.publicFormShareReveal }))
  .validator(revealFormShareFieldSchema)
  .handler(async ({ data }): Promise<{ value: string }> => {
    if (!(await verifyFormShareViewToken(data.token, data.shareId))) {
      throw new Error('Reveal session expired');
    }

    const field = await getRevealableFormShareField({ fieldId: data.fieldId, shareId: data.shareId });

    if (!field) throw new Error('Field not found');
    if (field.formExpiresAt && field.formExpiresAt < new Date()) throw new Error('This share has expired');

    const { decryptFieldValue } = await import('@/libs/encryption/field-encryption');
    return { value: decryptFieldValue(field.value) };
  });
