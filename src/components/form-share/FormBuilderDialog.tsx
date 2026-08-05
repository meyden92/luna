import { useForm } from '@tanstack/react-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { createFormShare } from '@/server/fns/form-shares';

type FieldType = 'text' | 'password' | 'email' | 'url' | 'number' | 'textarea' | 'hidden';

type FieldEntry = {
  id: string;
  label: string;
  value: string;
  type: FieldType;
  isSensitive: boolean;
};

let fieldIdCounter = 0;
function nextFieldId() {
  return `f-${++fieldIdCounter}-${Date.now()}`;
}

function createDefaultField(): FieldEntry {
  return { id: nextFieldId(), label: '', value: '', type: 'text', isSensitive: false };
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'password', label: 'Password' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'hidden', label: 'Hidden' },
] as const;

const EXPIRY_OPTIONS = [
  { value: 'none', ms: 0, label: 'Never' },
  { value: '10min', ms: 600_000, label: '10 minutes' },
  { value: '1hour', ms: 3_600_000, label: '1 hour' },
  { value: '24hours', ms: 86_400_000, label: '24 hours' },
  { value: '7days', ms: 604_800_000, label: '7 days' },
  { value: '30days', ms: 2_592_000_000, label: '30 days' },
] as const;

export function FormBuilderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mutate: execute, isPending } = useAppMutation(createFormShare, {
    invalidates: [queryKeys.formShares.all],
    successMessage: 'Form share created! Link copied to clipboard.',
    errorMessage: 'Failed to create form share',
    onSuccess: (data) => {
      const shareUrl = `${window.location.origin}/form/${data.id}`;
      navigator.clipboard.writeText(shareUrl);
      onOpenChange(false);
      form.reset();
    },
  });

  const form = useForm({
    defaultValues: {
      title: '',
      fields: [createDefaultField()] as FieldEntry[],
      expiryDuration: 'none',
      maxViews: '',
    },
    onSubmit: ({ value }: any) => {
      const validFields = (value.fields as FieldEntry[]).filter((f) => f.label.trim() || f.type === 'hidden');
      if (validFields.length === 0) return;

      const expiryOption = EXPIRY_OPTIONS.find((o) => o.value === value.expiryDuration);
      const expiresInMs = expiryOption && expiryOption.ms > 0 ? expiryOption.ms : undefined;

      execute({
        title: value.title || undefined,
        fields: validFields.map((f) => ({
          label: f.label,
          value: f.value,
          type: f.type,
          isSensitive: f.isSensitive,
        })),
        expiresInMs,
        maxViews: value.maxViews ? Number.parseInt(value.maxViews, 10) : undefined,
      });
    },
  });

  const getFields = (): FieldEntry[] => form.getFieldValue('fields') as any;

  const handleTypeChange = (index: number, newType: FieldType) => {
    const fields = getFields();
    const current = fields[index];
    if (!current) return;
    const updated = [...fields];
    updated[index] = {
      ...current,
      type: newType,
      isSensitive: newType === 'password' || newType === 'hidden' ? true : current.isSensitive,
    };
    form.setFieldValue('fields', updated as any);
  };

  const addField = () => {
    const fields = getFields();
    form.setFieldValue('fields', [...fields, createDefaultField()] as any);
  };

  const removeField = (index: number) => {
    const fields = getFields();
    if (fields.length <= 1) return;
    form.setFieldValue('fields', fields.filter((_, i) => i !== index) as any);
  };

  const updateField = (index: number, key: keyof FieldEntry, val: string | boolean) => {
    const fields = getFields();
    const current = fields[index];
    if (!current) return;
    const updated = [...fields];
    updated[index] = { ...current, [key]: val };
    form.setFieldValue('fields', updated as any);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Share Form Data</DialogTitle>
          <DialogDescription>Create a secure form to share structured data like credentials or configuration values.</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4 overflow-y-auto max-h-[60vh] pr-1"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          {/* Title */}
          <form.Field name="title">
            {(field: any) => (
              <div className="space-y-1.5">
                <Label>
                  Title <span className="text-muted-foreground text-xs">(Optional)</span>
                </Label>
                <Input
                  placeholder="e.g., Server Credentials, API Keys..."
                  value={field.state.value}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          {/* Fields */}
          <form.Field name="fields">
            {(fieldArray: any) => {
              const entries = fieldArray.state.value as FieldEntry[];
              return (
                <div className="space-y-3">
                  <Label>Fields</Label>
                  {entries.map((entry, index) => (
                    <div
                      key={entry.id}
                      className="grid gap-2 rounded-lg border p-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Label"
                          value={entry.label}
                          onChange={(e) => updateField(index, 'label', e.target.value)}
                        />
                        <Select
                          value={entry.type}
                          onValueChange={(val) => val && handleTypeChange(index, val as FieldType)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Text" />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((ft) => (
                              <SelectItem
                                key={ft.value}
                                value={ft.value}
                              >
                                {ft.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {entry.type === 'textarea' ? (
                        <Textarea
                          placeholder="Value"
                          value={entry.value}
                          onChange={(e) => updateField(index, 'value', e.target.value)}
                          rows={3}
                        />
                      ) : (
                        <Input
                          type={entry.type === 'password' ? 'password' : 'text'}
                          placeholder="Value"
                          value={entry.value}
                          onChange={(e) => updateField(index, 'value', e.target.value)}
                        />
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={entry.isSensitive}
                            onCheckedChange={(checked) => updateField(index, 'isSensitive', checked)}
                            disabled={entry.type === 'password' || entry.type === 'hidden'}
                          />
                          <span className="text-sm text-muted-foreground">Sensitive</span>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeField(index)}
                          disabled={entries.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addField}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Field
                  </Button>
                </div>
              );
            }}
          </form.Field>

          {/* Expiry settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <form.Field name="expiryDuration">
              {(field: any) => (
                <div className="space-y-1.5">
                  <Label>Expires after</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(val) => val && field.handleChange(val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Never" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.value}
                          value={opt.value}
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>

            <form.Field name="maxViews">
              {(field: any) => (
                <div className="space-y-1.5">
                  <Label>
                    Max views <span className="text-muted-foreground text-xs">(Optional)</span>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="e.g., 3"
                    value={field.state.value}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={() => form.handleSubmit()}
            disabled={isPending}
          >
            {isPending ? 'Creating...' : 'Create & Copy Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
