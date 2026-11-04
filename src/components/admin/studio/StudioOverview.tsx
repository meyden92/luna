import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDistanceStrict } from 'date-fns';
import { Activity, BarChart3, CalendarRange, CircleDollarSign, Wallet } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import StatCard from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatUsd } from '@/libs/studio/format';
import type { getStudioOverview } from '@/server/fns/admin/studio-budgets';
import { studioOverviewQueryOptions } from './queries';
import styles from './StudioOverview.module.css';

type Overview = Awaited<ReturnType<typeof getStudioOverview>>;
type Period = 'month' | 'sixMonths';

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'sixMonths', label: 'Last 6 months' },
] as const;

/** What the Studio costs and how it runs: spend, Budgets, failures and running Generations. Never a successful prompt. */
export function StudioOverview() {
  const { data } = useSuspenseQuery(studioOverviewQueryOptions);
  const [period, setPeriod] = useState<Period>('month');
  const spend = data.spend[period];

  return (
    <div className="stack space-6">
      <div>
        <h1 className="cluster space-2 type-2xl weight-bold">
          <BarChart3 className={styles.titleIcon} />
          Studio overview
        </h1>
        <p className={styles.muted}>Months are UTC calendar months. Costs are what fal billed, or the estimate until it has.</p>
      </div>

      <div className={styles.stats}>
        <StatCard
          title="Spend this month"
          value={formatUsd(data.spend.month.totalUsd)}
          icon={CircleDollarSign}
        />
        <StatCard
          title="Spend, last 6 months"
          value={formatUsd(data.spend.sixMonths.totalUsd)}
          description="This month and the five before it"
          icon={CalendarRange}
        />
        <StatCard
          title="Running"
          value={data.running.length}
          description="Waiting or running Generations"
          icon={Activity}
        />
        {data.balance && (
          <StatCard
            title="fal balance"
            value={'error' in data.balance ? 'Unknown' : formatUsd(data.balance.usd)}
            description={'error' in data.balance ? data.balance.error : 'Credits left on the fal account'}
            icon={Wallet}
          />
        )}
      </div>

      <Card>
        <CardHeader className={styles.cardHeader}>
          <div>
            <CardTitle>Spend</CardTitle>
            <CardDescription>Per User and per Model; Template runs count for their Model.</CardDescription>
          </div>
          <Segmented
            label="Period"
            items={PERIODS}
            value={period}
            onValueChange={setPeriod}
          />
        </CardHeader>
        <CardContent className={styles.columns}>
          <SpendTable
            label="Spend per User"
            heading="User"
            rows={spend.byUser.map((row) => ({ key: row.userId, name: <UserLink {...row} />, ...row }))}
          />
          <SpendTable
            label="Spend per Model"
            heading="Model"
            rows={spend.byModel.map((row) => ({ key: `${row.modelId}:${row.endpointId}`, name: row.modelName, ...row }))}
          />
        </CardContent>
      </Card>

      <MonthTable rows={data.spend.byMonth} />
      <BudgetTable data={data} />
      <FailureRates rows={data.failureRates} />
      <RunningTable rows={data.running} />
      <FailedList rows={data.failed} />
    </div>
  );
}

