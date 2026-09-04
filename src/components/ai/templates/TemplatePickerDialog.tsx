import { useQuery } from '@tanstack/react-query';
import { ImageIcon, LayoutTemplate, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { queryKeys } from '@/libs/query-keys';
import { getTemplateImageUrl } from '@/libs/utils';
import { listAiTemplates } from '@/server/fns/ai';
import styles from './TemplatePickerDialog.module.css';

interface Template {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  inputImageCount: number;
  minImageCount: number;
  maxImageCount: number;
  variables: unknown;
  previewImages: string | null;
  editingModelId: string | null;
  editingModelFieldValues: unknown;
  isActive: boolean;
  globalVariables?: Array<{
    id: string;
    globalVariable: {
      id: string;
      name: string;
      label: string;
      type: string;
      description: string | null;
      defaultValue: string | null;
      options: unknown;
      required: boolean;
    };
    addedOptions: unknown;
    required: boolean | null;
    sortOrder: number;
  }>;
}

interface TemplatesResponse {
  templates: Template[];
}

interface TemplatePickerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTemplateSelect: (template: Template) => void;
  selectedTemplateId?: string;
}

export function TemplatePickerDialog({ isOpen, onOpenChange, onTemplateSelect, selectedTemplateId }: TemplatePickerDialogProps) {
  const { data, isLoading, error, refetch, isFetching } = useQuery<TemplatesResponse>({
    queryKey: queryKeys.ai.templates,
    queryFn: async () => {
      return listAiTemplates() as Promise<TemplatesResponse>;
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const handleTemplateClick = (template: Template) => {
    onTemplateSelect(template);
    onOpenChange(false);
  };

  const getPreviewImages = (template: Template): string[] => {
    if (!template.previewImages) return [];
    try {
      const rawImages = JSON.parse(template.previewImages);
      return rawImages.map((img: string) => getTemplateImageUrl(img));
    } catch {
      return [];
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
    >
      <DialogContent size="xl">
        <DialogHeader className={styles.header}>
          <DialogTitle className={styles.title}>
            <div className={styles.titleMain}>
              <LayoutTemplate className={styles.titleIcon} />
              <span>Select Template</span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={isFetching ? styles.spinning : undefined} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className={styles.scroll}>
          {isLoading && (
            <div className={styles.state}>
              <Loader2 className={styles.stateSpinner} />
            </div>
          )}

          {error && (
            <div className={styles.state}>
              <LayoutTemplate className={styles.stateIcon} />
              <p className={styles.stateText}>Failed to load templates</p>
              <Button
                variant="outline"
                size="sm"
                className="margin-top-4"
                onClick={() => refetch()}
              >
                Try Again
              </Button>
            </div>
          )}

          {data && data.templates.length === 0 && (
            <div className={styles.state}>
              <LayoutTemplate className={styles.stateIcon} />
              <p className={styles.stateText}>No templates available</p>
              <p className={styles.stateHint}>Templates will appear here when created</p>
            </div>
          )}

          {data && data.templates.length > 0 && (
            <div className={styles.grid}>
              {data.templates.map((template) => {
                const previewImages = getPreviewImages(template);
                const isSelected = selectedTemplateId === template.id;

                return (
                  <div
                    key={template.id}
                    className={styles.card}
                    data-selected={isSelected ? '' : undefined}
                    onClick={() => handleTemplateClick(template)}
                  >
                    <div className={styles.preview}>
                      {previewImages.length > 0 ? (
                        <img
                          src={previewImages[0]!}
                          alt={template.name}
                          loading="lazy"
                          className={styles.previewImage}
                        />
                      ) : (
                        <div className={styles.previewFallback}>
                          <ImageIcon className={styles.previewFallbackIcon} />
                        </div>
                      )}
                    </div>

                    <div className={styles.info}>
                      <h3 className={styles.name}>{template.name}</h3>
                      {template.description && <p className={styles.description}>{template.description}</p>}
                      <div className={styles.meta}>
                        {template.inputImageCount > 0 && (
                          <span className={styles.metaItem}>
                            <ImageIcon className={styles.metaIcon} />
                            {template.inputImageCount} image{template.inputImageCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { Template };
