import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Form, type FormConfig, FormSubscribe } from '@/components/ui/tanstack-form';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import type { ProfileSettingsPayload } from '@/libs/validation/profile_settings';
import { updateUserProfile } from '@/server/fns/user';
import { EmailPreferenceSwitch } from './form-components/EmailPreferenceSwitch';
import { GalleryAllFilesSwitch } from './form-components/GalleryAllFilesSwitch';
import { ProfileBioInput } from './form-components/ProfileBioInput';
import { ProfileDescriptionInput } from './form-components/ProfileDescriptionInput';
import { ProfileVisibilitySwitch } from './form-components/ProfileVisibilitySwitch';

interface UserSettingsProps extends React.ComponentProps<'div'> {
  receiveEmails: boolean;
  isProfilePublic: boolean;
  bio: string;
  description: string;
  showAllFilesIncludesFoldered: boolean;
}

export default function UserSettings({
  receiveEmails,
  isProfilePublic,
  bio,
  description,
  showAllFilesIncludesFoldered,
  ...props
}: UserSettingsProps) {
  const { mutate: updateProfile } = useAppMutation(updateUserProfile, {
    invalidates: [queryKeys.userSettings.all, queryKeys.gallery.all, queryKeys.dashboard.settingsOverview],
    successMessage: 'Profile updated successfully!',
  });

  const formConfig: FormConfig<ProfileSettingsPayload> = {
    defaultValues: {
      receiveEmails,
      isProfilePublic,
      bio,
      description,
      showAllFilesIncludesFoldered,
    },
    onSubmit: (values) => {
      updateProfile(values);
    },
  };

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>Manage your profile information and privacy settings</CardDescription>
      </CardHeader>
      <CardContent>
        <Form config={formConfig}>
          {() => (
            <>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">Profile Information</h3>
                  <div className="space-y-4">
                    <ProfileBioInput />
                    <ProfileDescriptionInput />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-medium mb-2">Privacy & Notifications</h3>
                  <div className="space-y-4">
                    <EmailPreferenceSwitch />
                    <ProfileVisibilitySwitch />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-medium mb-2">Gallery Settings</h3>
                  <div className="space-y-4">
                    <GalleryAllFilesSwitch />
                  </div>
                </div>
              </div>
              <FormSubscribe
                selectorAction={(state) => ({
                  canSubmit: state.canSubmit,
                  isDirty: state.isDirty,
                  isSubmitting: state.isSubmitting,
                  isValid: state.isValid,
                })}
                renderAction={({ canSubmit, isDirty, isSubmitting, isValid }) => (
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button
                      type="submit"
                      disabled={!isDirty || !canSubmit || !isValid || isSubmitting}
                    >
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                    {isDirty && !isSubmitting && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
                  </div>
                )}
              />
            </>
          )}
        </Form>
      </CardContent>
    </Card>
  );
}
