import { format } from 'date-fns';
import { Calendar, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBinView } from '@/hooks/use-bin-view';
import CodeBlock from './CustomHighlighter';
import styles from './SnippetViewDialog.module.css';

export function SnippetViewDialog() {
  const { isOpen, bin, onClose } = useBinView();

  if (!bin) return null;

  const copyShareLink = async () => {
    if (!bin.isPublic) {
      toast.error('Make this snippet public before sharing it.', { richColors: true });
      return;
    }

    await navigator.clipboard.writeText(`${window.location.origin}/bin/${bin.id}`);
    toast.success('Share link copied', { richColors: true });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onClose}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <div className={styles.titleRow}>
            <DialogTitle className="type-truncate">{bin.title}</DialogTitle>
            {bin.language && <Badge variant="secondary">{bin.language}</Badge>}
            <Badge variant={bin.isPublic ? 'default' : 'outline'}>{bin.isPublic ? 'Public' : 'Private'}</Badge>
          </div>
          <div className={styles.dateRow}>
            <Calendar />
            <span>{format(new Date(bin.createdAt), 'PP')}</span>
          </div>
        </DialogHeader>

        <div className={styles.body}>
          <CodeBlock
            code={bin.content}
            language={bin.language || 'text'}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={copyShareLink}
            className={!bin.isPublic ? styles.dimmed : undefined}
            aria-disabled={!bin.isPublic}
          >
            <Copy className={styles.buttonIcon} />
            {bin.isPublic ? 'Copy share link' : 'Make public to share'}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(`/bin/${bin.id}`, '_blank', 'noopener')}
          >
            <ExternalLink className={styles.buttonIcon} />
            Open in new tab
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
