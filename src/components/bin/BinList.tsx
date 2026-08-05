import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Calendar, Check, Code2, Copy, Edit2, ExternalLink, LayoutGrid, Link2, List, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBinEdit } from '@/hooks/use-bin-edit';
import { useBinView } from '@/hooks/use-bin-view';
import { useConfirmation } from '@/hooks/use-confirmation';
import { useClipboard } from '@/hooks/use-copy-to-clipboard';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { deleteBin } from '@/server/fns/bins';
import { EditBinModal } from './EditBinModal';
import { SnippetViewDialog } from './SnippetViewDialog';

type Bin = {
  id: string;
  title: string | null;
  content: string;
  language: string | null;
  isPublic: boolean;
  createdAt: Date;
};

function CopySnippetButton({ content }: { content: string }) {
  const { copy, copied, error } = useClipboard({ timeout: 1500 });

  useEffect(() => {
    if (copied) toast.success('Snippet copied', { richColors: true });
  }, [copied]);

  useEffect(() => {
    if (error) toast.error('Could not copy snippet', { richColors: true });
  }, [error]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 hover:bg-green-500/10"
            onClick={(e) => {
              e.stopPropagation();
              copy(content);
            }}
          />
        }
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied!' : 'Copy snippet'}</TooltipContent>
    </Tooltip>
  );
}

