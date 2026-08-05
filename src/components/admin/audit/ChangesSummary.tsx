import { Edit, FileText, Minus, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { FieldChange } from '@/types/audit';

interface ChangesSummaryProps {
  changes: FieldChange[];
  summary?: string;
}

export function ChangesSummary({ changes, summary }: ChangesSummaryProps) {
  const stats = {
    added: changes.filter((c) => c.type === 'added').length,
    modified: changes.filter((c) => c.type === 'modified').length,
    removed: changes.filter((c) => c.type === 'removed').length,
  };

  const total = stats.added + stats.modified + stats.removed;

  if (total === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span className="text-sm">No field changes detected</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="space-y-3">
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}

        <div className="flex items-center gap-4">
          {stats.added > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10">
                <Plus className="h-3 w-3 text-emerald-600" />
              </div>
              <span className="text-sm">
                <span className="font-medium text-emerald-600">{stats.added}</span>
                <span className="text-muted-foreground ml-1">added</span>
              </span>
            </div>
          )}

          {stats.modified > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/10">
                <Edit className="h-3 w-3 text-amber-600" />
              </div>
              <span className="text-sm">
                <span className="font-medium text-amber-600">{stats.modified}</span>
                <span className="text-muted-foreground ml-1">modified</span>
              </span>
            </div>
          )}

          {stats.removed > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500/10">
                <Minus className="h-3 w-3 text-red-600" />
              </div>
              <span className="text-sm">
                <span className="font-medium text-red-600">{stats.removed}</span>
                <span className="text-muted-foreground ml-1">removed</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
