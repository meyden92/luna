import { useQuery } from '@tanstack/react-query';
import { ImageIcon, LayoutTemplate, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { queryKeys } from '@/libs/query-keys';
import { getTemplateImageUrl } from '@/libs/utils';
import { listAiTemplates } from '@/server/fns/ai';

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
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5" />
              <span>Select Template</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <LayoutTemplate className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="text-base text-muted-foreground">Failed to load templates</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetch()}
              >
                Try Again
              </Button>
            </div>
          )}

          {data && data.templates.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <LayoutTemplate className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="text-base text-muted-foreground">No templates available</p>
              <p className="text-sm text-muted-foreground mt-2">Templates will appear here when created</p>
            </div>
          )}

          {data && data.templates.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
              {data.templates.map((template) => {
                const previewImages = getPreviewImages(template);
                const isSelected = selectedTemplateId === template.id;

                return (
                  <div
                    key={template.id}
                    className={`
                      relative group cursor-pointer rounded-xl border-2 transition-all overflow-hidden bg-card
                      ${isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'}
                    `}
                    onClick={() => handleTemplateClick(template)}
                  >
                    {/* Preview Image */}
                    <div className="aspect-video bg-muted relative">
                      {previewImages.length > 0 ? (
                        <img
                          src={previewImages[0]!}
                          alt={template.name}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ImageIcon className="w-12 h-12 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Template Info */}
                    <div className="p-3 space-y-1">
                      <h3 className="font-semibold text-sm truncate">{template.name}</h3>
                      {template.description && <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                        {template.inputImageCount > 0 && (
                          <span className="flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" />
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
