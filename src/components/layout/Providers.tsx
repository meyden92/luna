import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { themeLoader } from '@/libs/theme-loader';
import { TooltipProvider } from '../ui/tooltip';

type ProvidersProps = PropsWithChildren;

const Providers = ({ children, ...props }: ProvidersProps) => {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    themeLoader.applySavedTheme();
  }, []);

  return (
    <QueryClientProvider
      client={queryClient}
      {...props}
    >
      <TooltipProvider delay={200}>{children}</TooltipProvider>
      <Toaster toastOptions={{ duration: 6000 }} />
    </QueryClientProvider>
  );
};

export default Providers;
