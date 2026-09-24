import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { ChevronDown, LogOut, Moon, Settings2, Shield, Sun, Upload } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUploadSheet } from '@/contexts/upload-sheet';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { authClient } from '@/libs/auth/auth-client';
import { queryKeys } from '@/libs/query-keys';
import { cn, getAvatarUrl } from '@/libs/utils';
import styles from './AppNav.module.css';

/** A destination, or a label whose destinations live in a dropdown. */
type NavEntry = { label: string; to: LinkTo } | { label: string; match: string; children: readonly { label: string; to: LinkTo }[] };

type LinkTo = React.ComponentProps<typeof Link>['to'];

/** The tools dropdown is kept from the old nav; only its label lost "(Beta)". */
const TOOLS_LINKS = [
  { to: '/tools/audio', label: 'Audio' },
  { to: '/tools/converter', label: 'Converter' },
  { to: '/tools/video', label: 'Video editor' },
] as const satisfies readonly { label: string; to: LinkTo }[];

const NAV_LINKS: readonly NavEntry[] = [
  { to: '/dashboard', label: 'Files' },
  { to: '/ai/generate', label: 'Generate' },
  { to: '/bin', label: 'Snippets' },
  { to: '/automations', label: 'Automations' },
  { label: 'Tools', match: '/tools', children: TOOLS_LINKS },
  { to: '/player', label: 'Music' },
];

type Box = { x: number; width: number };

function boxOf(element: HTMLElement | null): Box | null {
  return element ? { x: element.offsetLeft, width: element.offsetWidth } : null;
}

/**
 * The nav links, with one pill that slides to whichever link is active and a
 * fainter ghost that follows the pointer.
 *
 * Both are single elements measured from the real links rather than a
 * background on each link, so the highlight travels continuously instead of
 * cross-fading. They sit behind the text, never over it. `data-ready` gates the
 * transition so the pill appears under the active link on first paint instead
 * of flying in from the left.
 */
function NavLinks() {
  const { pathname } = useLocation();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState<Box | null>(null);
  const [hovered, setHovered] = React.useState<Box | null>(null);
  const [ready, setReady] = React.useState(false);

  const measure = React.useCallback(() => {
    setActive(boxOf(containerRef.current?.querySelector<HTMLElement>('[data-active]') ?? null));
  }, []);

  useIsomorphicLayoutEffect(measure, [measure, pathname]);

  // A font swap or a resized window moves the links without changing the route.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measure]);

  const isActive = (to: string | undefined) => to !== undefined && (pathname === to || pathname.startsWith(`${to}/`));

  return (
    <div
      ref={containerRef}
      className={styles.links}
      data-ready={ready || undefined}
      onPointerLeave={() => setHovered(null)}
    >
      {hovered && (
        <span
          aria-hidden
          className={styles.ghost}
          style={{ translate: `${hovered.x}px 0`, width: hovered.width }}
        />
      )}
      {active && (
        <span
          aria-hidden
          className={styles.pill}
          style={{ translate: `${active.x}px 0`, width: active.width }}
        />
      )}

      {NAV_LINKS.map((link) => {
        if ('children' in link) {
          return (
            <DropdownMenu key={link.label}>
              <DropdownMenuTrigger
                className={styles.link}
                data-active={isActive(link.match) || undefined}
                onPointerEnter={(event) => setHovered(boxOf(event.currentTarget))}
              >
                {link.label}
                <ChevronDown className={styles.chevron} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {link.children.map((child) => (
                  <DropdownMenuItem key={child.to}>
                    <Link
                      to={child.to}
                      className={styles.menuLink}
                    >
                      {child.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        return (
          <Link
            key={link.label}
            to={link.to}
            className={styles.link}
            data-active={isActive(link.to) || undefined}
            onPointerEnter={(event) => setHovered(boxOf(event.currentTarget))}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The logged-in app's nav bar: 56px of sticky chrome carrying the one global
 * primary action. Upload lives here rather than on Files because uploading is
 * something the owner does from anywhere.
 *
 * The bar sits outside the page view transition — `view-transition-name: nav`
 * in the module, with its animation turned off — so it stays put while the page
 * underneath it crossfades. The marketing nav is a separate component
 * (`src/components/landing/Navigation.tsx`); this one never renders logged out.
 */
function AppNav({ canAccessAdmin = false }: { canAccessAdmin?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const upload = useUploadSheet();

  // The resolved Appearance is unknown until next-themes has read the document,
  // so the icon holds still until then rather than flipping after hydration.
  const [appearanceReady, setAppearanceReady] = React.useState(false);
  React.useEffect(() => setAppearanceReady(true), []);
  const isDark = resolvedTheme === 'dark';

  const user = session?.user;
  const showAdmin = canAccessAdmin || user?.role === 'admin';

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          // Drop the cached session so route guards see the logout immediately.
          queryClient.removeQueries({ queryKey: queryKeys.user.session });
          toast.success('Logged out');
          navigate({ to: '/login' });
        },
      },
    });
  };

  return (
    <nav className={styles.root}>
      <Link
        to="/dashboard"
        aria-label="LunaShare home"
        className={styles.brand}
      >
        <img
          src="/lunashare-logo.png"
          alt="LunaShare"
          className={cn(styles.logo, styles.logoLight)}
        />
        <img
          src="/lunashare-logo-dark.png"
          alt="LunaShare"
          className={cn(styles.logo, styles.logoDark)}
        />
      </Link>

      <NavLinks />

      <div className={styles.actions}>
        <Button
          size="sm"
          onClick={() => upload.open()}
        >
          <Upload data-icon="inline-start" />
          Upload
        </Button>

        <button
          type="button"
          className={styles.iconButton}
          aria-label={isDark ? 'Switch to light appearance' : 'Switch to dark appearance'}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          {appearanceReady && !isDark ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={styles.avatarTrigger}
            aria-label="Account"
          >
            <Avatar className={styles.avatar}>
              <AvatarImage
                src={getAvatarUrl(user?.image) ?? undefined}
                alt={user?.name || 'You'}
              />
              <AvatarFallback className={styles.avatarFallback}>{user?.name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={styles.accountMenu}
          >
            <div className={styles.accountHeader}>
              <strong>{user?.name}</strong>
              <span>Signed in</span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link
                to="/settings"
                className={styles.menuLink}
              >
                <Settings2 className={styles.menuIcon} />
                Settings
              </Link>
            </DropdownMenuItem>
            {showAdmin && (
              <DropdownMenuItem>
                <Link
                  to="/admin"
                  className={styles.menuLink}
                >
                  <Shield className={styles.menuIcon} />
                  Admin
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className={styles.menuIcon} />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}

export { AppNav };
