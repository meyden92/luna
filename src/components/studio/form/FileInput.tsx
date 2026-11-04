import { FolderOpen, Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { FormItem, StudioFile, StudioFormValue } from '@/libs/studio/form';
import { isFileRef } from '@/libs/studio/request';
import type { MediaKind } from '@/libs/studio/types';
import { FilePickerDialog } from './FilePickerDialog';
import styles from './StudioForm.module.css';

const ACCEPT: Record<MediaKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  model3d: '.glb,.gltf,model/gltf-binary,model/gltf+json',
};

function fileName(file: StudioFile): string {
  if (file instanceof File) return file.name;
  if (file.source === 'file') return 'From your Files';
  if (file.source === 'output') return 'Studio Output';
  return 'Uploaded file';
}

function asFiles(value: StudioFormValue | undefined): StudioFile[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return list.filter((entry): entry is StudioFile => entry instanceof File || isFileRef(entry));
}

/** A file input of the form: files from the device, the User's Files or their Outputs, listed with a remove button each. */
export function FileInput({
  item,
  value,
  onChange,
  id,
  disabled,
}: {
  item: FormItem;
  value: StudioFormValue | undefined;
  onChange: (value: StudioFormValue | undefined) => void;
  id: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const files = asFiles(value);
  const full = item.maxItems !== undefined && files.length >= item.maxItems;
  const room = item.multiple ? (item.maxItems ?? 20) - files.length : 1;

  const set = (next: StudioFile[]) => onChange(item.multiple ? next : next[0]);

  return (
    <div className={styles.files}>
      {files.length > 0 && (
        <ul className={styles.fileList}>
          {files.map((file, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: files have no id and keep their position
              key={index}
              className={styles.file}
            >
              <span className="type-truncate">{fileName(file)}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${fileName(file)}`}
                disabled={disabled}
                onClick={() => set(files.filter((_, position) => position !== index))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(!full || !item.multiple) && (
        <div className={styles.fileButtons}>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip />
            {files.length > 0 && !item.multiple ? 'Replace file' : 'Add file'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setPicking(true)}
          >
            <FolderOpen />
            Choose…
          </Button>
        </div>
      )}
      <FilePickerDialog
        open={picking}
        onOpenChange={setPicking}
        accept={item.accept}
        remaining={room}
        onSelect={(refs) => set(item.multiple ? [...files, ...refs].slice(0, item.maxItems) : refs.slice(0, 1))}
      />
      <input
        ref={inputRef}
        id={id}
        type="file"
        hidden
        multiple={item.multiple}
        accept={item.accept?.map((kind) => ACCEPT[kind]).join(',')}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (picked.length === 0) return;
          set(item.multiple ? [...files, ...picked].slice(0, item.maxItems) : picked.slice(0, 1));
        }}
      />
    </div>
  );
}