function UserLink({ userId, userName }: { userId: string; userName: string }) {
  return (
    <Link
      to="/admin/users/$userid"
      params={{ userid: userId }}
      className={styles.link}
    >
      {userName}
    </Link>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={styles.empty}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

function SpendTable({
  label,
  heading,
  rows,
}: {
  label: string;
  heading: string;
  rows: { key: string; name: ReactNode; generations: number; spentUsd: number }[];
}) {
  return (
    <Table aria-label={label}>
      <TableHeader>
        <TableRow>
          <TableHead>{heading}</TableHead>
          <TableHead className={styles.alignEnd}>Generations</TableHead>
          <TableHead className={styles.alignEnd}>Spend</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>{row.name}</TableCell>
            <TableCell className={styles.alignEnd}>{row.generations}</TableCell>
            <TableCell className={styles.alignEnd}>{formatUsd(row.spentUsd)}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && <EmptyRow colSpan={3}>Nothing spent.</EmptyRow>}
      </TableBody>
    </Table>
  );
}

function MonthTable({ rows }: { rows: Overview['spend']['byMonth'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spend per month</CardTitle>
        <CardDescription>This month and the five before it.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table aria-label="Spend per month">
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className={styles.alignEnd}>Generations</TableHead>
              <TableHead className={styles.alignEnd}>Spend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.monthStart}>
                <TableCell>
                  {new Date(row.monthStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                </TableCell>
                <TableCell className={styles.alignEnd}>{row.generations}</TableCell>
                <TableCell className={styles.alignEnd}>{formatUsd(row.spentUsd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** A 0 $ Budget is used up from the start. */
function usedPercent(spentUsd: number, limitUsd: number): number {
  return limitUsd === 0 ? 100 : Math.round((spentUsd / limitUsd) * 100);
}

function BudgetTable({ data }: { data: Overview }) {
  const defaultLabel = data.defaultMonthlyBudgetUsd === null ? 'unlimited' : formatUsd(data.defaultMonthlyBudgetUsd);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budgets this month</CardTitle>
        <CardDescription>Users who spent this month or have their own Budget. The default Budget is {defaultLabel}.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table aria-label="Budget usage per User">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className={styles.alignEnd}>Spent</TableHead>
              <TableHead className={styles.alignEnd}>Budget</TableHead>
              <TableHead className={styles.alignEnd}>Used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.budgets.map((row) => (
              <TableRow key={row.userId}>
                <TableCell>
                  <UserLink {...row} />
                </TableCell>
                <TableCell className={styles.alignEnd}>{formatUsd(row.spentUsd)}</TableCell>
                <TableCell className={styles.alignEnd}>
                  {row.limitUsd === null ? 'Unlimited' : formatUsd(row.limitUsd)}
                  {row.own && (
                    <Badge
                      variant="secondary"
                      className={styles.badge}
                    >
                      own
                    </Badge>
                  )}
                </TableCell>
                <TableCell className={styles.alignEnd}>
                  {row.limitUsd === null ? '—' : `${usedPercent(row.spentUsd, row.limitUsd)}%`}
                </TableCell>
              </TableRow>
            ))}
            {data.budgets.length === 0 && <EmptyRow colSpan={4}>No one has spent anything this month.</EmptyRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FailureRates({ rows }: { rows: Overview['failureRates'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Failure rates</CardTitle>
        <CardDescription>Finished Generations of the last 30 days, per Model.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table aria-label="Failure rate per Model">
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className={styles.alignEnd}>Finished</TableHead>
              <TableHead className={styles.alignEnd}>Failed</TableHead>
              <TableHead className={styles.alignEnd}>Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.modelId}:${row.endpointId}`}>
                <TableCell>{row.modelName}</TableCell>
                <TableCell className={styles.alignEnd}>{row.finished}</TableCell>
                <TableCell className={styles.alignEnd}>{row.failed}</TableCell>
                <TableCell className={styles.alignEnd}>{Math.round((row.failed / row.finished) * 100)}%</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={4}>No Generations finished in the last 30 days.</EmptyRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RunningTable({ rows }: { rows: Overview['running'] }) {
  const now = new Date();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Running</CardTitle>
        <CardDescription>Generations waiting on fal or running there now.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table aria-label="Running Generations">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className={styles.alignEnd}>Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <UserLink {...row} />
                </TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  <Badge variant={row.status === 'running' ? 'default' : 'secondary'}>
                    {row.status === 'running' ? 'Running' : 'Queued'}
                  </Badge>
                </TableCell>
                <TableCell className={styles.alignEnd}>{formatDistanceStrict(new Date(row.createdAt), now)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={4}>Nothing is running.</EmptyRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FailedList({ rows }: { rows: Overview['failed'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Failed Generations</CardTitle>
        <CardDescription>The newest of the last 30 days, with what was entered and what fal answered.</CardDescription>
      </CardHeader>
      <CardContent className="stack space-3">
        {rows.map((row) => (
          <article
            key={row.id}
            aria-label={`Failed ${row.name}`}
            className={styles.failure}
          >
            <div className={styles.failureHead}>
              <span className="weight-medium">{row.name}</span>
              <span className={styles.muted}>
                <UserLink {...row} /> · {new Date(row.createdAt).toLocaleString()}
              </span>
            </div>
            <p className={styles.error}>
              {row.error?.message ?? 'No error was recorded.'}
              {row.error?.type && <code className={styles.errorType}>{row.error.type}</code>}
            </p>
            <details>
              <summary>Input</summary>
              <div className={styles.inputs}>
                <div>
                  <p className={styles.muted}>Entered</p>
                  <pre className={styles.pre}>{JSON.stringify(row.formValues, null, 2)}</pre>
                </div>
                <div>
                  <p className={styles.muted}>Sent to fal</p>
                  <pre className={styles.pre}>{row.requestInput ? JSON.stringify(row.requestInput, null, 2) : 'Not sent'}</pre>
                </div>
              </div>
              {row.error?.detail !== undefined && (
                <>
                  <p className={styles.muted}>fal&apos;s answer</p>
                  <pre className={styles.pre}>{JSON.stringify(row.error.detail, null, 2)}</pre>
                </>
              )}
            </details>
          </article>
        ))}
        {rows.length === 0 && <p className={styles.empty}>No Generation failed in the last 30 days.</p>}
      </CardContent>
    </Card>
  );
}
