import { createFileRoute, Outlet } from '@tanstack/react-router';
import Footer from '@/components/landing/Footer';

export const Route = createFileRoute('/_privacy')({
  component: PrivacyLayout,
});

function PrivacyLayout() {
  return (
    <main className="mx-auto max-w-7xl">
      <div className="my-2.5 border bg-muted px-2 py-5 shadow-xs shadow-muted-foreground/40">
        <Outlet />
      </div>
      <Footer />
    </main>
  );
}
