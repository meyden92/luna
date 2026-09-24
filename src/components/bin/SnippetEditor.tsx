import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, Globe, Link2, Lock, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Segmented, type SegmentedItem } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { SUPPORTED_LANGUAGES } from '@/libs/languages';
import { queryKeys } from '@/libs/query-keys';
import { type UpdateBinInput, updateBinSchema } from '@/schemas/bin-schema';
import { deleteBin, updateBin } from '@/server/fns/bins';
import { SnippetCodeArea } from './SnippetCodeArea';
import styles from './SnippetEditor.module.css';
import type { Bin } from './types';

const VISIBILITY_ITEMS: SegmentedItem<'private' | 'public'>[] = [
  {
    value: 'private',
    label: (
      <>
        <Lock size={13} />
        Private
      </>
    ),
  },
  {
    value: 'public',
    label: (
      <>
        <Globe size={13} />
        Anyone with the link
      </>
    ),
  },
];

/** Builds the payload `updateBinSchema` expects, mapping the 'auto' sentinel to undefined so the server re-detects it. */
function toUpdateInput(bin: Bin, fields: { title: string; content: string; language: string; isPublic: boolean }) {
  return {
    id: bin.id,
    title: fields.title,
    content: fields.content,
    language: fields.language === 'auto' ? undefined : fields.language,
    isPublic: fields.isPublic,
  };
}

function downloadAsFile(title: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title || 'snippet'}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openRaw(content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // The new tab has had time to load its own copy by the time this runs.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface SnippetEditorProps {
  bin: Bin;
  onDeleted: (id: string) => void;
}

/**
 * The right-hand pane: title bar, language/visibility options, the code area
 * and a save-status footer. Mounted with `key={bin.id}` by the caller, so its
 * local draft state resets cleanly whenever a different row is selected.
 */
export function SnippetEditor({ bin, onDeleted }: SnippetEditorProps) {
  const queryClient = useQueryClient();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editTokenRef = useRef(0);

  const [title, setTitle] = useState(bin.title ?? '');
  const [content, setContent] = useState(bin.content);
  const [language, setLanguage] = useState(bin.language ?? 'auto');
  const [isPublic, setIsPublic] = useState(bin.isPublic);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(
    () => !updateBinSchema.safeParse(toUpdateInput(bin, { title, content, language, isPublic })).success,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  // A freshly created snippet starts as "Untitled snippet" and wants its title
  // ready to overwrite immediately, matching the New button's behaviour. Runs
  // once for the mount that follows selecting this snippet (the caller keys
  // this component on bin.id), so it intentionally ignores later prop changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above — deliberately mount-only.
  useEffect(() => {
    if (bin.title === 'Untitled snippet') {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, []);

  const debouncedSave = useDebouncedCallback(async (input: UpdateBinInput, token: number) => {
    try {
      const updated = await updateBin({ data: input });
      queryClient.setQueryData<Bin[]>(queryKeys.bins.mine, (bins) => bins?.map((b) => (b.id === updated.id ? updated : b)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the snippet');
    } finally {
      if (editTokenRef.current === token) setSaving(false);
    }
  }, 700);

  const { mutate: destroy, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteBin({ data: { id: bin.id } }),
    onSuccess: () => {
      queryClient.setQueryData<Bin[]>(queryKeys.bins.mine, (bins) => bins?.filter((b) => b.id !== bin.id));
      toast.success('Snippet deleted');
      setConfirmOpen(false);
      onDeleted(bin.id);
    },
    onError: (error: Error) => toast.error(error.message || 'Could not delete the snippet'),
  });

  /** Applies an edit locally, then validates and schedules the debounced save. Nothing is persisted while invalid. */
  function commit(patch: Partial<{ title: string; content: string; language: string; isPublic: boolean }>) {
    const next = {
      title: patch.title ?? title,
      content: patch.content ?? content,
      language: patch.language ?? language,
      isPublic: patch.isPublic ?? isPublic,
    };
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.content !== undefined) setContent(patch.content);
    if (patch.language !== undefined) setLanguage(patch.language);
    if (patch.isPublic !== undefined) setIsPublic(patch.isPublic);

    const result = updateBinSchema.safeParse(toUpdateInput(bin, next));
    setInvalid(!result.success);
    if (!result.success) return;

    const token = ++editTokenRef.current;
    setSaving(true);
    debouncedSave(result.data, token);
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(content);
    toast.success('Code copied');
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/bin/${bin.id}`);
    toast.success('Link copied');
  };

  const footerText = invalid ? 'Needs a 3+ character title and 10+ characters of code to save' : saving ? 'Saving…' : 'Saved';

  return (
    <section className={styles.root}>
      <div className={styles.topBar}>
        <input
          ref={titleInputRef}
          className={styles.titleInput}
          value={title}
          maxLength={40}
          aria-label="Title"
          onChange={(e) => commit({ title: e.target.value })}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={copyCode}
        >
          <Copy />
          Copy code
        </Button>
        {isPublic ? (
          <Button
            size="sm"
            onClick={copyLink}
          >
            <Link2 />
            Copy link
          </Button>
        ) : (
          // A disabled button swallows its own hover, so the tooltip hangs off a wrapper.
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button
                size="sm"
                variant="outline"
                disabled
              >
                <Link2 />
                Copy link
              </Button>
            </TooltipTrigger>
            <TooltipContent>Make it public to share a link</TooltipContent>
          </Tooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="More"
              />
            }
          >
            <MoreHorizontal size={15} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => downloadAsFile(title, content)}>
              <Download />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openRaw(content)}>
              <ExternalLink />
              Open raw
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className={styles.optsRow}>
        {/* Base UI's SelectValue renders the raw value unless the root is handed the
            options, so the trigger would read "typescript" rather than "TypeScript". */}
        <Select
          items={SUPPORTED_LANGUAGES}
          value={language}
          onValueChange={(value) => value && commit({ language: value })}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <SelectItem
                key={lang.value}
                value={lang.value}
              >
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Segmented
          label="Visibility"
          items={VISIBILITY_ITEMS}
          value={isPublic ? 'public' : 'private'}
          onValueChange={(value) => commit({ isPublic: value === 'public' })}
        />
      </div>
      <SnippetCodeArea
        content={content}
        language={language === 'auto' ? 'text' : language}
        onChange={(value) => commit({ content: value })}
      />
      <div className={styles.footer}>
        <span className={styles.status}>
          <i
            className={styles.statusDot}
            data-saving={(!invalid && saving) || undefined}
          />
          {footerText}
        </span>
        <span className={styles.counts}>
          {content.split('\n').length} lines · {content.length} characters
        </span>
      </div>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this snippet?</AlertDialogTitle>
            <AlertDialogDescription>Its link will stop working. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={() => destroy()}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
