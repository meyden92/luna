import { createFileRoute, Outlet } from '@tanstack/react-router';
import Footer from '@/components/landing/Footer';

export const Route = createFileRoute('/_dashboard/_bin')({
  component: BinLayout,
});

function BinLayout() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
