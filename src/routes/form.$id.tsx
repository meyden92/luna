import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { FormShareViewer } from '@/components/form-share/FormShareViewer';
import { queryKeys } from '@/libs/query-keys';
import { claimFormShareView, type FormShareClaim, getFormShareForView } from '@/server/fns/platform';

const formShareQueryOptions = (id: string) => ({
  queryKey: queryKeys.platform.formShare(id),
  queryFn: () => getFormShareForView({ data: id }),
  staleTime: 60_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
});

const FORM_SHARE_CLAIM_CACHE_PREFIX = 'lunashare:form-share-claim:';
const FORM_SHARE_CLAIM_CACHE_MS = 30 * 60_000;

function claimCacheKey(id: string) {
  return `${FORM_SHARE_CLAIM_CACHE_PREFIX}${id}`;
}

function isClaimUsable(claim: FormShareClaim, cachedAt: number, id: string) {
  if (claim.id !== id || claim.status !== 'ok') return false;
  if (Date.now() - cachedAt > FORM_SHARE_CLAIM_CACHE_MS) return false;
  return !claim.expiresAt || new Date(claim.expiresAt).getTime() > Date.now();
}

function readCachedClaim(id: string): FormShareClaim | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(claimCacheKey(id));
    if (!raw) return null;
    const stored = JSON.parse(raw) as { claim?: FormShareClaim; cachedAt?: number };
    if (!stored.claim || typeof stored.cachedAt !== 'number') return null;
    if (!isClaimUsable(stored.claim, stored.cachedAt, id)) {
      window.sessionStorage.removeItem(claimCacheKey(id));
      return null;
    }
    return stored.claim;
  } catch {
    return null;
  }
}

function writeCachedClaim(claim: FormShareClaim) {
  if (typeof window === 'undefined' || claim.status !== 'ok') return;
  window.sessionStorage.setItem(claimCacheKey(claim.id), JSON.stringify({ claim, cachedAt: Date.now() }));
}

function ShareStatePage({
  title,
  description,
  action = 'Ask the sender to share a new link.',
}: {
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <section className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
        <div className="mb-8">
          <p className="text-sm font-semibold tracking-wide text-primary">LunaShare</p>
        </div>
        <div className="space-y-3 rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="text-sm text-muted-foreground">{action}</p>
        </div>
      </div>
    </section>
  );
}

export const Route = createFileRoute('/form/$id')({
  loader: async ({ context, params }) => {
    const share = await context.queryClient.ensureQueryData(formShareQueryOptions(params.id));
    if (share.status === 'not-found') throw notFound();
    return { share };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.share?.title ?? 'Shared Form Data' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  notFoundComponent: () => (
    <ShareStatePage
      title="Share not found"
      description="This link does not exist or has been removed."
    />
  ),
  component: FormViewPage,
});

function FormViewPage() {
  const { id } = Route.useParams();
  const { data: share } = useSuspenseQuery(formShareQueryOptions(id));
  const [claim, setClaim] = useState<FormShareClaim | null>(null);
  const [claimErrorId, setClaimErrorId] = useState<string | null>(null);
  const claimedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (share.status !== 'ok' || claimedIdRef.current === id) return;

    const cachedClaim = readCachedClaim(id);
    if (cachedClaim) {
      claimedIdRef.current = id;
      setClaim(cachedClaim);
      setClaimErrorId(null);
      return;
    }

    claimedIdRef.current = id;
    claimFormShareView({ data: id })
      .then((nextClaim) => {
        writeCachedClaim(nextClaim);
        setClaim(nextClaim);
      })
      .catch((error: unknown) => {
        console.error('[form-share] claim view failed', error);
        setClaimErrorId(id);
      });
  }, [id, share.status]);

  const activeClaim = claim?.id === id ? claim : null;
  const status = activeClaim?.status ?? share.status;
  const expiresAt = activeClaim?.expiresAt ?? share.expiresAt;
  const viewCount = activeClaim?.viewCount ?? share.viewCount;

  if (status === 'not-found') {
    return (
      <ShareStatePage
        title="Share not found"
        description="This link does not exist or has been removed."
      />
    );
  }

  if (status === 'expired-time' || status === 'expired-views') {
    return (
      <ShareStatePage
        title="This share has expired"
        description={status === 'expired-time' ? 'The link is no longer available.' : 'The maximum number of views has been reached.'}
      />
    );
  }

  if (claimErrorId === id) {
    return (
      <ShareStatePage
        title="Could not open share"
        description="The share could not be opened right now."
        action="Try refreshing the page or ask the sender for a new link."
      />
    );
  }

  if (!activeClaim) {
    return (
      <ShareStatePage
        title="Opening share"
        description="Preparing this shared form data."
        action="This should only take a moment."
      />
    );
  }

  return (
    <section className="container mx-auto py-10 px-4">
      <FormShareViewer
        shareId={share.id}
        title={share.title}
        fields={share.fields}
        expiresAt={expiresAt}
        maxViews={share.maxViews}
        viewCount={viewCount}
        viewToken={activeClaim.viewToken}
      />
    </section>
  );
}
