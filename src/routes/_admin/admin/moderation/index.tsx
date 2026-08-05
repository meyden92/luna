import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  addDenylistEntry,
  importDenylistEntries,
  listDenylistEntries,
  listModerationQueue,
  rescanModerationHashes,
  resolveModerationCase,
} from '@/server/fns/admin/moderation';

type HashType = 'sha256' | 'md5' | 'phash';
type BulkDenylistEntry = { hashType: HashType; hash: string; severity: string; notes?: string };

export const Route = createFileRoute('/_admin/admin/moderation/')({
  head: () => ({ meta: [{ title: 'Trust & Safety | LunaShare' }] }),
  component: ModerationPage,
});

function ModerationPage() {
  const queryClient = useQueryClient();
  const queueQuery = useQuery({ queryKey: ['admin', 'moderation', 'queue'], queryFn: () => listModerationQueue() });
  const denylistQuery = useQuery({ queryKey: ['admin', 'moderation', 'denylist'], queryFn: () => listDenylistEntries() });
  const [hashType, setHashType] = useState<HashType>('sha256');
  const [hash, setHash] = useState('');
  const [notes, setNotes] = useState('');
  const [bulkSource, setBulkSource] = useState('private-import');
  const [bulkHashes, setBulkHashes] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
  };

  const addEntry = async () => {
    try {
      await addDenylistEntry({ data: { hashType, hash, notes } });
      setHash('');
      setNotes('');
      invalidate();
      toast.success('Denylist entry added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add entry');
    }
  };

  const resolveCase = async (id: string, action: 'confirm' | 'release' | 'escalate') => {
    try {
      await resolveModerationCase({ data: { id, action } });
      invalidate();
      toast.success('Case updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update case');
    }
  };

  const importEntries = async () => {
    try {
      const entries = parseBulkHashes(bulkHashes, hashType);
      const result = await importDenylistEntries({ data: { source: bulkSource, entries } });
      setBulkHashes('');
      invalidate();
      toast.success(`Imported ${result.imported} denylist entr${result.imported === 1 ? 'y' : 'ies'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import entries');
    }
  };

  const rescanHashes = async () => {
    try {
      const result = await rescanModerationHashes();
      invalidate();
      toast.success(`Rescanned ${result.scanned} file(s), quarantined ${result.matched}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rescan files');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldAlert className="h-6 w-6" />
          Trust & Safety
        </h1>
        <p className="text-sm text-muted-foreground">Review quarantined uploads and manage cryptographic or perceptual hash denylists.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Moderation Queue</CardTitle>
          <CardDescription>Quarantined uploads stay private until released or confirmed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(queueQuery.data ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.file?.title ?? item.fileId}</div>
                    <div className="text-xs text-muted-foreground">{item.file?.contentType ?? 'Unknown type'}</div>
                  </TableCell>
                  <TableCell>
                    {item.matchType}
                    {typeof item.distance === 'number' ? ` · d=${item.distance}` : ''}
                  </TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>{new Date(item.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveCase(item.id, 'release')}
                    >
                      Release
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveCase(item.id, 'escalate')}
                    >
                      Escalate
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => resolveCase(item.id, 'confirm')}
                    >
                      Confirm
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {queueQuery.data?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No moderation cases.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Denylist Hash</CardTitle>
              <CardDescription>Use operator-supplied hashes for private blocklists.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={hashType}
                onValueChange={(value) => setHashType(value as typeof hashType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sha256">SHA-256</SelectItem>
                  <SelectItem value="md5">MD5</SelectItem>
                  <SelectItem value="phash">pHash</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={hash}
                onChange={(event) => setHash(event.target.value)}
                placeholder="Hash value"
              />
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes"
              />
              <Button
                onClick={addEntry}
                disabled={!hash}
              >
                Add entry
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bulk Import</CardTitle>
              <CardDescription>Paste one hash per line, or CSV rows as type,hash,notes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={bulkSource}
                onChange={(event) => setBulkSource(event.target.value)}
                placeholder="Source"
              />
              <Textarea
                value={bulkHashes}
                onChange={(event) => setBulkHashes(event.target.value)}
                placeholder="sha256,hash,notes&#10;md5,hash&#10;hash-only-uses-selected-type"
                className="min-h-36 font-mono text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={importEntries}
                  disabled={!bulkHashes.trim()}
                >
                  Import hashes
                </Button>
                <Button
                  variant="outline"
                  onClick={rescanHashes}
                >
                  Rescan files
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Denylist</CardTitle>
            <CardDescription>Latest operator-managed entries.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(denylistQuery.data ?? []).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.hashType}</TableCell>
                    <TableCell className="max-w-[420px] truncate font-mono text-xs">{entry.hash}</TableCell>
                    <TableCell>{entry.source}</TableCell>
                    <TableCell>{new Date(entry.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function parseBulkHashes(input: string, fallbackType: HashType): BulkDenylistEntry[] {
  const entries: BulkDenylistEntry[] = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((part) => part.trim());
      const maybeType = parts[0];
      if (maybeType === 'sha256' || maybeType === 'md5' || maybeType === 'phash') {
        return createBulkEntry(maybeType, parts[1] ?? '', parts.slice(2).join(', '));
      }
      return createBulkEntry(fallbackType, parts[0] ?? '', parts.slice(1).join(', '));
    })
    .filter((entry) => entry.hash.length >= 8);
  if (entries.length === 0) throw new Error('Paste at least one valid hash');
  return entries;
}

function createBulkEntry(hashType: HashType, hash: string, notes: string): BulkDenylistEntry {
  return { hashType, hash, notes: notes || undefined, severity: 'block' };
}
