import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Trash2, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { authClient } from '@/libs/auth/auth-client';
import { usernameTakenMessage } from '@/libs/auth/username-availability';
import { getAvatarUrl } from '@/libs/utils';
import {
  AVATAR_MAX_UPLOAD_BYTES,
  avatarTooLargeMessage,
  changePasswordSchema,
  changeUsernameSchema,
  displayNameSchema,
} from '@/schemas/credentials-schema';
import { removeAvatar, updateAvatar } from '@/server/fns/account';
import styles from './account-credentials.module.css';

/**
 * A User's own Avatar, display name, Username and password. All but the Avatar
 * go straight through Better-Auth's client, which owns those rules.
 */

const identitySchema = z.object({
  name: displayNameSchema,
  username: changeUsernameSchema.shape.username,
});

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    // The data URL prefix is the browser's, not part of the image.
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

function AvatarCard({ image: initialImage, name }: { image: string | null; name: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [isReading, setIsReading] = useState(false);
  const queryClient = useQueryClient();

  // The server function returns the new key, so the preview need not wait for
  // the session store to catch up.
  const [image, setImage] = useState(initialImage);

  const settled = (next: string | null) => {
    setImage(next);
    // The header renders the avatar from the session, which still needs it.
    void authClient.getSession({ query: { disableCookieCache: true } });
    void queryClient.invalidateQueries();
  };

  const upload = useAppMutation(updateAvatar, {
    successMessage: 'Avatar updated',
    onSuccess: (result) => settled(result.image),
  });
  // useAppMutation always passes a `data` argument; `removeAvatar` takes none.
  const remove = useMutation({
    mutationFn: () => removeAvatar(),
    onSuccess: () => {
      toast.success('Avatar removed');
      settled(null);
    },
    onError: (error: Error) => toast.error(error.message || 'Could not remove your avatar'),
  });

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
      toast.error(avatarTooLargeMessage());
      return;
    }

    setIsReading(true);
    try {
      upload.mutate({ image: await readAsBase64(file) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read that file');
    } finally {
      setIsReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const isBusy = isReading || upload.isPending || remove.isPending;
  const previewUrl = getAvatarUrl(image);

  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.cardTitle}>
          <UserRound className={styles.titleIcon} />
          Avatar
        </CardTitle>
        <CardDescription>Shown next to your name. Images are resized to a square and stripped of camera metadata.</CardDescription>
      </CardHeader>
      <CardContent className={styles.avatarRow}>
        <Avatar size="lg">
          {previewUrl ? (
            <AvatarImage
              src={previewUrl}
              alt=""
            />
          ) : null}
          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className={styles.fileInput}
          data-testid="avatar-input"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />

        <Button
          variant="outline"
          disabled={isBusy}
          onClick={() => fileInput.current?.click()}
        >
          {isBusy ? <Loader2 className={styles.spinner} /> : null}
          Upload image
        </Button>

        {image ? (
          <Button
            variant="ghost"
            disabled={isBusy}
            onClick={() => remove.mutate()}
          >
            <Trash2 className={styles.buttonIcon} />
            Remove
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function IdentityCard({ name, username }: { name: string; username: string }) {
  const config: FormConfigWithSchema<typeof identitySchema> = {
    schema: identitySchema,
    defaultValues: { name, username },
    onSubmit: async (values) => {
      const result = await authClient.updateUser({
        name: values.name,
        // Better-Auth normalises the Username and keeps the typed casing.
        username: values.username,
        displayUsername: values.username,
      });

      if (result.error) {
        toast.error(result.error.message ?? 'Could not save your profile');
        return;
      }

      toast.success('Profile updated');
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your username is what you sign in with. Your display name is what other people see.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormWithSchema
          config={config}
          className={styles.form}
        >
          <FormField
            name="username"
            validators={{
              onChangeAsync: ({ value }) => usernameTakenMessage(value, username),
              onChangeAsyncDebounceMs: 400,
            }}
            renderFieldAction={({ value, onChange, onBlur }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="username"
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={onBlur}
                  />
                </FormControl>
                <FormDescription>
                  Letters, numbers, underscores and hyphens. Capitalisation does not matter when signing in.
                </FormDescription>
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

          <FormSubscribe
            // The Username availability check is a field-level async
            // validator, and the form silently drops a submit fired while one
            // is in flight — hence `isFieldsValidating`.
            selectorAction={(state: any) => (state.isSubmitting || state.isValidating || state.isFieldsValidating) as boolean}
            renderAction={(isBusy: boolean) => (
              <Button
                type="submit"
                disabled={isBusy}
              >
                {isBusy ? <Loader2 className={styles.spinner} /> : null}
                Save profile
              </Button>
            )}
          />
        </FormWithSchema>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const config: FormConfigWithSchema<typeof changePasswordSchema> = {
    schema: changePasswordSchema,
    defaultValues: { currentPassword: '', newPassword: '' },
    onSubmit: async (values) => {
      const result = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        // Other devices were signed in on the old password.
        revokeOtherSessions: true,
      });

      if (result.error) {
        toast.error(result.error.message ?? 'Could not change your password');
        return;
      }

      toast.success('Password changed. Other devices have been signed out.');
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.cardTitle}>
          <KeyRound className={styles.titleIcon} />
          Password
        </CardTitle>
        <CardDescription>Changing your password signs out every other device.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormWithSchema
          config={config}
          className={styles.form}
        >
          <FormField
            name="currentPassword"
            renderFieldAction={({ value, onChange, onBlur }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
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
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className={styles.spinner} /> : null}
                Change password
              </Button>
            )}
          />
        </FormWithSchema>
      </CardContent>
    </Card>
  );
}

export function AccountCredentials() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  if (!user) return null;

  return (
    <>
      <AvatarCard
        image={user.image ?? null}
        name={user.name}
      />
      <IdentityCard
        name={user.name}
        username={user.displayUsername ?? user.username ?? ''}
      />
      <PasswordCard />
    </>
  );
}
