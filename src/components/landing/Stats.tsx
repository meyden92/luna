import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Globe } from 'lucide-react';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { getLandingStats } from '@/server/fns/stats';
import styles from './Stats.module.css';

export default function Stats() {
  const { data } = useQuery({
    queryKey: queryKeys.landing.stats,
    queryFn: () => getLandingStats(),
    staleTime: 60 * 60 * 1000,
  });
  const userCount = data?.userCount ?? 0;
  const fileCount = data?.fileCount ?? 0;

  return (
    <section className={styles.root}>
      <div className={styles.band}>
        <div>
          <h3 className={styles.heading}>Small Steps,</h3>
          <p className={styles.blurb}>
            We're just getting started, but every user and every file shared helps us build something better. Here's where we are right now.
          </p>
          <p className={styles.figures}>
            {userCount.toLocaleString()} USERS · {fileCount.toLocaleString()} FILES SHARED
          </p>
        </div>
        <div className={styles.actions}>
          <a
            href="#showcase"
            className={cn(styles.pill, styles.pillGhost)}
          >
            <Globe size={14} /> Learn more
          </a>
          <Link
            to="/dashboard"
            className={cn(styles.pill, styles.pillSolid)}
          >
            Start Creating Now <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
