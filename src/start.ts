import { createCsrfMiddleware, createStart } from '@tanstack/react-start';
import { errorMappingMiddleware } from '@/server/middleware/error-mapping';
import { loggingFnMiddleware, loggingRequestMiddleware } from '@/server/middleware/logging';

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

export const startInstance = createStart(() => ({
  requestMiddleware: [loggingRequestMiddleware, csrfMiddleware, errorMappingMiddleware],
  functionMiddleware: [loggingFnMiddleware],
}));
