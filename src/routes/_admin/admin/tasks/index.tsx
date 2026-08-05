import { createFileRoute } from '@tanstack/react-router';
import { Activity, BarChart3, Database, RefreshCcw, Trash, Upload } from 'lucide-react';
import EnhancedTaskList from '@/components/admin/tasks/EnhancedTaskList';
import TaskMonitoringDashboard from '@/components/admin/tasks/TaskMonitoringDashboard';
import LinkTile from '@/components/ui/link-tile';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const Route = createFileRoute('/_admin/admin/tasks/')({
  head: () => ({ meta: [{ title: 'Tasks | LunaShare' }] }),
  component: AdminTasksPage,
});

function AdminTasksPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Admin Tasks</h1>

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Manual Operations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <LinkTile
            href="/admin/tasks/sync-files"
            title="Sync Files"
            description="Synchronize files with storage"
            icon={RefreshCcw}
          />
          <LinkTile
            href="/admin/tasks/test-upload"
            title="Test Upload"
            description="Test file upload functionality"
            icon={Upload}
          />
          <LinkTile
            href="/admin/tasks/delete-cache"
            title="Delete Cache"
            description="Clear cached data"
            icon={Trash}
          />
          <LinkTile
            href="/admin/tasks/deleted-files"
            title="Manage Deleted Files"
            description="View and manage deleted files"
            icon={Database}
          />
        </div>
      </div>

      <Separator className="my-8" />

      <div>
        <h2 className="text-lg font-semibold mb-4">Automated Task Management</h2>
        <Tabs
          defaultValue="tasks"
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="tasks"
              className="flex items-center gap-2"
            >
              <Activity className="h-4 w-4" />
              Task Manager
            </TabsTrigger>
            <TabsTrigger
              value="monitoring"
              className="flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Monitoring
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="tasks"
            className="mt-6"
          >
            <EnhancedTaskList />
          </TabsContent>
          <TabsContent
            value="monitoring"
            className="mt-6"
          >
            <TaskMonitoringDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
