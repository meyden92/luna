import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import ImageInputs from '@/components/ui/ImageInputs';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import useEdit from '@/hooks/use-edit';
import { patchGalleryFiles } from '@/libs/gallery-cache';
import { getCDNImage } from '@/libs/utils';
import { updateFile } from '@/server/fns/files';
import type { GalleryFile } from '@/types/project';
import { Button } from '../button';
import { Input } from '../input';
import { Label } from '../label';
import { Separator } from '../separator';
import { Switch } from '../switch';
import { Textarea } from '../textarea';
import styles from './EditModal.module.css';

function EditModal() {
  const isOpen = useEdit((state) => state.isOpen);
  const onClose = useEdit((state) => state.onClose);
  const currentFile = useEdit((state) => state.file);

  if (!isOpen || currentFile == null) {
    return null;
  }

  // Keyed by file id: switching files remounts the form with fresh state,
  // instead of syncing it via an effect (which lost in-progress edits).
  return (
    <EditFileSheet
      key={currentFile.id}
      file={currentFile}
      onClose={onClose}
    />
  );
}

function EditFileSheet({ file, onClose }: { file: GalleryFile; onClose: () => void }) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(file.title ?? '');
  const [tags, setTags] = useState<string[]>(file.tags ? file.tags.split(',') : []);
  const [privateImage, setPrivateImage] = useState(file.private);
  const [lyrics, setLyrics] = useState(file.metadata?.lyrics || '');
  const [artist, setArtist] = useState(file.metadata?.artist || '');

  const { mutate, isPending } = useMutation({
    mutationFn: async (input: { title: string; tags: string[]; visible: boolean; lyrics?: string; artist?: string }) => {
      return updateFile({ data: { id: file.id, ...input } });
    },
    onError: () => {
      toast('Something went wrong');
    },
    onSuccess: (data) => {
      patchGalleryFiles(queryClient, (f) => (f.id === data.id ? data : f));
      toast('The file has been updated');
    },
    onSettled: () => {
      onClose();
    },
  });

  const handleSave = useCallback(() => {
    if (title.length > 0 && !isPending) {
      mutate({
        title,
        tags,
        visible: privateImage,
        lyrics,
        artist,
      });
    }
  }, [title, tags, privateImage, lyrics, artist, mutate, isPending]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <Sheet
      open
      onOpenChange={() => {
        onClose();
      }}
    >
      <SheetContent style={{ maxWidth: '30vw' }}>
        <SheetHeader>
          <SheetTitle>Edit Image</SheetTitle>
          <SheetDescription>Change Image Details</SheetDescription>
        </SheetHeader>
        <div className={styles.mediaSection}>
          {file.contentType.startsWith('audio') ? (
            <div>Audio File</div>
          ) : (
            <img
              src={getCDNImage(`/${file.ownerId}/${file.url}`)}
              alt="Edit"
              className={styles.image}
            />
          )}
          <div>{file.url}</div>
          <ImageInputs
            baseTitle={file.title || 'Untitled'}
            changeTitle={(title) => {
              setTitle(title);
            }}
            changeTags={(tags) => {
              setTags(tags);
            }}
            baseTags={file.tags?.split(',')}
          />
          <div className={styles.privateRow}>
            <Label>Private</Label>
            <Switch
              checked={privateImage}
              onCheckedChange={() => setPrivateImage(!privateImage)}
            />
          </div>
        </div>
        {file.contentType.startsWith('audio') ? (
          <div>
            <Label>Lyrics</Label>
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.currentTarget.value)}
            />
            <Label>Artist</Label>
            <Input
              value={artist}
              onChange={(e) => setArtist(e.currentTarget.value)}
            />
          </div>
        ) : null}
        <Separator className={styles.separator} />
        <SheetFooter className={styles.footer}>
          <Button
            onClick={handleSave}
            disabled={title.length === 0 || isPending}
          >
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default EditModal;
