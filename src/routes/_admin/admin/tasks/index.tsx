import { createFileRoute } from '@tanstack/react-router';
import { Activity, BarChart3, Database, RefreshCcw, Trash, Upload } from 'lucide-react';
import EnhancedTaskList from '@/components/admin/tasks/EnhancedTaskList';
import TaskMonitoringDashboard from '@/components/admin/tasks/TaskMonitoringDashboard';
import LinkTile from '@/components/ui/link-tile';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import styles from './index.module.css';

export const Route = createFileRoute('/_admin/admin/tasks/')({
  head: () => ({ meta: [{ title: 'Tasks | LunaShare' }] }),
  component: AdminTasksPage,
});

function AdminTasksPage() {
  return (
    <div className="container pad-y-8">
      <h1 className="type-2xl weight-bold margin-bottom-6">Admin Tasks</h1>

      <div className="margin-bottom-8">
        <h2 className="type-lg weight-semibold margin-bottom-4">Manual Operations</h2>
        <div className={styles.tileGrid}>
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

      <Separator className={styles.separator} />

      <div>
        <h2 className="type-lg weight-semibold margin-bottom-4">Automated Task Management</h2>
        <Tabs defaultValue="tasks">
          <TabsList className={styles.tabsList}>
            <TabsTrigger
              value="tasks"
              className="cluster space-2"
            >
              <Activity className={styles.icon} />
              Task Manager
            </TabsTrigger>
            <TabsTrigger
              value="monitoring"
              className="cluster space-2"
            >
              <BarChart3 className={styles.icon} />
              Monitoring
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="tasks"
            className="margin-top-6"
          >
            <EnhancedTaskList />
          </TabsContent>
          <TabsContent
            value="monitoring"
            className="margin-top-6"
          >
            <TaskMonitoringDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
