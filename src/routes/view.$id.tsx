import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Check, Code, Copy, Download, Grid3x3, Link as LinkIcon, Share2, Shield } from 'lucide-react';
import { toDataURL } from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import AudioContainer from '@/components/file-viewer/AudioContainer';
import ImageContainer from '@/components/file-viewer/ImageView';
import VideoContainer from '@/components/file-viewer/VideoContainer';
import { Brandmark } from '@/components/landing/Brandmark';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildOEmbedDiscoveryUrl, buildPublicFileMeta } from '@/libs/oembed';
import { queryKeys } from '@/libs/query-keys';
import { formatSize } from '@/libs/utils';
import { getViewableFile, type ViewableFile } from '@/server/fns/platform';

const PRIVATE_SIGNED_URL_TTL_MS = 900_000;
const PRIVATE_SIGNED_URL_REFRESH_MARGIN_MS = 120_000;
const PRIVATE_PREVIEW_RETRY_COOLDOWN_MS = 60_000;

const fileQueryOptions = (id: string) => ({
  queryKey: queryKeys.platform.file(id),
  queryFn: () => getViewableFile({ data: id }),
  staleTime: PRIVATE_SIGNED_URL_TTL_MS - PRIVATE_SIGNED_URL_REFRESH_MARGIN_MS,
  refetchOnWindowFocus: true,
});

export const Route = createFileRoute('/view/$id')({
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(fileQueryOptions(params.id));
    if (result.status === 'not-found') throw notFound();
    return { result };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.result.status === 'ok' ? (loaderData.result.file.title ?? 'View | LunaShare') : 'Private File | LunaShare' },
      ...(loaderData?.result.status === 'ok' && !loaderData.result.file.private
        ? buildPublicFileMeta({
            id: loaderData.result.file.id,
            title: loaderData.result.file.title,
            contentType: loaderData.result.file.contentType,
            cdnUrl: loaderData.result.file.cdnUrl,
            viewUrl: loaderData.result.file.shareUrl,
          })
        : []),
      ...(loaderData?.result.status !== 'ok' || loaderData.result.file.private ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
    ],
    links:
      loaderData?.result.status === 'ok' && !loaderData.result.file.private
        ? [
            {
              rel: 'alternate',
              type: 'application/json+oembed',
              title: loaderData.result.file.title ?? 'LunaShare oEmbed',
              href: buildOEmbedDiscoveryUrl(loaderData.result.file.shareUrl),
            },
          ]
        : [],
  }),
  notFoundComponent: () => (
    <ViewStatePage
      title="File not found"
      description="This shared file may have been deleted, or the link may be incorrect."
    />
  ),
  component: ViewPage,
});

function ViewPage() {
  const { id } = Route.useParams();
  const { data: result, refetch } = useSuspenseQuery(fileQueryOptions(id));
  if (result.status === 'not-found') throw notFound();
  if (result.status === 'forbidden') return <PrivateFileGate authenticated={result.authenticated} />;

  return (
    <ViewFilePage
      info={result.file}
      refetchFile={async () => {
        const fresh = await refetch();
        return fresh.data?.status === 'ok' ? fresh.data.file.cdnUrl : null;
      }}
    />
  );
}

