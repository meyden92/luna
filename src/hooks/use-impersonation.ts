import { authClient } from '@/libs/auth/auth-client';

export function useImpersonation() {
  const { data: session, isPending } = authClient.useSession();

  const isImpersonating = !isPending && !!session?.session?.impersonatedBy;

  const stopImpersonation = async () => {
    try {
      await authClient.admin.stopImpersonating();
      // Redirect back to the page where impersonation was started
      const returnUrl = sessionStorage.getItem('impersonationReturnUrl');
      if (returnUrl) {
        sessionStorage.removeItem('impersonationReturnUrl');
        window.location.href = returnUrl;
      } else {
        // Fallback to reload if no return URL stored
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to stop impersonation:', error);
      throw error;
    }
  };

  return {
    isImpersonating,
    impersonatedUser: isImpersonating ? session?.user?.name || session?.user?.email || 'Unknown User' : null,
    originalAdminId: (isImpersonating && session?.session?.impersonatedBy) || null,
    stopImpersonation,
    isLoading: isPending,
  };
}
