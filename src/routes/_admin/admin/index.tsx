import { createFileRoute } from '@tanstack/react-router';
import { adminDestinations } from '@/components/admin/admin-destinations';
import { ClientIpCard } from '@/components/admin/client-ip/client-ip-card';
import { DestinationTiles } from '@/components/admin/destination-tiles';
import { VersionCard } from '@/components/admin/version/version-card';
import styles from './index.module.css';

export const Route = createFileRoute('/_admin/admin/')({
  head: () => ({ meta: [{ title: 'Admin | LunaShare' }] }),
  component: AdminIndexPage,
});

function AdminIndexPage() {
  return (
    <div>
      <h1 className={styles.title}>Admin</h1>
      <DestinationTiles destinations={adminDestinations} />
      <VersionCard />
      <ClientIpCard />
    </div>
  );
}
