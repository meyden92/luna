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
import styles from './login.module.css';

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

  // Between first paint and hydration a submit is handled by the browser, not
  // React: a native GET that navigates away and discards what was typed.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => setIsReady(true), []);

  const formConfig: FormConfigWithSchema<typeof signInSchema> = {
    schema: signInSchema,
    defaultValues: { username: '', password: '' },
    onSubmit: async ({ username, password }) => {
      const result = await authClient.signIn.username({ username, password });

      // Never distinguish "no such Username" from "wrong password": on a public
      // form a specific message is an account enumeration oracle.
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
    <div className={styles.root}>
      <div className={styles.signin}>
        <div className={`${styles.form} stack`}>
          <div className={styles.intro}>
            <Brandmark size={44} />
            <h1 className={styles.title}>
              Welcome back to <span className={styles.brand}>LunaShare</span>
            </h1>
            <p className={styles.subtitle}>Login to your account</p>
          </div>

          <FormWithSchema
            config={formConfig}
            className={`${styles.fields} stack`}
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
                  className={styles.submit}
                  size="lg"
                >
                  {isSubmitting || !isReady ? (
                    <Loader2 className={`${styles.icon} ${styles.spinner}`} />
                  ) : (
                    <LogIn className={styles.icon} />
                  )}
                  Login
                </Button>
              )}
            />
          </FormWithSchema>
        </div>
      </div>

      <div className={styles.panel}>
        <NightBandBackdrop />
        <div className={styles.panelScrim} />

        <div className={styles.panelBody}>
          <h2 className={styles.panelTitle}>
            Share simply,
            <br />
            <em className={styles.panelAccent}>sleep easy</em>.
          </h2>
        </div>
      </div>
    </div>
  );
}
