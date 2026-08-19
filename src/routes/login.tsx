import { createFileRoute, redirect } from '@tanstack/react-router';
import { Loader2, LogIn } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Brandmark } from '@/components/landing/Brandmark';
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

  // Split screen from lg up: sign-in on the left, brand panel on the right.
  // Below lg the brand panel drops out and the sign-in column stays centred.
  return (
    <div className="flex min-h-full">
      <div className="flex w-full items-center justify-center px-6 py-16 lg:w-1/2">
        <div className="w-full max-w-[375px] space-y-8">
          <div className="flex flex-col items-center space-y-3 text-center lg:items-start lg:text-left">
            <Brandmark size={44} />
            <h1 className="font-serif text-[clamp(30px,3.2vw,42px)] font-normal leading-[1.05] tracking-[-0.02em] text-luna-ink">
              Welcome back to <span className="italic text-luna-accent-2 dark:text-luna-accent">LunaShare</span>
            </h1>
            <p className="text-[14.5px] leading-[1.6] text-luna-ink-3">Login to your account using Discord</p>
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

      <div className="relative hidden overflow-hidden border-l border-luna-line bg-luna-bg-2 lg:block lg:w-1/2">
        <img
          src="/decor/night-band-light.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70 dark:hidden"
        />
        <img
          src="/decor/night-band.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-50 dark:block"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-luna-bg-2 via-luna-bg-2/70 to-transparent" />

        <div className="relative flex h-full flex-col justify-end gap-4 p-[52px_48px]">
          <span className="font-mono text-[11px] tracking-[0.12em] text-luna-accent-2 dark:text-luna-accent">WELCOME BACK</span>
          <h2 className="font-serif text-[clamp(34px,3.6vw,52px)] font-normal leading-[1.02] tracking-[-0.02em] text-luna-ink">
            Share simply,
            <br />
            <em className="italic text-luna-accent-2 dark:text-luna-accent">sleep easy</em>.
          </h2>
          <p className="max-w-[46ch] text-[14.5px] leading-[1.6] text-luna-ink-3">
            Your files, sent quietly into the night — no ads, no tracking, no one peering over your shoulder.
          </p>
        </div>
      </div>
    </div>
  );
}
