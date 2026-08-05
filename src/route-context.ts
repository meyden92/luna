import type { QueryClient } from '@tanstack/react-query';
import type { Session } from '@/libs/auth/auth';

export type Theme = 'default' | 'light' | 'dark';

export interface RootRouteContext {
  queryClient: QueryClient;
  session: Session | null;
  initialTheme: Theme;
}
