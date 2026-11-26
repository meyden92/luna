import { FileInput, ImagePlus, X } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { SortableList } from '@/components/ui/sortable-list';
import type { FieldConfig, FileRef, VariableConfig } from '@/libs/studio/types';
import { type FileSlot, fileSlots } from '@/libs/studio/variables';
import styles from './ReferenceSlots.module.css';

const slotId = (slot: FileSlot) =>
  slot.kind === 'variable' ? `variable:${slot.variable.name}` : `reference:${slot.ref.source}:${refKey(slot.ref)}`;
const refKey = (ref: FileRef) => ('key' in ref ? ref.key : '');

/**
 * The files a Template sends to one file input, in order: reference images
 * the admin uploads, and file Variables Users fill in. Each slot keeps its
 * number, since a prompt refers to "image 1", "image 2".
 */
export function ReferenceSlots({
  field,
  variables,
  list,
  urlOf,
  onAddImages,
  onAddUpload,
  onRemove,
  onReorder,
}: {
  field: FieldConfig;
  variables: VariableConfig[];
  /** Whether the input takes several files. */
  list: boolean;
  urlOf: (ref: FileRef) => string | undefined;
  onAddImages: (files: File[]) => void;
  onAddUpload: () => void;
  onRemove: (ref: FileRef) => void;
  onReorder: (slots: FileSlot[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const slots = fileSlots(field, variables);
  const full = !list && slots.length > 0;
  return (
    <div className="stack space-3">
      {slots.length > 0 && (
        <SortableList
          items={slots}
          getId={slotId}
          onReorder={onReorder}
          renderItem={(slot, handle) => {
            const number = slots.indexOf(slot) + 1;
            return (
              <div
                className={styles.slot}
                aria-label={`Slot ${number} of ${field.name}`}
              >
                {list && handle}
                {list && <span className={styles.number}>{number}</span>}
                {slot.kind === 'reference' ? (
                  <>
                    <img
                      className={styles.thumb}
                      src={urlOf(slot.ref)}
                      alt={`Reference image ${number}`}
                    />
                    <span className={styles.label}>Reference image</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove reference image ${number}`}
                      onClick={() => onRemove(slot.ref)}
                    >
                      <X />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className={styles.upload}>
                      <FileInput />
                    </span>
                    <span className={styles.label}>
                      User upload <span className="type-mono">{`{${slot.variable.name}}`}</span>
                    </span>
                  </>
                )}
              </div>
            );
          }}
        />
      )}
      <div className="cluster space-2">
        <input
          ref={input}
          type="file"
          aria-label={`Reference image for ${field.name}`}
          accept="image/*"
          multiple={list}
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length > 0) onAddImages(files);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() => input.current?.click()}
        >
          <ImagePlus />
          Add reference image
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={full}
          onClick={onAddUpload}
        >
          <FileInput />
          Add user upload
        </Button>
      </div>
    </div>
  );
}
