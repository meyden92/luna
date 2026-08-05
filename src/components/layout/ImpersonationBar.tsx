import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useImpersonation } from '@/hooks/use-impersonation';

export function ImpersonationBar() {
  const { isImpersonating, impersonatedUser, stopImpersonation, isLoading } = useImpersonation();

  if (isLoading || !isImpersonating) {
    return null;
  }

  const handleStopImpersonation = async () => {
    try {
      await stopImpersonation();
      toast.success('Impersonation stopped successfully');
    } catch (_error) {
      toast.error('Failed to stop impersonation');
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-2 h-12">
      <div className="flex items-center justify-between max-w-7xl mx-auto h-full">
        <div className="flex items-center gap-2">
          <span className="font-medium">Impersonating user: {impersonatedUser}</span>
        </div>
        <Button
          onClick={handleStopImpersonation}
          variant="ghost"
          size="sm"
          className="text-white hover:bg-red-700 hover:text-white hover:cursor-pointer"
        >
          <X className="h-4 w-4 mr-1" />
          Stop Impersonating
        </Button>
      </div>
    </div>
  );
}