function ViewFilePage({ info, refetchFile }: { info: ViewableFile; refetchFile: () => Promise<string | null> }) {
  const cdnUrl = info.cdnUrl;
  const mimeType = info.contentType;
  const isImage = mimeType.startsWith('image/');

  const tags = info.tags
    ? info.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const shareUrl = info.shareUrl;
  const downloadUrl = `/api/download?id=${encodeURIComponent(info.id)}`;
  const shareUrlDisplay = new URL(shareUrl).host;
  const uploadedLabel = new Date(info.createdAt).toUTCString();
  const fileExt = info.title?.split('.').pop()?.toUpperCase() ?? '—';
  const kindLabel = buildKind(mimeType);
  const ownerInitial = (info.owner.name || '?').charAt(0).toUpperCase();
  const previewLastRefreshAttemptAtRef = useRef(0);
  const previewRefreshInFlightRef = useRef(false);
  const refreshPrivateUrl = useCallback(async () => {
    if (!info.private) return info.cdnUrl;
    return refetchFile();
  }, [info.private, info.cdnUrl, refetchFile]);

  const recoverPrivatePreview = useCallback(() => {
    if (!info.private) return;
    if (previewRefreshInFlightRef.current) return;

    const now = Date.now();
    if (now - previewLastRefreshAttemptAtRef.current < PRIVATE_PREVIEW_RETRY_COOLDOWN_MS) return;

    previewLastRefreshAttemptAtRef.current = now;
    previewRefreshInFlightRef.current = true;
    void refreshPrivateUrl()
      .catch(() => {
        toast.error('Preview link expired. Refresh the page and try again.');
      })
      .finally(() => {
        previewRefreshInFlightRef.current = false;
      });
  }, [info.private, refreshPrivateUrl]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 700px 440px at 85% 10%, color-mix(in oklab, var(--luna-accent) 9%, transparent), transparent 65%), radial-gradient(ellipse 500px 340px at 0% 90%, color-mix(in oklab, var(--luna-accent) 6%, transparent), transparent 65%)',
        }}
      />

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-5 border-b border-luna-line bg-[color-mix(in_oklab,var(--luna-bg)_70%,transparent)] px-9 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3 rounded-full border border-luna-line bg-luna-bg px-3 py-1.5 font-mono text-[11.5px] text-luna-ink-3">
          <span className="luna-pulse-dot h-1.5 w-1.5 rounded-full" />
          <span>{info.private ? 'PRIVATE LINK' : 'PUBLIC LINK'}</span>
          <span className="h-3.5 w-px bg-luna-line" />
          <span>
            {shareUrlDisplay}/view/{info.id.slice(0, 8)}
          </span>
        </div>
        <HeaderActions
          downloadUrl={downloadUrl}
          filename={info.title || 'lunashare-download'}
          shareUrl={shareUrl}
        />
      </header>

      <div className="relative z-10 flex-1 px-9 py-8 pb-15">
        <section className="mb-7 w-full">
          {isImage ? (
            <div className="relative flex w-full items-center justify-center">
              <FilePreview
                info={info}
                cdnUrl={cdnUrl}
                onPrivateUrlExpired={recoverPrivatePreview}
              />
            </div>
          ) : (
            <div className="relative w-full min-h-[340px] overflow-hidden rounded-[18px] border border-luna-line bg-luna-bg-3 shadow-[0_30px_60px_-30px_rgba(15,21,17,0.22),0_10px_20px_-10px_rgba(15,21,17,0.1)]">
              <FilePreview
                info={info}
                cdnUrl={cdnUrl}
                onPrivateUrlExpired={recoverPrivatePreview}
              />
              <div
                className="luna-pic-corners pointer-events-none absolute inset-0"
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </section>

        <FileMetaSection
          info={info}
          kindLabel={kindLabel}
          fileExt={fileExt}
          mimeType={mimeType}
          uploadedLabel={uploadedLabel}
          ownerInitial={ownerInitial}
          shareUrl={shareUrl}
          downloadUrl={downloadUrl}
          tags={tags}
        />
      </div>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2.5 border-t border-luna-line bg-luna-bg-2 px-9 py-4 text-xs text-luna-ink-3">
        <div className="flex items-center gap-2.5">
          <Brandmark size={18} />
          <span>
            Shared on LunaShare ·{' '}
            <Link
              to="/"
              className="text-luna-accent-2"
            >
              Get your own
            </Link>
          </span>
        </div>
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-luna-ink-4">© 2026 · PRIVACY · TERMS · REPORT</div>
      </footer>
    </div>
  );
}

function PrivateFileGate({ authenticated }: { authenticated: boolean }) {
  const { id } = Route.useParams();

  return (
    <ViewStatePage
      title="This file is private"
      description={
        authenticated
          ? 'Your account does not have access to this file. Ask the owner for access or sign in with the right account.'
          : 'Sign in to view this shared file. LunaShare keeps private file details hidden until access is confirmed.'
      }
    >
      {authenticated ? (
        <Link
          to="/dashboard"
          className={btnAccentSmall}
        >
          Go to dashboard
        </Link>
      ) : (
        <Link
          to="/login"
          search={{ redirect: `/view/${id}` }}
          className={btnAccentSmall}
        >
          Sign in to view
        </Link>
      )}
      <Link
        to="/"
        className={btnGhostSmall}
      >
        Go home
      </Link>
    </ViewStatePage>
  );
}

