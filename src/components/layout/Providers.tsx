import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { TooltipProvider } from '../ui/tooltip';
import { AppToaster } from './app-toaster';

type ProvidersProps = PropsWithChildren;

const Providers = ({ children, ...props }: ProvidersProps) => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider
      client={queryClient}
      {...props}
    >
      <TooltipProvider delay={200}>{children}</TooltipProvider>
      <AppToaster />
    </QueryClientProvider>
  );
};

export default Providers;
