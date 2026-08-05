import { createFileRoute } from '@tanstack/react-router';
import { env } from '@/libs/env';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          JSON.stringify({
            status: 'ok',
            build: {
              commit: env.BUILD_COMMIT ?? 'unknown',
              time: env.BUILD_TIME ?? 'unknown',
            },
            timestamp: new Date().toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    },
  },
});
