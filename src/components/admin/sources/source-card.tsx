import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormSubmit, FormWithSchema, TextareaField, useFormContext } from '@/components/ui/tanstack-form';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { queryKeys } from '@/libs/query-keys';
import { setSourceSessionSchema } from '@/schemas/admin/source-schema';
import { clearSourceSession, setSourceSession } from '@/server/fns/admin/sources';
import styles from './source-card.module.css';

const cookiesFormSchema = setSourceSessionSchema.pick({ cookies: true });

interface SourceCardProps {
  source: { key: string; label: string; sessionSet: boolean; sessionUpdatedAt: Date | null };
}

/**
 * One Source and the state of its Source session. Replace takes a new
 * cookies.txt; Clear, after confirming, makes its Downloads run logged out. The
 * session itself is never shown.
 */
export function SourceCard({ source }: SourceCardProps) {
  const [replacing, setReplacing] = useState(false);
  const { confirm, ConfirmationDialog } = useConfirmation<string>();

  const { mutate: save, isPending: isSaving } = useAppMutation(setSourceSession, {
    invalidates: [queryKeys.adminSources.status],
    successMessage: `${source.label} Source session saved`,
    onSuccess: () => setReplacing(false),
  });
  const { mutate: clear, isPending: isClearing } = useAppMutation(clearSourceSession, {
    invalidates: [queryKeys.adminSources.status],
    successMessage: `${source.label} Source session cleared`,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{source.label}</CardTitle>
        <CardDescription>
          {source.sessionSet && source.sessionUpdatedAt
            ? `Session set, last updated ${source.sessionUpdatedAt.toLocaleString()}`
            : 'Not set: Downloads run logged out'}
        </CardDescription>
        <CardAction>
          <Badge variant={source.sessionSet ? 'default' : 'outline'}>{source.sessionSet ? 'Session set' : 'No session'}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className={styles.actions}>
        <Button
          size="sm"
          onClick={() => setReplacing(true)}
        >
          {source.sessionSet ? 'Replace' : 'Set session'}
        </Button>
        {source.sessionSet && (
          <Button
            size="sm"
            variant="outline"
            disabled={isClearing}
            onClick={() =>
              confirm({
                title: `Clear the ${source.label} Source session?`,
                description: `Downloads from ${source.label} will run logged out, and posts that need a login will fail.`,
                data: source.key,
                onConfirm: (sourceKey) => clear({ sourceKey }),
              })
            }
          >
            Clear
          </Button>
        )}
      </CardContent>

      <Dialog
        open={replacing}
        onOpenChange={setReplacing}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{source.label} Source session</DialogTitle>
            <DialogDescription>
              Paste or upload a cookies.txt exported while signed in to {source.label}. It is stored encrypted and never shown again.
            </DialogDescription>
          </DialogHeader>
          <FormWithSchema
            config={{
              schema: cookiesFormSchema,
              defaultValues: { cookies: '' },
              onSubmit: ({ cookies }) => save({ sourceKey: source.key, cookies }),
            }}
          >
            <TextareaField
              name="cookies"
              label="cookies.txt"
              placeholder="# Netscape HTTP Cookie File"
              rows={10}
              className={styles.cookies}
              spellCheck={false}
            />
            <CookiesFilePicker />
            <FormSubmit
              disabled={isSaving}
              loadingText="Saving…"
            >
              Save
            </FormSubmit>
          </FormWithSchema>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog />
    </Card>
  );
}

// Reads a chosen .txt file into the form's `cookies` field.
function CookiesFilePicker() {
  const { form } = useFormContext();
  return (
    <label className={styles.picker}>
      Or upload a file
      <input
        type="file"
        accept=".txt,text/plain"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) form.setFieldValue('cookies', await file.text());
        }}
      />
    </label>
  );
}
