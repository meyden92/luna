import { createServerFn } from '@tanstack/react-start';
import { getTopEgressConsumers } from '@/libs/egress/record';
import { appMiddleware } from '@/server/server-fn';

export const getAdminEgressTopConsumers = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(() => getTopEgressConsumers());
