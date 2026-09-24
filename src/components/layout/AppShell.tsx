import type React from 'react';
import Navigation from '@/components/landing/Navigation';
import { AppNav } from '@/components/layout/AppNav';
import { MainContent } from '@/components/layout/MainContent';
import { UploadSheetProvider } from '@/components/uploader/UploadSheetProvider';
import { FoldersProvider } from '@/contexts/FoldersContext';

/**
 * Picks the chrome for the page: the marketing nav for a visitor, the app nav
 * for the owner.
 *
 * The two are separate components because they are separate designs — the
 * marketing bar keeps the serif and the sign-in call to action, while the app
 * bar is 56px of quiet utility carrying Upload. The signed-in branch also mounts
 * the upload controller, which has to sit above the nav so the Upload button,
 * a window-wide drop and a ⌘V paste all reach the same queue — and the folder
 * list with it, since the upload sheet needs it on any page, not just Files.
 */
function AppShell({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  if (!signedIn) {
    return (
      <>
        <Navigation />
        <MainContent>{children}</MainContent>
      </>
    );
  }

  return (
    <FoldersProvider>
      <UploadSheetProvider>
        <AppNav />
        <MainContent>{children}</MainContent>
      </UploadSheetProvider>
    </FoldersProvider>
  );
}

export { AppShell };
