import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { FolderOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FloatingUploadButton, type UploadHandle } from '@/components/dashboard/FloatingUploadButton';
import FolderSidebar from '@/components/dashboard/FolderSidebar';
import { FormSharesListDialog } from '@/components/form-share/FormSharesListDialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FoldersProvider } from '@/contexts/FoldersContext';
import { UploadRefContext } from '@/contexts/UploadRefContext';

export const Route = createFileRoute('/_dashboard')({
  beforeLoad: ({ context, location }) => {
    if (!context.session?.user?.id) {
      // The login page has always known how to return someone to where they
      // were; until #54 nothing ever told it where that was.
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const [isFormSharesListOpen, setIsFormSharesListOpen] = useState(false);
  const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);
  const [isFolderSheetOpen, setIsFolderSheetOpen] = useState(false);
  const uploadRef = useRef<UploadHandle | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => {
      if (mediaQuery.matches) setIsFolderSheetOpen(false);
    };

    closeOnDesktop();
    mediaQuery.addEventListener('change', closeOnDesktop);
    return () => mediaQuery.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <FoldersProvider>
      <UploadRefContext.Provider value={uploadRef}>
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr]">
          <aside className="sticky top-[4.625rem] hidden h-[calc(100dvh-4.625rem)] self-start md:block">
            <FolderSidebar
              onFormSharesListOpenChange={setIsFormSharesListOpen}
              onFormBuilderOpenChange={setIsFormBuilderOpen}
            />
          </aside>
          <div className="relative min-w-0 px-4 pt-4">
            <div className="mb-3 flex md:hidden">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setIsFolderSheetOpen(true)}
                aria-label="Open folders"
              >
                <FolderOpen className="h-4 w-4" />
                Folders
              </Button>
            </div>
            <Outlet />
          </div>
        </div>

        <Sheet
          open={isFolderSheetOpen}
          onOpenChange={setIsFolderSheetOpen}
        >
          <SheetContent
            side="left"
            className="w-[min(20rem,calc(100vw-1rem))] max-w-none bg-luna-bg p-0 md:hidden"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Folders</SheetTitle>
              <SheetDescription>Browse folders and form share actions.</SheetDescription>
            </SheetHeader>
            <FolderSidebar
              onFormSharesListOpenChange={setIsFormSharesListOpen}
              onFormBuilderOpenChange={setIsFormBuilderOpen}
              onNavigate={() => setIsFolderSheetOpen(false)}
              collapsible={false}
            />
          </SheetContent>
        </Sheet>

        <FloatingUploadButton
          isFormBuilderOpen={isFormBuilderOpen}
          onFormBuilderOpenChange={setIsFormBuilderOpen}
          uploadRef={uploadRef}
          showFloatingTrigger={false}
        />

        <FormSharesListDialog
          open={isFormSharesListOpen}
          onOpenChange={setIsFormSharesListOpen}
        />
      </UploadRefContext.Provider>
    </FoldersProvider>
  );
}
