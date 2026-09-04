import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  type FormConfig,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  SelectField,
} from '@/components/ui/tanstack-form';
import { Textarea } from '@/components/ui/textarea';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useBinEdit } from '@/hooks/use-bin-edit';
import { SUPPORTED_LANGUAGES } from '@/libs/languages';
import { queryKeys } from '@/libs/query-keys';
import { updateBin } from '@/server/fns/bins';
import styles from './EditBinModal.module.css';

const BinEditSchema = z.object({
  title: z.string().min(3).max(40),
  content: z.string().min(10),
  language: z.string().optional(),
  isPublic: z.boolean().default(false),
});

type BinEditType = z.infer<typeof BinEditSchema>;

export function EditBinModal() {
  const { isOpen, bin, onClose } = useBinEdit();
  const formRef = useRef<any>(null);

  const { mutate: execute, isPending } = useAppMutation(updateBin, {
    errorMessage: false,
    invalidates: bin ? [queryKeys.bins.mine, queryKeys.bins.detail(bin.id)] : [queryKeys.bins.mine],
    onSuccess: () => {
      toast.success('Snippet updated', { richColors: true });
      onClose();
    },
    onError: (error) => {
      toast.error(error.message, { richColors: true });
    },
  });

  // Update form values when bin changes
  useEffect(() => {
    if (bin && formRef.current) {
      formRef.current.setFieldValue('title', bin.title || '');
      formRef.current.setFieldValue('content', bin.content);
      formRef.current.setFieldValue('language', bin.language || 'auto');
      formRef.current.setFieldValue('isPublic', bin.isPublic);
    }
  }, [bin]);

  const handleClose = () => {
    onClose();
    if (formRef.current) {
      formRef.current.reset();
    }
  };

  const formConfig: FormConfig<BinEditType> = {
    defaultValues: {
      title: bin?.title || '',
      content: bin?.content || '',
      language: bin?.language || 'auto',
      isPublic: bin?.isPublic ?? false,
    },
    validators: {
      onChange: ({ value }) => {
        const result = BinEditSchema.safeParse(value);
        if (!result.success) {
          const firstError = result.error.issues[0];
          return firstError?.message;
        }
        return undefined;
      },
    },
    onSubmit: (values) => {
      if (!bin) return;
      execute({
        id: bin.id,
        title: values.title,
        content: values.content,
        language: values.language === 'auto' ? undefined : values.language,
        isPublic: values.isPublic,
      });
    },
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={handleClose}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Edit snippet</DialogTitle>
          <DialogDescription>Make changes to your code snippet. Click save when you're done.</DialogDescription>
        </DialogHeader>

        <Form
          config={formConfig}
          className={styles.form}
        >
          {(form) => {
            // Store form ref for external access
            formRef.current = form;

            return (
              <>
                <FormField
                  name="title"
                  renderFieldAction={({ value, onChange, onBlur }) => (
                    <FormItem className={styles.field}>
                      <FormLabel>Snippet Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Authentication Helper, API Client, React Hook..."
                          value={value ?? ''}
                          onChange={(e) => onChange(e.target.value)}
                          onBlur={onBlur}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <SelectField
                  name="language"
                  label="Language"
                  placeholder="Select language..."
                  options={SUPPORTED_LANGUAGES.map((lang) => ({ value: lang.value, label: lang.label }))}
                  optional
                  disabled={isPending}
                  className={styles.field}
                />

                <FormField
                  name="isPublic"
                  renderFieldAction={({ value, onChange }) => (
                    <FormItem className={styles.switchRow}>
                      <div className={styles.switchText}>
                        <FormLabel>Public share link</FormLabel>
                        <p className={styles.switchHint}>Allow anyone with the link to view this snippet.</p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={Boolean(value)}
                          onCheckedChange={onChange}
                          disabled={isPending}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  name="content"
                  renderFieldAction={({ value, onChange, onBlur }) => (
                    <FormItem className={styles.contentField}>
                      <FormLabel>Content</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Paste your code here..."
                          className={styles.codeArea}
                          value={value ?? ''}
                          onChange={(e) => onChange(e.target.value)}
                          onBlur={onBlur}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending}
                  >
                    {isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </DialogFooter>
              </>
            );
          }}
        </Form>
      </DialogContent>
    </Dialog>
  );
}
