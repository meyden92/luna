import { createFileRoute } from '@tanstack/react-router';
import { getRequestIP } from '@tanstack/react-start/server';
import { handleAuthRequest } from '@/libs/auth/auth';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request, getRequestIP()),
      POST: ({ request }) => handleAuthRequest(request, getRequestIP()),
    },
  },
});
