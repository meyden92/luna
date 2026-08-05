import { createFileRoute, redirect } from '@tanstack/react-router';
import { Loader2, LogIn } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { authClient } from '@/libs/auth/auth-client';

type LoginSearch = {
  redirect?: string;
};

function safeRedirectPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

export const Route = createFileRoute('/login')({
  validateSearch: (search): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.session?.user?.id) throw redirect({ href: safeRedirectPath(search.redirect) });
  },
  head: () => ({ meta: [{ title: 'Login | LunaShare' }] }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const [isLoading, setIsLoading] = useState(false);
  const callbackURL = safeRedirectPath(search.redirect);

  const loginWithDiscord = async () => {
    try {
      setIsLoading(true);
      const result = await authClient.signIn.social({
        provider: 'discord',
        callbackURL,
        newUserCallbackURL: callbackURL,
        scopes: ['email', 'identify', 'guilds'],
      });
      if (result.error) {
        toast.error(result.error.message || result.error.statusText, { position: 'bottom-center' });
      }
    } catch {
      toast.error('Something went wrong', { position: 'bottom-center' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container relative flex flex-col items-center justify-center pt-20 lg:px-0">
      <div className="mx-auto flex flex-col justify-center space-y-6 sm:w-[375px]">
        <div className="flex flex-col items-center space-y-2 text-center">
          <LogIn className="size-20 text-primary" />
          <h1 className="text-2xl">
            Welcome back to <span className="font-semibold">LunaShare</span>
          </h1>
          <p className="text-muted-foreground">Login to your account using Discord</p>
        </div>

        <Button
          onClick={loginWithDiscord}
          disabled={isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogIn className="mr-2 size-4" />}
          Login with Discord
        </Button>
      </div>
    </div>
  );
}
