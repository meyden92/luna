import { useNavigate, useRouter } from '@tanstack/react-router';
import { Loader2, Mail, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { user } from '@/db/schema/auth';
import { authClient } from '@/libs/auth/auth-client';
import styles from './user-header.module.css';

type User = typeof user.$inferSelect;
interface UserHeaderProps {
  user: User;
}

export default function UserHeader({ user }: UserHeaderProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const [isImpersonating, setIsImpersonating] = useState(false);
  const { data: session } = authClient.useSession();

  const canImpersonate = session?.user?.id !== user.id && user.role !== 'admin';

  const handleImpersonate = async () => {
    try {
      setIsImpersonating(true);
      sessionStorage.setItem('impersonationReturnUrl', window.location.href);

      const result = await authClient.admin.impersonateUser({
        userId: user.id,
      });

      if (result.error) {
        sessionStorage.removeItem('impersonationReturnUrl');
        toast.error(result.error.message || 'Failed to impersonate user');
        return;
      }

      toast.success('Impersonation started');
      navigate({ to: '/dashboard' });
      router.invalidate();
    } catch (_error) {
      sessionStorage.removeItem('impersonationReturnUrl');
      toast.error('Failed to impersonate user');
    } finally {
      setIsImpersonating(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.identity}>
        <Avatar className={styles.avatar}>
          <AvatarFallback className={styles.avatarFallback}>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className={styles.name}>{user.name}</h1>
          <div className={styles.email}>
            <Mail className={styles.emailIcon} />
            <span>{user.email}</span>
          </div>
        </div>
      </div>

      {canImpersonate ? (
        <Button
          size="sm"
          onClick={handleImpersonate}
          disabled={isImpersonating}
        >
          {isImpersonating ? <Loader2 className={styles.spinner} /> : <UserCheck />}
          Impersonate User
        </Button>
      ) : null}
    </div>
  );
}
