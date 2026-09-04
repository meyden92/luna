import { Maximize2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import styles from './ExpandableTextarea.module.css';
import { PromptExpandDialog } from './PromptExpandDialog';

interface ExpandableTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmitShortcut?: (value: string) => void;
  maxLength?: number;
  showCharCount?: boolean;
  placeholder?: string;
  description?: string;
}

export function ExpandableTextarea({
  label,
  value,
  onChange,
  onSubmitShortcut,
  maxLength,
  showCharCount,
  placeholder,
  description,
}: ExpandableTextareaProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="stack space-2">
      <div className={styles.field}>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              onSubmitShortcut?.(value);
            }
          }}
          maxLength={maxLength}
          placeholder={placeholder}
          className={styles.textarea}
        />

        {/* Expand button */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsDialogOpen(true)}
          className={styles.expandButton}
          title="Expand to fullscreen editor"
        >
          <Maximize2 className={styles.expandIcon} />
        </Button>
      </div>

      {(showCharCount || description) && (
        <div className={styles.meta}>
          <span>{description}</span>
          {showCharCount && (
            <span>
              {value.length}
              {maxLength ? ` / ${maxLength}` : ''}
            </span>
          )}
        </div>
      )}

      <PromptExpandDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={label}
        value={value}
        onSave={onChange}
        onSubmitShortcut={onSubmitShortcut}
        maxLength={maxLength}
        showCharCount={showCharCount}
      />
    </div>
  );
}