function BinList({ bins }: { bins: Bin[] }) {
  const queryClient = useQueryClient();
  const pendingDeleteIdsRef = useRef(new Set<string>());
  const { confirm, ConfirmationDialog } = useConfirmation<string>();
  const { onOpen: openEditModal } = useBinEdit();
  const { onOpen: openViewDialog } = useBinView();

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');

  const { mutate: execute } = useMutation({
    mutationFn: (id: string) => deleteBin({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.bins.mine });
      pendingDeleteIdsRef.current.add(id);
      const previousBins = queryClient.getQueryData<Bin[]>(queryKeys.bins.mine);
      const deletedBin = previousBins?.find((bin) => bin.id === id);
      queryClient.setQueryData<Bin[]>(queryKeys.bins.mine, (oldBins) => oldBins?.filter((bin) => bin.id !== id) ?? oldBins);
      return { deletedBin, previousBins };
    },
    onSuccess: () => {
      toast.success('Snippet deleted', { richColors: true });
    },
    onError: (error, id, context) => {
      pendingDeleteIdsRef.current.delete(id);
      if (context?.deletedBin) {
        const deletedBin = context.deletedBin;
        const previousOrder = new Map(context.previousBins?.map((bin, index) => [bin.id, index]));
        queryClient.setQueryData<Bin[]>(queryKeys.bins.mine, (currentBins = []) => {
          if (currentBins.some((bin) => bin.id === deletedBin.id)) return [...currentBins];
          return [...currentBins, deletedBin].sort(
            (left, right) =>
              (previousOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (previousOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
          );
        });
      }
      toast.error(error.message, { richColors: true });
    },
    onSettled: (_data, error, id) => {
      if (!error) {
        queryClient.setQueryData<Bin[]>(queryKeys.bins.mine, (currentBins) => currentBins?.filter((bin) => bin.id !== id) ?? currentBins);
      }
      pendingDeleteIdsRef.current.delete(id);
      queryClient.invalidateQueries({ queryKey: queryKeys.bins.mine, refetchType: 'none' });
    },
  });

  const visibleBins = useMemo(() => bins.filter((bin) => !pendingDeleteIdsRef.current.has(bin.id)), [bins]);

  const filteredBins = useMemo(() => {
    return visibleBins.filter((bin) => {
      const matchesSearch = !searchQuery || (bin.title?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesLanguage = languageFilter === 'all' || bin.language === languageFilter;
      return matchesSearch && matchesLanguage;
    });
  }, [visibleBins, searchQuery, languageFilter]);

  const availableLanguages = useMemo(() => {
    const languages = new Set(visibleBins.map((bin) => bin.language).filter(Boolean) as string[]);
    return Array.from(languages).sort();
  }, [visibleBins]);

  const handleDeleteBin = (binId: string) => {
    confirm({
      title: 'Delete snippet',
      description: "Are you sure you want to delete this snippet? This can't be undone.",
      data: binId,
      onConfirm: (snippetId) => {
        execute(snippetId);
      },
    });
  };

  const handleEditBin = (bin: Bin) => {
    openEditModal({
      id: bin.id,
      title: bin.title,
      content: bin.content,
      language: bin.language,
      isPublic: bin.isPublic,
    });
  };

  const handleViewBin = (bin: Bin) => {
    openViewDialog({
      id: bin.id,
      title: bin.title,
      content: bin.content,
      language: bin.language,
      isPublic: bin.isPublic,
      createdAt: bin.createdAt,
    });
  };

  const copyShareLink = async (bin: Bin) => {
    if (!bin.isPublic) {
      toast.error('Make this snippet public before sharing it.', { richColors: true });
      return;
    }

    await navigator.clipboard.writeText(`${window.location.origin}/bin/${bin.id}`);
    toast.success('Share link copied', { richColors: true });
  };

  const getLineCount = (content: string) => content.split('\n').length;

  if (bins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted/30 p-4 mb-4">
          <Code2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No snippets yet</h2>
        <p className="text-muted-foreground text-sm max-w-sm">Start by uploading your first code snippet using the form above</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search snippets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={languageFilter}
          onValueChange={(value) => setLanguageFilter(value ?? 'all')}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All languages</SelectItem>
            {availableLanguages.map((lang) => (
              <SelectItem
                key={lang}
                value={lang}
              >
                {lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant={viewMode === 'cards' ? 'default' : 'ghost'}
                  className="h-9 w-9 p-0"
                  onClick={() => setViewMode('cards')}
                />
              }
            >
              <LayoutGrid className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Card view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  className="h-9 w-9 p-0"
                  onClick={() => setViewMode('table')}
                />
              }
            >
              <List className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Table view</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Empty filter state */}
      {filteredBins.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No matching snippets</EmptyTitle>
            <EmptyDescription>Try adjusting your search or filter criteria</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Card view */}
      {filteredBins.length > 0 && viewMode === 'cards' && (
        <div className="space-y-3">
          {filteredBins.map((bin) => (
            <div
              key={bin.id}
              className="group relative rounded-lg border border-border/50 hover:border-border transition-all duration-200 overflow-hidden bg-card/30 hover:bg-card/60"
            >
              <div
                className="p-4 cursor-pointer"
                onClick={() => handleViewBin(bin)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="rounded-md bg-primary/10 p-2">
                      <Code2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium truncate group-hover:text-primary transition-colors">{bin.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{format(new Date(bin.createdAt), 'PP')}</span>
                        </div>
                        {bin.language && <Badge variant="outline">{bin.language}</Badge>}
                        <Badge variant={bin.isPublic ? 'default' : 'secondary'}>{bin.isPublic ? 'Public' : 'Private'}</Badge>
                        <span>{`${getLineCount(bin.content)} lines`}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopySnippetButton content={bin.content} />
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 hover:bg-primary/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/bin/${bin.id}`, '_blank', 'noopener');
                            }}
                          />
                        }
                      >
                        <ExternalLink className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>Open in new tab</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className={cn('h-8 w-8 p-0 hover:bg-primary/10', !bin.isPublic && 'opacity-50')}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyShareLink(bin);
                            }}
                            aria-disabled={!bin.isPublic}
                          />
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>{bin.isPublic ? 'Copy share link' : 'Make public to share'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 hover:bg-blue-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditBin(bin);
                            }}
                          />
                        }
                      >
                        <Edit2 className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>Edit snippet</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 hover:bg-red-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBin(bin.id);
                            }}
                          />
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>Delete snippet</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground truncate">{bin.content.slice(0, 100)}...</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table view */}
      {filteredBins.length > 0 && viewMode === 'table' && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBins.map((bin) => (
              <TableRow
                key={bin.id}
                className="cursor-pointer"
                onClick={() => handleViewBin(bin)}
              >
                <TableCell className="font-medium max-w-[200px] truncate">{bin.title}</TableCell>
                <TableCell>
                  {bin.language ? <Badge variant="outline">{bin.language}</Badge> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={bin.isPublic ? 'default' : 'secondary'}>{bin.isPublic ? 'Public' : 'Private'}</Badge>
                </TableCell>
                <TableCell>{getLineCount(bin.content)}</TableCell>
                <TableCell>{format(new Date(bin.createdAt), 'PP')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <CopySnippetButton content={bin.content} />
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/bin/${bin.id}`, '_blank', 'noopener');
                            }}
                          />
                        }
                      >
                        <ExternalLink className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>Open in new tab</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className={cn('h-8 w-8 p-0', !bin.isPublic && 'opacity-50')}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyShareLink(bin);
                            }}
                            aria-disabled={!bin.isPublic}
                          />
                        }
                      >
                        <Link2 className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>{bin.isPublic ? 'Copy share link' : 'Make public to share'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditBin(bin);
                            }}
                          />
                        }
                      >
                        <Edit2 className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>Edit snippet</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBin(bin.id);
                            }}
                          />
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>Delete snippet</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmationDialog />
      <EditBinModal />
      <SnippetViewDialog />
    </TooltipProvider>
  );
}

export default BinList;