function ViewStatePage({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 700px 440px at 85% 10%, color-mix(in oklab, var(--luna-accent) 9%, transparent), transparent 65%), radial-gradient(ellipse 500px 340px at 0% 90%, color-mix(in oklab, var(--luna-accent) 6%, transparent), transparent 65%)',
        }}
      />
      <header className="relative z-10 flex items-center justify-between border-b border-luna-line bg-[color-mix(in_oklab,var(--luna-bg)_70%,transparent)] px-9 py-4 backdrop-blur-md">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-sm font-medium text-luna-ink"
        >
          <Brandmark size={22} />
          LunaShare
        </Link>
        <span className="rounded-full border border-luna-line bg-luna-bg px-3 py-1.5 font-mono text-[11px] text-luna-ink-3">
          SECURE SHARE
        </span>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-16">
        <section className="w-full max-w-[520px] text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-luna-line bg-luna-bg-2 text-luna-accent-2">
            <Shield size={24} />
          </div>
          <h1 className="font-serif text-[42px] font-normal leading-[1.05] text-luna-ink">{title}</h1>
          <p className="mx-auto mt-4 max-w-[440px] text-sm leading-6 text-luna-ink-3">{description}</p>
          {children ? <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">{children}</div> : null}
        </section>
      </main>
      <footer className="relative z-10 border-t border-luna-line bg-luna-bg-2 px-9 py-4 text-center text-xs text-luna-ink-3">
        Private file metadata is only shown after access is verified.
      </footer>
    </div>
  );
}

// A proper component (not a render closure) so React can diff the preview
// subtree — re-creating it on every parent render reset video/audio playback.
function FilePreview({ info, cdnUrl, onPrivateUrlExpired }: { info: ViewableFile; cdnUrl: string; onPrivateUrlExpired: () => void }) {
  if (info.contentType.startsWith('image/'))
    return (
      <ImageContainer
        src={cdnUrl}
        onError={onPrivateUrlExpired}
      />
    );
  if (info.contentType.startsWith('audio/'))
    return (
      <AudioContainer
        src={cdnUrl}
        title={info.title || 'Untitled Audio'}
        data={info.metadata}
        onError={onPrivateUrlExpired}
      />
    );
  if (info.contentType.startsWith('video/'))
    return (
      <VideoContainer
        src={cdnUrl}
        title={info.title || 'Untitled Video'}
        onError={onPrivateUrlExpired}
      />
    );
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center text-center text-sm text-luna-ink-3">
      This file has no in-browser preview. Use the download button to open it.
    </div>
  );
}

function buildKind(contentType: string): string {
  if (contentType.startsWith('image/')) return '01 · PHOTO';
  if (contentType.startsWith('video/')) return '02 · VIDEO';
  if (contentType.startsWith('audio/')) return '03 · AUDIO';
  return '04 · FILE';
}

