import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  ChevronDown,
  CodeSquare,
  GitBranch,
  HomeIcon,
  LogOut,
  Menu,
  Moon,
  Music,
  Settings2,
  Shield,
  Sparkles,
  Sun,
  ToolCase,
  User2,
  Video,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useImpersonation } from '@/hooks/use-impersonation';
import { authClient } from '@/libs/auth/auth-client';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';

interface NavigationProps extends React.ComponentProps<'nav'> {
  canAccessAdmin?: boolean;
  onSignOut?: () => void | Promise<void>;
}

type NavigationItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavigationItem[];
};

const TOOLS_NAV_ITEMS: NavigationItem[] = [
  { href: '/tools/audio', label: 'Audio', icon: Music },
  { href: '/tools/converter', label: 'Converter', icon: CodeSquare },
  { href: '/tools/video', label: 'Video Editor', icon: Video },
];

const NAV_LINKS: NavigationItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/bin', label: 'Snippets', icon: CodeSquare },
  { href: '/ai/generate', label: 'Generate', icon: Sparkles },
  { href: '/automations', label: 'Automations', icon: GitBranch },
  { href: '/tools', label: 'Tools (Beta)', icon: ToolCase, children: TOOLS_NAV_ITEMS },
  { href: '/player', label: 'Music', icon: Music },
];

const LOADING_LINK_SKELETONS = ['one', 'two', 'three'];

