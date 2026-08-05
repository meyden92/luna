import { createMiddleware } from '@tanstack/react-start';
import { env } from '@/libs/env';

export const loggingFnMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const start = performance.now();
  try {
    const result = await next();
    const ms = Math.round(performance.now() - start);
    if (env.NODE_ENV !== 'production') {
      console.log(`[fn] ${ms}ms`);
    }
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    console.error(`[fn] ${ms}ms FAILED`, err);
    throw err;
  }
});

export const loggingRequestMiddleware = createMiddleware({ type: 'request' }).server(async ({ next, request }) => {
  const start = performance.now();
  const { pathname } = new URL(request.url);
  try {
    const result = await next();
    const ms = Math.round(performance.now() - start);
    if (env.NODE_ENV !== 'production') {
      console.log(`[req] ${request.method} ${pathname} ${ms}ms`);
    }
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    console.error(`[req] ${request.method} ${pathname} ${ms}ms FAILED`, err);
    throw err;
  }
});