function FileMetaSection({
  info,
  kindLabel,
  fileExt,
  mimeType,
  uploadedLabel,
  ownerInitial,
  shareUrl,
  downloadUrl,
  tags,
}: {
  info: ViewableFile;
  kindLabel: string;
  fileExt: string;
  mimeType: string;
  uploadedLabel: string;
  ownerInitial: string;
  shareUrl: string;
  downloadUrl: string;
  tags: string[];
}) {
  const [activeShareDialog, setActiveShareDialog] = useState<'qr' | 'embed' | null>(null);
  const shareTitle = info.title || 'LunaShare file';
  const embedCode = `<iframe src="${escapeHtmlAttribute(shareUrl)}" title="${escapeHtmlAttribute(shareTitle)}" width="640" height="360" loading="lazy" allowfullscreen></iframe>`;
  const handleShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error('Could not share link');
    }
  }, [shareTitle, shareUrl]);

  return (
    <section className="mx-auto max-w-[1180px] px-1 pt-2">
      <div className="mb-3.5 flex items-center justify-between">
        <span className="rounded-full border border-luna-line bg-luna-bg px-2.5 py-0.5 font-mono text-[10.5px] tracking-[0.12em] text-luna-ink-3">
          {kindLabel}
        </span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-luna-ink-4">
          {info.size && info.size > 0 ? formatSize(info.size) : '—'} · {fileExt}
        </span>
      </div>

      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <h1 className="min-w-0 flex-1 break-words font-serif text-[44px] font-normal leading-[1.04] tracking-[-0.02em] text-luna-ink">
          {info.title || 'Untitled'}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <CopyLinkButton shareUrl={shareUrl} />
          <DownloadButton
            downloadUrl={downloadUrl}
            filename={info.title || 'lunashare-download'}
            label="Download original"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 border-y border-luna-line sm:grid-cols-2 lg:grid-cols-4">
        <MetaCell label="Uploaded">
          <span className="font-mono">{uploadedLabel}</span>
        </MetaCell>
        <MetaCell label="Owner">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-luna-accent-soft font-mono text-[10px] font-bold text-luna-accent-2">
            {ownerInitial}
          </span>
          {info.owner.name}
        </MetaCell>
        <MetaCell label="Type">
          <span className="font-mono">{mimeType}</span>
        </MetaCell>
        <MetaCell
          label="Visibility"
          last
        >
          <span className="font-mono">{info.private ? 'private' : 'public'}</span>
        </MetaCell>
      </div>

      {tags.length > 0 && (
        <>
          <SepHeading>Tags</SepHeading>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full border border-luna-line bg-luna-bg px-2.5 py-1 text-xs text-luna-ink-2 transition-colors hover:border-luna-line-2"
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: 'var(--luna-accent)' }}
                />
                {tag}
              </span>
            ))}
          </div>
        </>
      )}

      <SepHeading>Share</SepHeading>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[280px] flex-1 items-center gap-2.5 rounded-[10px] border border-luna-line bg-luna-bg-2 py-2 pl-3.5 pr-2.5">
          <LinkIcon size={14} />
          <span className="flex-1 truncate font-mono text-xs text-luna-ink-2">{shareUrl}</span>
          <CopyLinkButton
            shareUrl={shareUrl}
            compact
          />
        </div>
        <div className="flex gap-1.5">
          <IconBtn
            title="Share"
            ariaLabel="Share"
            onClick={() => void handleShare()}
          >
            <Share2 size={14} />
          </IconBtn>
          <IconBtn
            title="QR code"
            ariaLabel="QR code"
            onClick={() => setActiveShareDialog('qr')}
          >
            <Grid3x3 size={14} />
          </IconBtn>
          <IconBtn
            title="Embed"
            ariaLabel="Embed"
            onClick={() => setActiveShareDialog('embed')}
          >
            <Code size={14} />
          </IconBtn>
        </div>
      </div>

      <QrCodeDialog
        open={activeShareDialog === 'qr'}
        onOpenChange={(open) => setActiveShareDialog(open ? 'qr' : null)}
        shareUrl={shareUrl}
      />
      <EmbedDialog
        open={activeShareDialog === 'embed'}
        onOpenChange={(open) => setActiveShareDialog(open ? 'embed' : null)}
        embedCode={embedCode}
      />

      <div className="mt-6.5 flex items-center gap-1.5 text-[11px] text-luna-ink-4">
        <Shield size={12} />
        <span>Scanned · Safe · Served with end-to-end TLS</span>
      </div>
    </section>
  );
}

function escapeHtmlAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const btnGhostSmall =
  'inline-flex items-center gap-2 rounded-[10px] border border-luna-line bg-luna-bg px-3 py-1.5 text-xs font-medium text-luna-ink transition-all hover:bg-luna-bg-2';
const btnAccentSmall =
  'inline-flex items-center gap-2 rounded-[10px] bg-luna-accent px-3 py-1.5 text-xs font-medium text-[oklch(0.15_0.03_162)] transition-all hover:-translate-y-px hover:shadow-[0_10px_24px_-10px_color-mix(in_oklab,var(--luna-accent)_55%,transparent)]';

