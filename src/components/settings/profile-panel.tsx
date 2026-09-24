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
import { Textarea } from '@/components/ui/textarea';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { authClient } from '@/libs/auth/auth-client';
import { getAvatarUrl } from '@/libs/utils';
import { AVATAR_MAX_UPLOAD_BYTES, avatarTooLargeMessage, changePasswordSchema } from '@/schemas/credentials-schema';
import { removeAvatar, updateAvatar } from '@/server/fns/account';
import { updateUserProfile } from '@/server/fns/user';
import styles from './profile-panel.module.css';
import { SettingsPanel } from './settings-panel';
import { SettingsRow } from './settings-row';

// Mirrors the limits in `updateProfileSchema`.
const BIO_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 1000;

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
  receiveEmail: boolean;
  bio: string;
  description: string;
}

function ProfilePanelContent({
  name: initialName,
  username,
  image: initialImage,
  isProfilePublic: initialIsProfilePublic,
  receiveEmail: initialReceiveEmail,
  bio: initialBio,
  description: initialDescription,
}: ProfilePanelContentProps) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState(initialImage);
  const [isReadingAvatar, setIsReadingAvatar] = useState(false);

  // `committedX`/`x` pairs: `committedX` is what the server has saved, `x` is
  // the draft the control shows. Each starts equal to its committed value,
  // diverges as the owner edits, and the committed value moves the instant a
  // save succeeds — so the save bar cannot flash back on while the session
  // refetch it also kicks off is still in flight.
  const [committedName, setCommittedName] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [committedIsPublic, setCommittedIsPublic] = useState(initialIsProfilePublic);
  const [isPublic, setIsPublic] = useState(initialIsProfilePublic);
  const [committedReceiveEmail, setCommittedReceiveEmail] = useState(initialReceiveEmail);
  const [receiveEmail, setReceiveEmail] = useState(initialReceiveEmail);
  const [committedBio, setCommittedBio] = useState(initialBio);
  const [bio, setBio] = useState(initialBio);
  const [committedDescription, setCommittedDescription] = useState(initialDescription);
  const [description, setDescription] = useState(initialDescription);
  const trimmedName = name.trim();
  const isDirty =
    trimmedName !== committedName ||
    isPublic !== committedIsPublic ||
    receiveEmail !== committedReceiveEmail ||
    bio !== committedBio ||
    description !== committedDescription;

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
    mutationFn: async ({
      nextName,
      nextIsPublic,
      nextReceiveEmail,
      nextBio,
      nextDescription,
    }: {
      nextName: string;
      nextIsPublic: boolean;
      nextReceiveEmail: boolean;
      nextBio: string;
      nextDescription: string;
    }) => {
      const tasks: Promise<unknown>[] = [];
      if (nextName !== committedName) {
        tasks.push(
          authClient.updateUser({ name: nextName }).then((result) => {
            if (result.error) throw new Error(result.error.message ?? 'Could not save your profile');
          }),
        );
      }
      if (
        nextIsPublic !== committedIsPublic ||
        nextReceiveEmail !== committedReceiveEmail ||
        nextBio !== committedBio ||
        nextDescription !== committedDescription
      ) {
        tasks.push(
          updateUserProfile({
            data: { isProfilePublic: nextIsPublic, receiveEmails: nextReceiveEmail, bio: nextBio, description: nextDescription },
          }),
        );
      }
      await Promise.all(tasks);
      return { nextName, nextIsPublic, nextReceiveEmail, nextBio, nextDescription };
    },
    onSuccess: ({ nextName, nextIsPublic, nextReceiveEmail, nextBio, nextDescription }) => {
      toast.success('Profile saved');
      setCommittedName(nextName);
      setCommittedIsPublic(nextIsPublic);
      setCommittedReceiveEmail(nextReceiveEmail);
      setCommittedBio(nextBio);
      setCommittedDescription(nextDescription);
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
          label="Bio"
          hint="Shown next to your name on your public profile."
        >
          <Textarea
            aria-label="Bio"
            className={styles.textarea}
            value={bio}
            maxLength={BIO_MAX_LENGTH}
            onChange={(e) => setBio(e.target.value)}
          />
        </SettingsRow>
        <SettingsRow
          label="Description"
          hint="Shown further down your public profile page."
        >
          <Textarea
            aria-label="Description"
            className={styles.textarea}
            value={description}
            maxLength={DESCRIPTION_MAX_LENGTH}
            onChange={(e) => setDescription(e.target.value)}
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
        <SettingsRow
          label="Marketing emails"
          hint="Receive occasional emails about LunaShare."
        >
          <Switch
            aria-label="Marketing emails"
            checked={receiveEmail}
            onCheckedChange={(checked) => setReceiveEmail(Boolean(checked))}
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
              setReceiveEmail(committedReceiveEmail);
              setBio(committedBio);
              setDescription(committedDescription);
            }}
          >
            Discard
          </Button>
          <Button
            size="sm"
            disabled={trimmedName.length === 0 || saveProfile.isPending}
            onClick={() =>
              saveProfile.mutate({
                nextName: trimmedName,
                nextIsPublic: isPublic,
                nextReceiveEmail: receiveEmail,
                nextBio: bio,
                nextDescription: description,
              })
            }
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
  bio: string | null;
  description: string | null;
}

/** Profile: avatar, display name, bio/description, read-only username, public-profile and marketing-email switches, and a password change. */
export function ProfilePanel({ isProfilePublic, receiveEmail, bio, description }: ProfilePanelProps) {
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
      bio={bio ?? ''}
      description={description ?? ''}
    />
  );
}
