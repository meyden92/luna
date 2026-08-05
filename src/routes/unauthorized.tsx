import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, Lock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/unauthorized')({
  head: () => ({ meta: [{ title: 'Unauthorized | LunaShare' }] }),
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  return (
    <main className="flex flex-col items-center justify-center h-full p-4">
      <div className="relative mb-8">
        <div className="relative z-10 p-6 animate-wiggle delay-[400ms]">
          <Lock
            size={80}
            className="text-primary"
          />
        </div>
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
          <div className="w-32 h-32 bg-primary/20 rounded-full opacity-20 animate-pulse-fade delay-[400ms]" />
        </div>
      </div>

      <div className="transform animate-slide-up delay-[400ms] opacity-0 translate-y-12">
        <h1 className="text-4xl font-bold text-center mb-4 text-foreground">Unauthorized</h1>

        <div className="bg-card/70 backdrop-blur-md border border-border rounded-lg p-6 max-w-md shadow-lg relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full opacity-20" />
          <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-primary/10 rounded-full opacity-20" />

          <div className="relative">
            <div className="flex items-start mb-6">
              <div className="bg-destructive/10 p-2 rounded-full mr-3">
                <AlertTriangle className="text-destructive" />
              </div>
              <p className="font-medium leading-relaxed text-foreground">You do not have permission to access this page.</p>
            </div>

            <div className="flex justify-center mt-8">
              <Link to="/login">
                <Button className="px-8 py-3 rounded-lg transition-all duration-300 flex items-center gap-2 shadow-md hover:shadow-lg transform hover:-translate-y-1">
                  <Shield size={18} />
                  Go to Login
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <p className="text-muted-foreground text-sm text-center mt-8">©{new Date().getFullYear()} LunaShare. All rights reserved.</p>
      </div>
    </main>
  );
}