function useCopy(text: string, errorMessage = 'Could not copy link') {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error(errorMessage);
    }
  }, [errorMessage, text]);
  return { copied, onCopy };
}

function CopyLinkButton({ shareUrl, compact }: { shareUrl: string; compact?: boolean }) {
  const { copied, onCopy } = useCopy(shareUrl);
  if (compact) {
    return (
      <button
        type="button"
        className={btnGhostSmall}
        onClick={onCopy}
        aria-label={copied ? 'Copied' : 'Copy link'}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={btnGhostSmall}
      onClick={onCopy}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}

function DownloadButton({ downloadUrl, filename, label = 'Download' }: { downloadUrl: string; filename: string; label?: string }) {
  return (
    <a
      className={btnAccentSmall}
      href={downloadUrl}
      download={filename}
      rel="noopener"
    >
      <Download size={13} /> {label}
    </a>
  );
}

function HeaderActions({ downloadUrl, filename, shareUrl }: { downloadUrl: string; filename: string; shareUrl: string }) {
  return (
    <div className="flex items-center gap-2">
      <CopyLinkButton shareUrl={shareUrl} />
      <DownloadButton
        downloadUrl={downloadUrl}
        filename={filename}
      />
    </div>
  );
}

function QrCodeDialog({ open, onOpenChange, shareUrl }: { open: boolean; onOpenChange: (open: boolean) => void; shareUrl: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setQrDataUrl(null);
    setHasError(false);

    toDataURL(shareUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
      color: {
        dark: '#111827',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setHasError(true);
      });

    return () => {
      active = false;
    };
  }, [open, shareUrl]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>QR code</DialogTitle>
          <DialogDescription>Scan this code to open the shared file.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-64 w-64 items-center justify-center rounded-[14px] border border-luna-line bg-white p-3">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code for shared file"
                className="h-full w-full"
              />
            ) : hasError ? (
              <p className="px-4 text-center text-sm text-luna-ink-3">Could not generate a QR code.</p>
            ) : (
              <p className="text-sm text-luna-ink-3">Generating...</p>
            )}
          </div>
          <div className="flex w-full items-center gap-2 rounded-[10px] border border-luna-line bg-luna-bg-2 py-2 pl-3.5 pr-2.5">
            <span className="flex-1 truncate font-mono text-xs text-luna-ink-2">{shareUrl}</span>
            <CopyLinkButton
              shareUrl={shareUrl}
              compact
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmbedDialog({ open, onOpenChange, embedCode }: { open: boolean; onOpenChange: (open: boolean) => void; embedCode: string }) {
  const { copied, onCopy } = useCopy(embedCode, 'Could not copy embed code');

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Embed</DialogTitle>
          <DialogDescription>Copy this iframe into a page that should display the shared file.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <pre className="max-h-44 overflow-auto rounded-[12px] border border-luna-line bg-luna-bg-2 p-3 font-mono text-xs leading-5 text-luna-ink-2">
            <code>{embedCode}</code>
          </pre>
          <button
            type="button"
            className={btnGhostSmall}
            onClick={onCopy}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy embed code'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaCell({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 py-3.5 pr-5 ${last ? '' : 'border-r border-dashed border-luna-line'}`}>
      <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-luna-ink-3">{label}</span>
      <span className="inline-flex items-center gap-2 text-[13px] text-luna-ink">{children}</span>
    </div>
  );
}

function SepHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="luna-sep-rule relative my-6.5 mb-3">
      <span className="relative bg-luna-bg pr-3 text-[10.5px] font-medium uppercase tracking-[0.14em] text-luna-ink-4">{children}</span>
    </div>
  );
}

function IconBtn({
  children,
  title,
  ariaLabel,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-luna-line bg-luna-bg text-luna-ink transition-all hover:-translate-y-px hover:bg-luna-bg-2 hover:shadow-[0_1px_0_rgba(15,21,17,0.04),0_1px_2px_rgba(15,21,17,0.04)]"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
