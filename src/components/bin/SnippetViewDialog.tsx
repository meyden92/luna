import { format } from 'date-fns';
import { Calendar, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBinView } from '@/hooks/use-bin-view';
import CodeBlock from './CustomHighlighter';

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
          <div className="flex items-center gap-3">
            <DialogTitle className="truncate">{bin.title}</DialogTitle>
            {bin.language && <Badge variant="secondary">{bin.language}</Badge>}
            <Badge variant={bin.isPublic ? 'default' : 'outline'}>{bin.isPublic ? 'Public' : 'Private'}</Badge>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(bin.createdAt), 'PP')}</span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          <CodeBlock
            code={bin.content}
            language={bin.language || 'text'}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={copyShareLink}
            className={!bin.isPublic ? 'opacity-60' : undefined}
            aria-disabled={!bin.isPublic}
          >
            <Copy className="h-4 w-4 mr-2" />
            {bin.isPublic ? 'Copy share link' : 'Make public to share'}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(`/bin/${bin.id}`, '_blank', 'noopener')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in new tab
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
