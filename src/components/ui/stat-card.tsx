import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  valueClassName?: string;
}

export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
  iconClassName = 'h-4 w-4 text-muted-foreground',
  valueClassName = 'text-2xl font-bold',
}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className={iconClassName} />}
      </CardHeader>
      <CardContent>
        <div className={valueClassName}>{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}
