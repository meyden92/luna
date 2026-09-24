import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import { authClient } from '@/libs/auth/auth-client';
import { getAvatarUrl } from '@/libs/utils';
import { AVATAR_MAX_UPLOAD_BYTES, avatarTooLargeMessage, changePasswordSchema } from '@/schemas/credentials-schema';
import { removeAvatar, updateAvatar } from '@/server/fns/account';
import { updateUserProfile } from '@/server/fns/user';
import styles from './profile-panel.module.css';
import { SettingsPanel } from './settings-panel';
import { SettingsRow } from './settings-row';

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    // The data URL prefix is the browser's, not part of the image.
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

/** "Change password" opens this instead of an inline form — the same fields Better-Auth's client already validates. */
function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);

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

      toast.success('Password changed — other devices signed out');
      setOpen(false);
    },
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
          />
        }
      >
        Change password
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Changing your password signs out every other device.</DialogDescription>
        </DialogHeader>
        <FormWithSchema
          config={config}
          className={styles.passwordForm}
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
          <DialogFooter>
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
          </DialogFooter>
        </FormWithSchema>
      </DialogContent>
    </Dialog>
  );
}

interface ProfilePanelContentProps {
  name: string;
  username: string;
  image: string | null;
  isProfilePublic: boolean;
  /** Not shown as a control here — only carried along so saving the public-profile
   *  switch can send a complete, valid `updateUserProfile` payload. */
  receiveEmail: boolean;
}

function ProfilePanelContent({
  name: initialName,
  username,
  image: initialImage,
  isProfilePublic: initialIsProfilePublic,
  receiveEmail,
}: ProfilePanelContentProps) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState(initialImage);
  const [isReadingAvatar, setIsReadingAvatar] = useState(false);

  // `committedName`/`committedIsPublic` are what the server has saved; `name`
  // and `isPublic` are the drafts the Input/Switch show. Each starts equal to
  // its committed value, diverges as the owner edits, and the committed value
  // moves the instant a save succeeds — so the save bar cannot flash back on
  // while the session refetch it also kicks off is still in flight.
  const [committedName, setCommittedName] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [committedIsPublic, setCommittedIsPublic] = useState(initialIsProfilePublic);
  const [isPublic, setIsPublic] = useState(initialIsProfilePublic);
  const trimmedName = name.trim();
  const isDirty = trimmedName !== committedName || isPublic !== committedIsPublic;

  const settleAvatar = (next: string | null) => {
    setImage(next);
    // The nav avatar renders from the session, which still needs it.
    void authClient.getSession({ query: { disableCookieCache: true } });
    void queryClient.invalidateQueries();
  };

  const uploadAvatar = useAppMutation(updateAvatar, {
    successMessage: 'Avatar updated',
    onSuccess: (result) => settleAvatar(result.image),
  });
  // useAppMutation always passes a `data` argument; `removeAvatar` takes none.
  const removeAvatarMutation = useMutation({
    mutationFn: () => removeAvatar(),
    onSuccess: () => {
      toast.success('Avatar removed');
      settleAvatar(null);
    },
    onError: (error: Error) => toast.error(error.message || 'Could not remove your avatar'),
  });

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
      toast.error(avatarTooLargeMessage());
      return;
    }

    setIsReadingAvatar(true);
    try {
      uploadAvatar.mutate({ image: await readAsBase64(file) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read that file');
    } finally {
      setIsReadingAvatar(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const saveProfile = useMutation({
    mutationFn: async ({ nextName, nextIsPublic }: { nextName: string; nextIsPublic: boolean }) => {
      const tasks: Promise<unknown>[] = [];
      if (nextName !== committedName) {
        tasks.push(
          authClient.updateUser({ name: nextName }).then((result) => {
            if (result.error) throw new Error(result.error.message ?? 'Could not save your profile');
          }),
        );
      }
      if (nextIsPublic !== committedIsPublic) {
        // `receiveEmails` is required by the schema even though this switch
        // doesn't touch it — sent unchanged so it is left alone.
        tasks.push(updateUserProfile({ data: { isProfilePublic: nextIsPublic, receiveEmails: receiveEmail } }));
      }
      await Promise.all(tasks);
      return { nextName, nextIsPublic };
    },
    onSuccess: ({ nextName, nextIsPublic }) => {
      toast.success('Profile saved');
      setCommittedName(nextName);
      setCommittedIsPublic(nextIsPublic);
      void authClient.getSession({ query: { disableCookieCache: true } });
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message || 'Could not save your profile'),
  });

  const isAvatarBusy = isReadingAvatar || uploadAvatar.isPending || removeAvatarMutation.isPending;
  const previewUrl = getAvatarUrl(image);

  return (
    <>
      <SettingsPanel>
        <SettingsRow
          label="Avatar"
          hint="Doesn’t count against your storage."
        >
          <div className={styles.avatarRow}>
            <Avatar size="lg">
              {previewUrl ? (
                <AvatarImage
                  src={previewUrl}
                  alt=""
                />
              ) : null}
              <AvatarFallback>{committedName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className={styles.fileInput}
              data-testid="avatar-input"
              onChange={(e) => void onPickAvatar(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isAvatarBusy}
              onClick={() => fileInput.current?.click()}
            >
              {isAvatarBusy ? <Loader2 className={styles.spinner} /> : null}
              Change
            </Button>
            {image ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={isAvatarBusy}
                onClick={() => removeAvatarMutation.mutate()}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </SettingsRow>
        <SettingsRow
          label="Display name"
          hint="Doesn’t have to be unique."
        >
          <Input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </SettingsRow>
        <SettingsRow
          label="Username"
          hint="Used to sign in. Can’t be changed here."
        >
          <Input
            className={styles.input}
            value={username}
            readOnly
            style={{ opacity: 0.7 }}
          />
        </SettingsRow>
        <SettingsRow
          label="Public profile"
          hint="Anyone can see your public profile page and the files on it."
        >
          <Switch
            checked={isPublic}
            onCheckedChange={(checked) => setIsPublic(Boolean(checked))}
          />
        </SettingsRow>
        <SettingsRow label="Password">
          <ChangePasswordDialog />
        </SettingsRow>
      </SettingsPanel>
      {isDirty && (
        <div className={styles.saveBar}>
          <span>You have unsaved changes</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setName(committedName);
              setIsPublic(committedIsPublic);
            }}
          >
            Discard
          </Button>
          <Button
            size="sm"
            disabled={trimmedName.length === 0 || saveProfile.isPending}
            onClick={() => saveProfile.mutate({ nextName: trimmedName, nextIsPublic: isPublic })}
          >
            Save changes
          </Button>
        </div>
      )}
    </>
  );
}

interface ProfilePanelProps {
  isProfilePublic: boolean;
  receiveEmail: boolean;
}

/** Profile: avatar, display name, read-only username, public-profile switch and a password change. */
export function ProfilePanel({ isProfilePublic, receiveEmail }: ProfilePanelProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  if (!user) return null;

  return (
    <ProfilePanelContent
      key={user.id}
      name={user.name}
      username={user.displayUsername ?? user.username ?? ''}
      image={user.image ?? null}
      isProfilePublic={isProfilePublic}
      receiveEmail={receiveEmail}
    />
  );
}
