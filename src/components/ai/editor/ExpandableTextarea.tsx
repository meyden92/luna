import { Maximize2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
    <div className="space-y-1.5">
      <div className="relative">
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
          className="min-h-[80px] pr-10"
        />

        {/* Expand button */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsDialogOpen(true)}
          className="absolute top-2 right-2 opacity-60 hover:opacity-100"
          title="Expand to fullscreen editor"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {(showCharCount || description) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
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
