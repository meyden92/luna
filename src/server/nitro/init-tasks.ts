import { definePlugin } from 'nitro';
import { initializeTasks } from '@/libs/tasks/init';

// Nitro startup plugin: runs once when the server boots. Replaces the old Next.js
// `instrumentation.ts` (`register()` + `NEXT_RUNTIME`), which TanStack Start never
// invokes. Kicks off the cron TaskManager without blocking server startup.
export default definePlugin(() => {
  initializeTasks().catch((error) => {
    console.error('✗ Failed to initialize cron jobs:', error);
  });
});
