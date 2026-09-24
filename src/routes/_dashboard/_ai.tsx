import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Generate has no chrome of its own: the screen owns its head, and the tabs are
 * state inside it rather than routes. This layout only exists because the
 * `/ai/*` paths live under it.
 */
export const Route = createFileRoute('/_dashboard/_ai')({
  component: () => <Outlet />,
});