export default function Navigation({ className, canAccessAdmin = false, onSignOut, ...props }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const [mobileToolsOpen, setMobileToolsOpen] = useState(pathname.startsWith('/tools'));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isImpersonating, isLoading: isImpersonationLoading } = useImpersonation();
  const { data: clientSession, isPending } = authClient.useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    setThemeReady(true);
  }, []);

  const resolvedSession = clientSession?.session;
  const resolvedUser = clientSession?.user;
  const isSessionLoading = isPending && !resolvedSession;
  const canAccessAdminResolved = canAccessAdmin || resolvedUser?.role === 'admin';

  const isActive = (path: string) => pathname === path;
  const isSubRouteActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const isNavigationItemActive = (item: NavigationItem) => {
    if (!item.children?.length) return isActive(item.href);
    return item.children.some((child) => isSubRouteActive(child.href));
  };

  const handleSignOut = async () => {
    if (onSignOut) {
      await onSignOut();
      return;
    }
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            // Drop the cached session so route guards see the logout immediately.
            queryClient.removeQueries({ queryKey: queryKeys.user.session });
            toast.success('Logged out successfully');
            navigate({ to: '/login' });
          },
        },
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to logout');
    }
  };

  const themeIsDark = resolvedTheme === 'dark';

  return (
    <nav
      className={cn(
        'luna-nav-enter fixed z-40 w-full border-b border-luna-line bg-luna-bg/86 backdrop-blur-[14px]',
        isImpersonating && !isImpersonationLoading ? 'top-12' : 'top-0',
        className,
      )}
      {...props}
    >
      <div className="relative z-10 mx-auto flex h-[4.625rem] items-center gap-8 px-7">
        <Link
          to="/"
          aria-label="LunaShare home"
          className="flex shrink-0 items-center"
        >
          <img
            src="/lunashare-logo.png"
            alt="LunaShare"
            width={139}
            height={34}
            className="h-[34px] w-auto dark:hidden"
          />
          <img
            src="/lunashare-logo-dark.png"
            alt="LunaShare"
            width={139}
            height={34}
            className="hidden h-[34px] w-auto dark:block"
          />
        </Link>

        {(resolvedSession || isSessionLoading) && (
          <div className="hidden flex-1 items-center gap-1 text-[13.5px] font-medium text-luna-ink-3 lg:flex">
            {isSessionLoading
              ? LOADING_LINK_SKELETONS.map((id) => (
                  <Skeleton
                    key={`nav-skeleton-${id}`}
                    className="h-5 w-20"
                  />
                ))
              : NAV_LINKS.map((link) => {
                  if (link.children?.length) {
                    const active = isNavigationItemActive(link);
                    return (
                      <DropdownMenu key={link.href}>
                        <DropdownMenuTrigger
                          className={cn(
                            'relative inline-flex items-center gap-1.5 rounded-lg px-[13px] py-2 transition-colors',
                            active ? 'luna-prodnav-active text-luna-ink' : 'hover:bg-luna-bg-2 hover:text-luna-ink',
                          )}
                        >
                          {link.label}
                          <ChevronDown className="h-3 w-3 opacity-70" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          className="w-56"
                          align="start"
                        >
                          {link.children.map((child) => {
                            const ChildIcon = child.icon;
                            return (
                              <DropdownMenuItem key={child.href}>
                                <Link
                                  to={child.href}
                                  className={cn('flex w-full items-center gap-2', isSubRouteActive(child.href) && 'text-luna-accent-2')}
                                >
                                  <ChildIcon className="h-4 w-4" />
                                  <span>{child.label}</span>
                                </Link>
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  }

                  return (
                    <Link
                      key={link.href}
                      to={link.href}
                      className={cn(
                        'relative inline-flex items-center gap-1.5 rounded-lg px-[13px] py-2 transition-colors',
                        isActive(link.href) ? 'luna-prodnav-active text-luna-ink' : 'hover:bg-luna-bg-2 hover:text-luna-ink',
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setTheme(themeIsDark ? 'light' : 'dark')}
            aria-label="Toggle theme"
            className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-luna-line bg-luna-bg text-luna-ink transition-all hover:-translate-y-px hover:bg-luna-bg-2"
          >
            {themeReady ? themeIsDark ? <Sun size={15} /> : <Moon size={15} /> : <Moon size={15} />}
          </button>

          {resolvedSession && (
            <button
              type="button"
              className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-luna-line bg-luna-bg text-luna-ink transition-all hover:bg-luna-bg-2 lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          )}

          {!resolvedSession && isSessionLoading && <Skeleton className="h-10 w-10 rounded-full" />}

          {resolvedSession ? (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Avatar className="h-10 w-10 border border-luna-line">
                  <AvatarImage
                    src={resolvedUser?.image || undefined}
                    alt={resolvedUser?.name || 'User'}
                  />
                  <AvatarFallback className="bg-luna-accent-soft text-luna-accent-2">{resolvedUser?.name?.[0] || 'U'}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                align="end"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{resolvedUser?.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">{resolvedUser?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <Link
                        to="/dashboard"
                        className="flex items-center"
                      >
                        <HomeIcon className="mr-2 h-4 w-4" />
                        <span>Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Link
                        to="/settings"
                        className="flex items-center"
                      >
                        <Settings2 className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Link
                        to="/profile/$id"
                        params={{ id: resolvedUser?.id ?? '' }}
                        className="flex items-center"
                      >
                        <User2 className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                  {canAccessAdminResolved && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Link
                          to="/admin"
                          className="flex items-center text-destructive"
                        >
                          <Shield className="mr-2 h-4 w-4" />
                          <span>Admin</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            !isSessionLoading && (
              <>
                <Link
                  to="/login"
                  className="hidden rounded-[10px] border border-luna-line bg-luna-bg px-4 py-2 text-[13.5px] font-medium text-luna-ink transition-colors hover:bg-luna-bg-2 sm:inline-flex"
                >
                  Login
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-luna-accent px-4 py-2 text-[13.5px] font-medium text-[oklch(0.15_0.03_162)] transition-all hover:-translate-y-px hover:shadow-[0_10px_24px_-10px_color-mix(in_oklab,var(--luna-accent)_55%,transparent)]"
                >
                  Open app <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )
          )}
        </div>
      </div>

      {resolvedSession && mobileMenuOpen && (
        <div className="border-t border-luna-line bg-luna-bg px-6 py-4 lg:hidden">
          <div className="flex flex-col space-y-2">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;

              if (link.children?.length) {
                const isToolsSectionOpen = mobileToolsOpen || isNavigationItemActive(link);
                return (
                  <div
                    key={link.href}
                    className="space-y-1"
                  >
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors',
                        isNavigationItemActive(link)
                          ? 'border-luna-accent text-luna-accent-2'
                          : 'border-transparent text-luna-ink-3 hover:border-luna-line-2 hover:text-luna-ink',
                      )}
                      onClick={() => setMobileToolsOpen((prev) => !prev)}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        {link.label}
                      </span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', isToolsSectionOpen && 'rotate-180')} />
                    </button>

                    {isToolsSectionOpen && (
                      <div className="ml-6 flex flex-col space-y-1 border-l border-luna-line pl-3">
                        {link.children.map((child) => {
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              key={child.href}
                              to={child.href}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors',
                                isSubRouteActive(child.href) ? 'text-luna-accent-2' : 'text-luna-ink-3 hover:text-luna-ink',
                              )}
                              onClick={() => {
                                setMobileMenuOpen(false);
                                setMobileToolsOpen(false);
                              }}
                            >
                              <ChildIcon className="h-4 w-4" />
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors',
                    isActive(link.href)
                      ? 'border-luna-accent text-luna-accent-2'
                      : 'border-transparent text-luna-ink-3 hover:border-luna-line-2 hover:text-luna-ink',
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
