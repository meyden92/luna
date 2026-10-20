import { definePlugin } from 'nitro';
import { getTaskByName } from '@/db/queries/tasks';
import { initializeTasks, UPDATE_YT_DLP_TASK_NAME } from '@/libs/tasks/init';
import { TaskManager } from '@/libs/tasks/task-manager';

// Nitro startup plugin: runs once when the server boots. Replaces the old Next.js
// `instrumentation.ts` (`register()` + `NEXT_RUNTIME`), which TanStack Start never
// invokes. Kicks off the cron TaskManager without blocking server startup, then
// runs the yt-dlp update once so a recreated container leaves its pinned
// baseline right away (ADR 0007).
export default definePlugin(() => {
  initializeTasks()
    .then(async () => {
      const task = await getTaskByName(UPDATE_YT_DLP_TASK_NAME);
      if (!task) return;
      await TaskManager.getInstance()
        .executeTaskNow(task.id)
        .catch((error) => {
          console.error('✗ Boot run of yt-dlp update failed:', error);
        });
    })
    .catch((error) => {
      console.error('✗ Failed to initialize cron jobs:', error);
    });
});
