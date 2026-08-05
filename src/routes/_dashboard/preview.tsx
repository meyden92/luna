import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_dashboard/preview')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  component: PreviewLayout,
});

function PreviewLayout() {
  return <Outlet />;
}
