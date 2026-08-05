import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { queryKeys } from '@/libs/query-keys';
import { createAdminTask, getAdminTask, listTaskFunctions, updateAdminTask } from '@/server/fns/admin/tasks';
import type { TaskFormData } from '@/types/tasks';
import CronBuilder from './cron-builder';

interface TaskFormProps {
  taskId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function SimpleTaskForm({ taskId, onSuccess, onCancel }: TaskFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cronExpression: '',
    taskFunction: '',
    args: '',
    enabled: true,
    timeout: 120000,
    maxRetries: 3,
  });
  const [argsError, setArgsError] = useState<string>('');
  const queryClient = useQueryClient();
  const isEditing = !!taskId;

  // Fetch available task functions
  const { data: functionsData, isLoading: functionsLoading } = useQuery({
    queryKey: queryKeys.adminTasks.functions,
    queryFn: async () => {
      return listTaskFunctions();
    },
  });

  // Fetch existing task data if editing
  const { data: existingTask, isLoading: taskLoading } = useQuery({
    queryKey: queryKeys.adminTasks.detail(taskId ?? ''),
    queryFn: async () => {
      if (!taskId) return null;
      return getAdminTask({ data: { id: taskId } });
    },
    enabled: isEditing,
  });

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      let parsedArgs: unknown[] | undefined;
      if (data.args) {
        try {
          parsedArgs = JSON.parse(data.args);
          if (!Array.isArray(parsedArgs)) {
            throw new Error('Arguments must be a JSON array');
          }
        } catch (_error) {
          throw new Error('Invalid JSON in arguments field');
        }
      }

      const payload: TaskFormData = {
        ...data,
        args: parsedArgs,
        timeout: data.timeout && data.timeout > 0 ? data.timeout : undefined,
      };

      if (isEditing && taskId) {
        // taskFunction cannot be changed when editing
        const { taskFunction: _taskFunction, ...editable } = payload;
        return updateAdminTask({ data: { id: taskId, ...editable } });
      }
      return createAdminTask({ data: payload });
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Task updated successfully' : 'Task created successfully');
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTasks.all });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Load existing task data into form
  useEffect(() => {
    if (existingTask && isEditing) {
      setFormData({
        name: existingTask.name,
        description: existingTask.description,
        cronExpression: existingTask.cronExpression,
        taskFunction: existingTask.taskFunction,
        args: existingTask.args ? JSON.stringify(existingTask.args, null, 2) : '',
        enabled: existingTask.enabled,
        timeout: existingTask.timeout || 120000,
        maxRetries: existingTask.maxRetries || 3,
      });
    }
  }, [existingTask, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate JSON args
    if (formData.args) {
      try {
        JSON.parse(formData.args);
      } catch {
        setArgsError('Invalid JSON format');
        return;
      }
    }
    setArgsError('');
    await mutation.mutateAsync(formData);
  };

  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (functionsLoading || (isEditing && taskLoading)) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const availableFunctions = functionsData?.functions || [];

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isEditing ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          {isEditing ? 'Edit Task' : 'Create New Task'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Task Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="my-awesome-task"
                required
              />
            </div>

            <div>
              <Label htmlFor="taskFunction">Task Function</Label>
              {isEditing ? (
                <Input
                  value={formData.taskFunction}
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
              ) : (
                <Select
                  value={formData.taskFunction}
                  onValueChange={(value) => handleInputChange('taskFunction', value)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a function" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFunctions.map((func: any) => (
                      <SelectItem
                        key={func.name}
                        value={func.name}
                      >
                        {func.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isEditing && <p className="text-sm text-muted-foreground mt-1">Task function cannot be changed when editing</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe what this task does..."
              rows={3}
              required
            />
          </div>

          <div>
            <CronBuilder
              value={formData.cronExpression}
              onChange={(cronExpression) => handleInputChange('cronExpression', cronExpression)}
            />
          </div>

          <div>
            <Label htmlFor="args">Arguments (JSON)</Label>
            <Textarea
              id="args"
              value={formData.args}
              onChange={(e) => handleInputChange('args', e.target.value)}
              placeholder='["arg1", "arg2"] or leave empty for no arguments'
              rows={3}
            />
            {argsError && <p className="text-sm text-destructive mt-1">{argsError}</p>}
            <p className="text-sm text-muted-foreground mt-1">
              Arguments to pass to the task function as JSON array. Leave empty if the function takes no arguments.
            </p>
          </div>

          {/* Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="timeout">Timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                value={formData.timeout}
                onChange={(e) => handleInputChange('timeout', Number.parseInt(e.target.value, 10) || 0)}
                placeholder="120000"
                min="1000"
                max="3600000"
              />
            </div>

            <div>
              <Label htmlFor="maxRetries">Max Retries</Label>
              <Input
                id="maxRetries"
                type="number"
                value={formData.maxRetries}
                onChange={(e) => handleInputChange('maxRetries', Number.parseInt(e.target.value, 10) || 0)}
                min="0"
                max="10"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Enabled</Label>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(value) => handleInputChange('enabled', value)}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-6">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Update Task' : 'Create Task'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
