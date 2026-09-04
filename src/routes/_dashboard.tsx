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
import styles from './_dashboard.module.css';

export const Route = createFileRoute('/_dashboard')({
  beforeLoad: ({ context, location }) => {
    if (!context.session?.user?.id) {
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
        <div className={styles.root}>
          <aside className={styles.rail}>
            <FolderSidebar
              onFormSharesListOpenChange={setIsFormSharesListOpen}
              onFormBuilderOpenChange={setIsFormBuilderOpen}
            />
          </aside>
          <div className={styles.body}>
            <div className="cluster margin-bottom-3 hide-from-md">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setIsFolderSheetOpen(true)}
                aria-label="Open folders"
              >
                <FolderOpen />
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
            className={styles.sheet}
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
