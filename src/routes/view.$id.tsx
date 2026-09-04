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
import styles from './view.module.css';

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
    <div className={styles.page}>
      <div
        aria-hidden="true"
        className={styles.glow}
      />

      <header className={styles.header}>
        <div className={styles.badge}>
          <span className={styles.pulseDot} />
          <span>{info.private ? 'PRIVATE LINK' : 'PUBLIC LINK'}</span>
          <span className={styles.headerDivider} />
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

      <div className={styles.main}>
        <section className={styles.previewSection}>
          {isImage ? (
            <div className={styles.previewImageWrap}>
              <FilePreview
                info={info}
                cdnUrl={cdnUrl}
                onPrivateUrlExpired={recoverPrivatePreview}
              />
            </div>
          ) : (
            <div className={styles.previewFrame}>
              <FilePreview
                info={info}
                cdnUrl={cdnUrl}
                onPrivateUrlExpired={recoverPrivatePreview}
              />
              <div
                className={styles.picCorners}
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

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <Brandmark size={18} />
          <span>
            Shared on LunaShare ·{' '}
            <Link
              to="/"
              className={styles.footerLink}
            >
              Get your own
            </Link>
          </span>
        </div>
        <div className={styles.footerMeta}>© 2026 · PRIVACY · TERMS · REPORT</div>
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
          className={styles.btnAccentSmall}
        >
          Go to dashboard
        </Link>
      ) : (
        <Link
          to="/login"
          search={{ redirect: `/view/${id}` }}
          className={styles.btnAccentSmall}
        >
          Sign in to view
        </Link>
      )}
      <Link
        to="/"
        className={styles.btnGhostSmall}
      >
        Go home
      </Link>
    </ViewStatePage>
  );
}

function ViewStatePage({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div
        aria-hidden="true"
        className={styles.glow}
      />
      <header className={styles.header}>
        <Link
          to="/"
          className={styles.stateHeaderLink}
        >
          <Brandmark size={22} />
          LunaShare
        </Link>
        <span className={styles.badge}>SECURE SHARE</span>
      </header>
      <main className={styles.stateMain}>
        <section className={styles.stateSection}>
          <div className={styles.stateIcon}>
            <Shield size={24} />
          </div>
          <h1 className={styles.stateTitle}>{title}</h1>
          <p className={styles.stateDescription}>{description}</p>
          {children ? <div className={styles.stateActions}>{children}</div> : null}
        </section>
      </main>
      <footer className={styles.stateFooter}>Private file metadata is only shown after access is verified.</footer>
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
  return <div className={styles.noPreview}>This file has no in-browser preview. Use the download button to open it.</div>;
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
    <section className={styles.metaSection}>
      <div className={styles.metaTopRow}>
        <span className={styles.kindBadge}>{kindLabel}</span>
        <span className={styles.sizeMeta}>
          {info.size && info.size > 0 ? formatSize(info.size) : '—'} · {fileExt}
        </span>
      </div>

      <div className={styles.titleRow}>
        <h1 className={styles.title}>{info.title || 'Untitled'}</h1>
        <div className={styles.titleActions}>
          <CopyLinkButton shareUrl={shareUrl} />
          <DownloadButton
            downloadUrl={downloadUrl}
            filename={info.title || 'lunashare-download'}
            label="Download original"
          />
        </div>
      </div>

      <div className={styles.metaGrid}>
        <MetaCell label="Uploaded">
          <span className="type-mono">{uploadedLabel}</span>
        </MetaCell>
        <MetaCell label="Owner">
          <span className={styles.ownerAvatar}>{ownerInitial}</span>
          {info.owner.name}
        </MetaCell>
        <MetaCell label="Type">
          <span className="type-mono">{mimeType}</span>
        </MetaCell>
        <MetaCell
          label="Visibility"
          last
        >
          <span className="type-mono">{info.private ? 'private' : 'public'}</span>
        </MetaCell>
      </div>

      {tags.length > 0 && (
        <>
          <SepHeading>Tags</SepHeading>
          <div className={styles.tagsRow}>
            {tags.map((tag) => (
              <span
                key={tag}
                className={styles.tag}
              >
                <span className={styles.tagDot} />
                {tag}
              </span>
            ))}
          </div>
        </>
      )}

      <SepHeading>Share</SepHeading>
      <div className={styles.shareRow}>
        <div className={styles.shareUrlBox}>
          <LinkIcon size={14} />
          <span className={styles.shareUrlText}>{shareUrl}</span>
          <CopyLinkButton
            shareUrl={shareUrl}
            compact
          />
        </div>
        <div className={styles.shareButtons}>
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

      <div className={styles.trustRow}>
        <Shield size={12} />
        <span>Scanned · Safe · Served with end-to-end TLS</span>
      </div>
    </section>
  );
}

function escapeHtmlAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

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
        className={styles.btnGhostSmall}
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
      className={styles.btnGhostSmall}
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
      className={styles.btnAccentSmall}
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
    <div className={styles.headerActions}>
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
        <div className={styles.qrDialogBody}>
          <div className={styles.qrBox}>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code for shared file"
                className={styles.qrImage}
              />
            ) : hasError ? (
              <p className={styles.qrErrorText}>Could not generate a QR code.</p>
            ) : (
              <p className={styles.qrLoadingText}>Generating...</p>
            )}
          </div>
          <div className={styles.shareUrlBox}>
            <span className={styles.shareUrlText}>{shareUrl}</span>
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
        <div className={styles.embedBody}>
          <pre className={styles.embedPre}>
            <code>{embedCode}</code>
          </pre>
          <button
            type="button"
            className={styles.btnGhostSmall}
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
    <div
      className={styles.metaCell}
      data-position={last ? 'last' : undefined}
    >
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue}>{children}</span>
    </div>
  );
}

function SepHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.sepHeading}>
      <span className={styles.sepHeadingLabel}>{children}</span>
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
      className={styles.iconBtn}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
