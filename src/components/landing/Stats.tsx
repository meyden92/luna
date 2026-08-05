import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Globe } from 'lucide-react';
import { queryKeys } from '@/libs/query-keys';
import { getLandingStats } from '@/server/fns/stats';

export default function Stats() {
  const { data } = useQuery({
    queryKey: queryKeys.landing.stats,
    queryFn: () => getLandingStats(),
    staleTime: 60 * 60 * 1000,
  });
  const userCount = data?.userCount ?? 0;
  const fileCount = data?.fileCount ?? 0;

  return (
    <section className="mx-auto max-w-[1280px] px-9">
      <div className="mt-10 flex flex-wrap items-center justify-between gap-[18px] border-y border-luna-line py-[30px]">
        <div>
          <h3 className="m-0 font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.01em] text-luna-ink">Small Steps,</h3>
          <p className="mt-1 text-[13px] text-luna-ink-3">
            We're just getting started, but every user and every file shared helps us build something better. Here's where we are right now.
          </p>
          <p className="mt-2.5 font-mono text-[11px] tracking-[0.12em] text-luna-ink-4">
            {userCount.toLocaleString()} USERS · {fileCount.toLocaleString()} FILES SHARED
          </p>
        </div>
        <div className="flex gap-2.5">
          <a
            href="#showcase"
            className="inline-flex items-center gap-2 rounded-[10px] border border-luna-line bg-luna-bg px-[18px] py-2.5 text-[13.5px] font-medium text-luna-ink transition-colors hover:bg-luna-bg-2"
          >
            <Globe size={14} /> Learn more
          </a>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-[10px] bg-luna-ink px-[18px] py-2.5 text-[13.5px] font-medium text-luna-bg transition-all hover:-translate-y-px"
          >
            Start Creating Now <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
