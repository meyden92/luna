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
import { cn, getAvatarUrl } from '@/libs/utils';
import styles from './Navigation.module.css';

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
      className={cn(styles.root, className)}
      data-offset={isImpersonating && !isImpersonationLoading ? '' : undefined}
      {...props}
    >
      <div className={styles.bar}>
        <Link
          to="/"
          aria-label="LunaShare home"
          className={styles.brand}
        >
          <img
            src="/lunashare-logo.png"
            alt="LunaShare"
            width={139}
            height={34}
            className={cn(styles.logo, styles.logoLight)}
          />
          <img
            src="/lunashare-logo-dark.png"
            alt="LunaShare"
            width={139}
            height={34}
            className={cn(styles.logo, styles.logoDark)}
          />
        </Link>

        {(resolvedSession || isSessionLoading) && (
          <div className={styles.links}>
            {isSessionLoading
              ? LOADING_LINK_SKELETONS.map((id) => (
                  <Skeleton
                    key={`nav-skeleton-${id}`}
                    className={styles.linkSkeleton}
                  />
                ))
              : NAV_LINKS.map((link) => {
                  if (link.children?.length) {
                    const active = isNavigationItemActive(link);
                    return (
                      <DropdownMenu key={link.href}>
                        <DropdownMenuTrigger
                          className={styles.link}
                          data-active={active || undefined}
                        >
                          {link.label}
                          <ChevronDown className={styles.chevron} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          className={styles.menuContent}
                          align="start"
                        >
                          {link.children.map((child) => {
                            const ChildIcon = child.icon;
                            return (
                              <DropdownMenuItem key={child.href}>
                                <Link
                                  to={child.href}
                                  className={styles.menuLink}
                                  data-active={isSubRouteActive(child.href) || undefined}
                                >
                                  <ChildIcon className={styles.menuIcon} />
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
                      className={styles.link}
                      data-active={isActive(link.href) || undefined}
                    >
                      {link.label}
                    </Link>
                  );
                })}
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => setTheme(themeIsDark ? 'light' : 'dark')}
            aria-label="Toggle theme"
            className={styles.iconButton}
          >
            {themeReady ? themeIsDark ? <Sun size={15} /> : <Moon size={15} /> : <Moon size={15} />}
          </button>

          {resolvedSession && (
            <button
              type="button"
              className={cn(styles.iconButton, styles.menuButton)}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className={styles.buttonIcon} /> : <Menu className={styles.buttonIcon} />}
            </button>
          )}

          {!resolvedSession && isSessionLoading && <Skeleton className={styles.avatarSkeleton} />}

          {resolvedSession ? (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Avatar className={styles.avatar}>
                  <AvatarImage
                    src={getAvatarUrl(resolvedUser?.image) ?? undefined}
                    alt={resolvedUser?.name || 'User'}
                  />
                  <AvatarFallback className={styles.avatarFallback}>{resolvedUser?.name?.[0] || 'U'}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className={styles.menuContent}
                align="end"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div>
                      <p className={styles.accountName}>{resolvedUser?.name}</p>
                      <p className={styles.accountEmail}>{resolvedUser?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <Link
                        to="/dashboard"
                        className={styles.accountLink}
                      >
                        <HomeIcon className={styles.accountIcon} />
                        <span>Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Link
                        to="/settings"
                        className={styles.accountLink}
                      >
                        <Settings2 className={styles.accountIcon} />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Link
                        to="/profile/$id"
                        params={{ id: resolvedUser?.id ?? '' }}
                        className={styles.accountLink}
                      >
                        <User2 className={styles.accountIcon} />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className={styles.accountIcon} />
                    <span>Log out</span>
                  </DropdownMenuItem>
                  {canAccessAdminResolved && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Link
                          to="/admin"
                          className={cn(styles.accountLink, styles.accountLinkDanger)}
                        >
                          <Shield className={styles.accountIcon} />
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
                  className={styles.signIn}
                >
                  Login
                </Link>
                <Link
                  to="/dashboard"
                  className={styles.openApp}
                >
                  Open app <ArrowRight className={styles.openAppIcon} />
                </Link>
              </>
            )
          )}
        </div>
      </div>

      {resolvedSession && mobileMenuOpen && (
        <div className={styles.drawer}>
          <div className={styles.drawerList}>
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;

              if (link.children?.length) {
                const isToolsSectionOpen = mobileToolsOpen || isNavigationItemActive(link);
                return (
                  <div
                    key={link.href}
                    className={styles.drawerGroup}
                  >
                    <button
                      type="button"
                      className={cn(styles.drawerItem, styles.drawerToggle)}
                      data-active={isNavigationItemActive(link) || undefined}
                      onClick={() => setMobileToolsOpen((prev) => !prev)}
                    >
                      <span className={styles.drawerToggleLabel}>
                        <Icon className={styles.drawerIcon} />
                        {link.label}
                      </span>
                      <ChevronDown
                        className={styles.drawerChevron}
                        data-open={isToolsSectionOpen || undefined}
                      />
                    </button>

                    {isToolsSectionOpen && (
                      <div className={styles.drawerChildren}>
                        {link.children.map((child) => {
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              key={child.href}
                              to={child.href}
                              className={styles.drawerChild}
                              data-active={isSubRouteActive(child.href) || undefined}
                              onClick={() => {
                                setMobileMenuOpen(false);
                                setMobileToolsOpen(false);
                              }}
                            >
                              <ChildIcon className={styles.drawerIcon} />
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
                  className={styles.drawerItem}
                  data-active={isActive(link.href) || undefined}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className={styles.drawerIcon} />
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
