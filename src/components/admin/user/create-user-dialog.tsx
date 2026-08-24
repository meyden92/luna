import { Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  type FormConfigWithSchema,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSubscribe,
  FormWithSchema,
} from '@/components/ui/tanstack-form';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { usernameTakenMessage } from '@/libs/auth/username-availability';
import { queryKeys } from '@/libs/query-keys';
import { createUserSchema } from '@/schemas/credentials-schema';
import { createAdminUser } from '@/server/fns/admin/users';

/**
 * The only way a User is created through the app. The initial password is
 * handed over out of band, since LunaShare sends no email.
 */
export function CreateUserDialog() {
  const [open, setOpen] = useState(false);

  const create = useAppMutation(createAdminUser, {
    invalidates: [queryKeys.admin.users],
    successMessage: (user) => `${user.name} can now sign in as "${user.username}"`,
    onSuccess: () => setOpen(false),
  });

  const config: FormConfigWithSchema<typeof createUserSchema> = {
    schema: createUserSchema,
    defaultValues: { username: '', name: '', email: '', password: '' },
    onSubmit: async (values) => {
      await create.mutateAsync(values);
    },
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" />
        Create user
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>They sign in with the username and password you set here.</DialogDescription>
          </DialogHeader>

          <FormWithSchema
            config={config}
            className="space-y-4"
          >
            <FormField
              name="username"
              validators={{
                onChangeAsync: ({ value }) => usernameTakenMessage(value),
                onChangeAsyncDebounceMs: 400,
              }}
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="name"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="email"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    />
                  </FormControl>
                  <FormDescription>Not used to sign in and never written to — LunaShare sends no email.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="password"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem>
                  <FormLabel>Initial password</FormLabel>
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
              // The Username availability check is a field-level async
              // validator, and the form silently drops a submit fired while one
              // is in flight — hence `isFieldsValidating`.
              selectorAction={(state: any) => (state.isSubmitting || state.isValidating || state.isFieldsValidating) as boolean}
              renderAction={(isBusy: boolean) => (
                <Button
                  type="submit"
                  disabled={isBusy || create.isPending}
                  className="w-full"
                >
                  {isBusy || create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Create user
                </Button>
              )}
            />
          </FormWithSchema>
        </DialogContent>
      </Dialog>
    </>
  );
}
