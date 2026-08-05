import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getUserGroups, updateUserGroups } from '@/server/fns/admin/users';

type GroupOption = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
};

interface UserGroupAssignmentProps {
  userId: string;
}

export default function RbacUserGroupAssignment({ userId }: UserGroupAssignmentProps) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [assignedGroupIds, setAssignedGroupIds] = useState<string[]>([]);
  const [requiredGroupKeys, setRequiredGroupKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selected = useMemo(() => new Set(assignedGroupIds), [assignedGroupIds]);
  const requiredKeySet = useMemo(() => new Set(requiredGroupKeys), [requiredGroupKeys]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await getUserGroups({ data: { userId } });
      setGroups(payload.availableGroups);
      setAssignedGroupIds(payload.assignedGroupIds);
      setRequiredGroupKeys(payload.requiredGroupKeys || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load user groups');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleGroup = (groupId: string) => {
    const group = groups.find((entry) => entry.id === groupId);
    if (group && requiredKeySet.has(group.key)) {
      return;
    }

    setAssignedGroupIds((current) => (current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]));
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await updateUserGroups({ data: { userId, groupIds: assignedGroupIds } });
      toast.success('User groups updated');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save user groups');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p>Loading user groups...</p>;
  }

  return (
    <div className="space-y-3">
      <Label className="text-muted-foreground text-sm">Access Group Assignments</Label>
      <div className="grid grid-cols-1 gap-2">
        {groups.map((group) => (
          <label
            key={group.id}
            className="flex items-center gap-2 border rounded px-3 py-2"
          >
            <input
              type="checkbox"
              checked={selected.has(group.id)}
              disabled={requiredKeySet.has(group.key)}
              onChange={() => toggleGroup(group.id)}
            />
            <div>
              <div className="text-sm font-medium">{group.name}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {group.key}
                {requiredKeySet.has(group.key) ? ' (required)' : ''}
              </div>
            </div>
          </label>
        ))}
      </div>
      <Button
        type="button"
        onClick={save}
        disabled={isSaving}
      >
        {isSaving ? 'Saving...' : 'Save Group Assignments'}
      </Button>
    </div>
  );
}
