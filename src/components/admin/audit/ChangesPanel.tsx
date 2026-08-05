import { FileText, GitCompare, Search } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/libs/utils';
import type { FieldChange } from '@/types/audit';
import { ChangesSummary } from './ChangesSummary';
import { FieldDiff } from './FieldDiff';
import { JsonDiff } from './JsonDiff';

interface ChangesPanelProps {
  changes?: FieldChange[];
  summary?: string;
  before?: any;
  after?: any;
  action?: string;
  className?: string;
}

export function ChangesPanel({ changes = [], summary, before, after, action, className }: ChangesPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('changes');
  const [showAllFields, setShowAllFields] = useState(false);

  const filteredChanges = changes.filter(
    (change) =>
      change.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(change.before)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(change.after)?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const hasChanges = changes.length > 0;
  const isCreateOperation = action === 'create' && after && !before;
  const isUpdateOperation = action === 'update' && after && before;
  const showContent = hasChanges || isCreateOperation;

  // Get changed top-level fields for highlighting; nested paths use dot/bracket notation.
  const changedFieldPaths = new Set(changes.map((change) => change.path.split(/[.[]/, 1)[0]));

  // Render all data for update operations with highlights
  const renderAllDataWithHighlights = () => {
    if (!isUpdateOperation || !after) return null;

    // Filter fields based on search term
    const filteredFields = Object.entries(after).filter(([key, value]) => {
      if (!searchTerm) return true;
      return (
        key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        JSON.stringify(value).toLowerCase().includes(searchTerm.toLowerCase()) ||
        JSON.stringify(before?.[key]).toLowerCase().includes(searchTerm.toLowerCase())
      );
    });

    if (filteredFields.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No fields match your search</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {filteredFields.map(([key, value]) => {
          const isChanged = changedFieldPaths.has(key);
          const beforeValue = before?.[key];

          return (
            <div
              key={key}
              className="rounded-lg border bg-card border-border p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="font-medium text-sm">
                  {key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, (str) => str.toUpperCase())
                    .trim()}
                </span>
                <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{key}</code>
                {isChanged && (
                  <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded">
                    Modified
                  </span>
                )}
              </div>

              {isChanged ? (
                /* Split view for changed fields */
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Before</div>
                    <div className="p-2 rounded border border-red-500/20 min-h-[2.5rem] flex items-start">
                      <JsonDiff
                        before={beforeValue}
                        after={value}
                        side="before"
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">After</div>
                    <div className="p-2 rounded border border-emerald-500/20 min-h-[2.5rem] flex items-start">
                      <JsonDiff
                        before={beforeValue}
                        after={value}
                        side="after"
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Single view for unchanged fields */
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground mb-1">Current Value</div>
                  <div className="bg-muted p-2 rounded border border-border">
                    <JsonDiff
                      before={value}
                      after={value}
                      side="after"
                      className="w-full text-muted-foreground"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            {isCreateOperation ? 'Initial Data' : 'Changes Panel'}
          </CardTitle>
          {hasChanges && (
            <span className="text-sm text-muted-foreground">
              {changes.length} change{changes.length !== 1 ? 's' : ''}
            </span>
          )}
          {isCreateOperation && !hasChanges && <span className="text-sm text-muted-foreground">Created</span>}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {showContent ? (
          <>
            <div className="px-6 pb-3 flex-shrink-0">
              <ChangesSummary
                changes={changes}
                summary={summary}
              />
            </div>

            {/* For update operations, show changed fields by default with toggle for all fields */}
            {isUpdateOperation ? (
              <>
                <div className="px-6 pb-3 flex-shrink-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={showAllFields ? 'Search fields...' : 'Search changes...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <Label
                        htmlFor="show-all-fields"
                        className="text-sm text-muted-foreground whitespace-nowrap"
                      >
                        Show all fields
                      </Label>
                      <Switch
                        id="show-all-fields"
                        checked={showAllFields}
                        onCheckedChange={setShowAllFields}
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
                <ScrollArea className="flex-1 px-6 pb-6 min-h-0">
                  {showAllFields ? (
                    renderAllDataWithHighlights()
                  ) : (
                    <div className="space-y-3">
                      {filteredChanges.length > 0 ? (
                        filteredChanges.map((change) => (
                          <FieldDiff
                            key={change.path}
                            change={change}
                          />
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">{searchTerm ? 'No changes match your search' : 'No field changes detected'}</p>
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </>
            ) : (
              /* For create operations and others, keep the existing tab interface */
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex-1 flex flex-col"
              >
                <div className="px-6">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="changes">{isCreateOperation && !hasChanges ? 'Initial Values' : 'Field Changes'}</TabsTrigger>
                    <TabsTrigger value="raw">Raw Data</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent
                  value="changes"
                  className="flex-1 mt-0 flex flex-col min-h-0"
                >
                  <div className="px-6 pb-3 flex-shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search changes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <ScrollArea className="flex-1 px-6 pb-6 min-h-0">
                    <div className="space-y-3">
                      {hasChanges ? (
                        filteredChanges.length > 0 ? (
                          filteredChanges.map((change) => (
                            <FieldDiff
                              key={change.path}
                              change={change}
                            />
                          ))
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No changes match your search</p>
                          </div>
                        )
                      ) : isCreateOperation && after ? (
                        <div className="space-y-3">
                          {Object.entries(after).map(([key, value]) => (
                            <div
                              key={key}
                              className="rounded-lg border bg-card p-4"
                            >
                              <div className="flex items-center gap-2 mb-3">
                                <span className="font-medium text-sm">
                                  {key
                                    .replace(/([A-Z])/g, ' $1')
                                    .replace(/^./, (str) => str.toUpperCase())
                                    .trim()}
                                </span>
                                <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{key}</code>
                              </div>
                              {/* Split view for create operations too */}
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground">Original</div>
                                  <div className="bg-muted/50 text-muted-foreground border-border p-2 rounded border italic min-h-[2.5rem] flex items-center">
                                    <span className="font-mono text-sm">(no previous value)</span>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground">Created</div>
                                  <div className="p-2 rounded border border-emerald-500/20 min-h-[2.5rem] flex items-start">
                                    <JsonDiff
                                      before={undefined}
                                      after={value}
                                      side="after"
                                      className="w-full"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No data to display</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent
                  value="raw"
                  className="flex-1 mt-0 min-h-0"
                >
                  <ScrollArea className="flex-1 px-6 pb-6 min-h-0">
                    <div className="space-y-4">
                      {before && (
                        <div>
                          <h4 className="text-sm font-medium mb-2 text-muted-foreground">Before</h4>
                          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                            <code>{JSON.stringify(before, null, 2)}</code>
                          </pre>
                        </div>
                      )}
                      {after && (
                        <div>
                          <h4 className="text-sm font-medium mb-2 text-muted-foreground">After</h4>
                          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                            <code>{JSON.stringify(after, null, 2)}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">No changes to display</p>
              <p className="text-xs text-muted-foreground mt-1">Field changes will appear here when available</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
