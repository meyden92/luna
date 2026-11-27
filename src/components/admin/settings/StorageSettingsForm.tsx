import { useSuspenseQuery } from '@tanstack/react-query';
import { HardDrive } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import {
  renderStoragePath,
  STORAGE_PATH_NAMES,
  STORAGE_PATHS,
  type StoragePathName,
  type StoragePathTemplates,
  type StoragePathValues,
  storagePathProblem,
} from '@/libs/storage-paths';
import { saveStorageSettings } from '@/server/fns/admin/platform-settings';
import { platformSettingsQueryOptions } from './queries';
import styles from './settings-form.module.css';

const SAMPLE_VALUES: StoragePathValues<StoragePathName> = {
  userId: 'USER_ID',
  fileId: 'FILE_ID',
  hash: '3f9a2c71',
  ext: 'png',
  generationId: 'GENERATION_ID',
  index: 0,
  uuid: '0b6f1e2a-7c4d-4e8a-9f31-5d2c8a6b4e10',
};

/** Where system objects are stored in the bucket, as key templates with variables. */
export function StorageSettingsForm() {
  const { data: settings } = useSuspenseQuery(platformSettingsQueryOptions);
  const [paths, setPaths] = useState<StoragePathTemplates>(() => {
    const { renditionPath, studioOutputPath, templatePreviewPath, templateReferencePath, avatarPath } = settings;
    return { renditionPath, studioOutputPath, templatePreviewPath, templateReferencePath, avatarPath };
  });
  const problems = Object.fromEntries(STORAGE_PATH_NAMES.map((name) => [name, storagePathProblem(name, paths[name].trim())]));
  const hasProblem = Object.values(problems).some(Boolean);

  const save = useAppMutation(saveStorageSettings, {
    successMessage: 'Storage settings saved',
    invalidates: [queryKeys.admin.platformSettings],
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(paths);
  };

  return (
    <div className="stack space-6">
      <div>
        <h1 className="cluster space-2 type-2xl weight-bold">
          <HardDrive className={styles.titleIcon} />
          Storage
        </h1>
        <p className={styles.muted}>
          S3 paths of the objects LunaShare stores outside the Files area. A change applies to new objects; existing ones stay where they
          are and keep working. Users&apos; own files always live under their User id.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paths</CardTitle>
          <CardDescription>
            Variables in braces are filled in when an object is stored. <code>{'{yyyy}'}</code>, <code>{'{mm}'}</code> and{' '}
            <code>{'{dd}'}</code> are the UTC date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="stack space-6"
            onSubmit={onSubmit}
          >
            {STORAGE_PATH_NAMES.map((name) => {
              const path = STORAGE_PATHS[name];
              const problem = problems[name];
              return (
                <div
                  key={name}
                  className="stack space-2"
                >
                  <Label htmlFor={`storage-${name}`}>{path.label}</Label>
                  <Input
                    id={`storage-${name}`}
                    className={styles.path}
                    value={paths[name]}
                    onChange={(event) => setPaths((current) => ({ ...current, [name]: event.target.value }))}
                    placeholder={path.defaultTemplate}
                    aria-invalid={problem ? true : undefined}
                    disabled={save.isPending}
                    spellCheck={false}
                  />
                  <p className={styles.muted}>
                    {path.description} Variables: {path.variables.map((variable) => `{${variable}}`).join(' ')}. Default:{' '}
                    <code>{path.defaultTemplate}</code>
                  </p>
                  {problem ? (
                    <p className={styles.problem}>{problem}</p>
                  ) : (
                    <p className={styles.example}>e.g. {renderStoragePath<StoragePathName>(paths[name].trim(), SAMPLE_VALUES)}</p>
                  )}
                </div>
              );
            })}
            <div>
              <Button
                type="submit"
                disabled={save.isPending || hasProblem}
              >
                Save paths
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
