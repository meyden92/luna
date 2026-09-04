import { Code2, FileText, Upload } from 'lucide-react';
import { useRef } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  type FormConfig,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormReset,
  SelectField,
} from '@/components/ui/tanstack-form';
import { Textarea } from '@/components/ui/textarea';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useBinView } from '@/hooks/use-bin-view';
import { SUPPORTED_LANGUAGES } from '@/libs/languages';
import { queryKeys } from '@/libs/query-keys';
import { createBin } from '@/server/fns/bins';
import styles from './BinUploader.module.css';

const BinFormSchema = z.object({
  title: z.string().min(3).max(40),
  language: z.string().optional(),
  snippet: z.string().min(10),
  isPublic: z.boolean().default(false),
});

type BinFormType = z.infer<typeof BinFormSchema>;

const BinUploader = () => {
  const { onOpen } = useBinView();
  const formRef = useRef<any>(null);

  const { mutate: execute, isPending } = useAppMutation(createBin, {
    successMessage: (data) => `Snippet ${data?.title ?? ''} uploaded`,
    invalidates: [queryKeys.bins.mine],
    onSuccess: (data) => {
      formRef.current?.reset();
      onOpen({
        id: data.id,
        title: data.title,
        content: data.content,
        language: data.language,
        isPublic: data.isPublic,
        createdAt: data.createdAt,
      });
    },
  });

  const formConfig: FormConfig<BinFormType> = {
    defaultValues: {
      title: '',
      language: 'auto',
      snippet: '',
      isPublic: false,
    },
    validators: {
      onChange: ({ value }) => {
        const result = BinFormSchema.safeParse(value);
        if (!result.success) {
          const firstError = result.error.issues[0];
          return firstError?.message;
        }
        return undefined;
      },
    },
    onSubmit: (values) => {
      execute({
        title: values.title,
        snippet: values.snippet,
        language: values.language === 'auto' ? undefined : values.language,
        isPublic: values.isPublic,
      });
    },
  };

  return (
    <Form
      config={formConfig}
      className="stack space-6"
      aria-label="Upload code snippet form"
    >
      {(form) => {
        formRef.current = form;

        return (
          <>
            {/* Title Input */}
            <FormField
              name="title"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem className={styles.field}>
                  <FormLabel className={styles.label}>
                    <FileText />
                    Snippet Title
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Authentication Helper, API Client, React Hook..."
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                      className={styles.input}
                      aria-label="Snippet Title"
                    />
                  </FormControl>
                  <FormDescription className={styles.hint}>Give your snippet a descriptive name (3-40 characters)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Language Selector */}
            <SelectField
              name="language"
              label="Language"
              description="Select a language or leave as auto-detect"
              placeholder="Select language..."
              options={SUPPORTED_LANGUAGES.map((lang) => ({ value: lang.value, label: lang.label }))}
              optional
            />

            <FormField
              name="isPublic"
              renderFieldAction={({ value, onChange }) => (
                <FormItem className={styles.switchRow}>
                  <div className={styles.switchText}>
                    <FormLabel>Public share link</FormLabel>
                    <FormDescription className={styles.hint}>Allow anyone with the link to view this snippet.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={Boolean(value)}
                      onCheckedChange={onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Actual Snippet Input */}
            <FormField
              name="snippet"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem className={styles.field}>
                  <FormLabel className={styles.label}>
                    <Code2 />
                    Code Snippet
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Paste your code here..."
                      className={styles.textarea}
                      aria-label="Code Snippet"
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    />
                  </FormControl>
                  <FormDescription className={styles.hint}>Paste your code snippet here (minimum 10 characters)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={styles.actions}>
              <Button
                type="submit"
                className={styles.submit}
                disabled={isPending || form.state.isSubmitting}
                aria-busy={isPending}
              >
                {isPending ? (
                  <>
                    <span className={styles.spinner} />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className={styles.buttonIcon} />
                    Upload Snippet
                  </>
                )}
              </Button>
              <FormReset
                className={styles.reset}
                disabled={isPending}
              >
                Clear
              </FormReset>
            </div>
          </>
        );
      }}
    </Form>
  );
};

export default BinUploader;
