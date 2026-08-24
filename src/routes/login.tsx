import { createFileRoute, redirect } from '@tanstack/react-router';
import { Loader2, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Brandmark } from '@/components/landing/Brandmark';
import { NightBandBackdrop } from '@/components/landing/NightBandBackdrop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type FormConfigWithSchema,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSubscribe,
  FormWithSchema,
} from '@/components/ui/tanstack-form';
import { authClient } from '@/libs/auth/auth-client';
import { signInSchema } from '@/schemas/credentials-schema';

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
  const callbackURL = safeRedirectPath(search.redirect);

  // The page is server-rendered, so between first paint and hydration a submit
  // is handled by the browser rather than by React — a native GET that navigates
  // away and throws away what was typed. Keeping the button disabled until the
  // client has taken over is the whole fix.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => setIsReady(true), []);

  const formConfig: FormConfigWithSchema<typeof signInSchema> = {
    schema: signInSchema,
    defaultValues: { username: '', password: '' },
    onSubmit: async ({ username, password }) => {
      const result = await authClient.signIn.username({ username, password });

      // Never distinguish "no such Username" from "wrong password": the login
      // form is public, and a specific message turns it into an account
      // enumeration oracle (#54). Better-Auth's own message is already generic;
      // the rate-limit refusal is the one case worth passing through verbatim.
      if (result.error) {
        const message = result.error.status === 429 ? 'Too many attempts. Try again in a few minutes.' : 'Invalid username or password';
        toast.error(message, { position: 'bottom-center' });
        return;
      }

      window.location.href = callbackURL;
    },
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
            <p className="text-[14.5px] leading-[1.6] text-luna-ink-3">Login to your account</p>
          </div>

          <FormWithSchema
            config={formConfig}
            className="space-y-5"
          >
            <FormField
              name="username"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="username"
                      autoFocus
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="password"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormSubscribe
              selectorAction={(state: any) => state.isSubmitting as boolean}
              renderAction={(isSubmitting: boolean) => (
                <Button
                  type="submit"
                  disabled={isSubmitting || !isReady}
                  className="w-full"
                  size="lg"
                >
                  {isSubmitting || !isReady ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogIn className="mr-2 size-4" />}
                  Login
                </Button>
              )}
            />
          </FormWithSchema>
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-luna-line bg-luna-bg-2 lg:block lg:w-1/2">
        <NightBandBackdrop />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-luna-bg-2 via-luna-bg-2/70 to-transparent" />

        <div className="relative flex h-full flex-col justify-end gap-4 p-[52px_48px]">
          <h2 className="font-serif text-[clamp(34px,3.6vw,52px)] font-normal leading-[1.02] tracking-[-0.02em] text-luna-ink">
            Share simply,
            <br />
            <em className="italic text-luna-accent-2 dark:text-luna-accent">sleep easy</em>.
          </h2>
        </div>
      </div>
    </div>
  );
}
