import { KeyRound, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  type FormConfigWithSchema,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSubscribe,
  FormWithSchema,
} from '@/components/ui/tanstack-form';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { resetUserPasswordSchema } from '@/schemas/credentials-schema';
import { resetAdminUserPassword } from '@/server/fns/admin/users';

/**
 * The administrator half of account recovery (issue #54). There is no reset
 * link to send, so a forgotten password ends here or at
 * `scripts/auth/set-credentials.ts`. Setting a password signs the User out
 * everywhere.
 */
export function ResetPasswordDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);

  const reset = useAppMutation(resetAdminUserPassword, {
    successMessage: `Password reset. ${userName} has been signed out everywhere.`,
    onSuccess: () => setOpen(false),
  });

  const config: FormConfigWithSchema<typeof resetUserPasswordSchema> = {
    schema: resetUserPasswordSchema,
    defaultValues: { userId, newPassword: '' },
    onSubmit: async (values) => {
      await reset.mutateAsync(values);
    },
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <KeyRound className="mr-2 h-4 w-4" />
        Reset password
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>Set a new password for {userName} and hand it over yourself.</DialogDescription>
          </DialogHeader>

          <FormWithSchema
            config={config}
            className="space-y-4"
          >
            <FormField
              name="newPassword"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormSubscribe
              selectorAction={(state: any) => state.isSubmitting as boolean}
              renderAction={(isSubmitting: boolean) => (
                <Button
                  type="submit"
                  disabled={isSubmitting || reset.isPending}
                  className="w-full"
                >
                  {isSubmitting || reset.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Reset password
                </Button>
              )}
            />
          </FormWithSchema>
        </DialogContent>
      </Dialog>
    </>
  );
}
