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
import styles from './ChangesPanel.module.css';
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

/** Turn a field key or path segment into a human-readable label. */
function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className={styles.empty}>
      <FileText className={styles.emptyIcon} />
      <p className="type-sm">{message}</p>
    </div>
  );
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
      return <EmptyState message="No fields match your search" />;
    }

    return (
      <div className="stack space-3">
        {filteredFields.map(([key, value]) => {
          const isChanged = changedFieldPaths.has(key);
          const beforeValue = before?.[key];

          return (
            <div
              key={key}
              className={styles.fieldCard}
            >
              <div className={styles.fieldHead}>
                <span className={styles.fieldName}>{humanise(key)}</span>
                <code className={styles.fieldPath}>{key}</code>
                {isChanged && <span className={styles.modifiedTag}>Modified</span>}
              </div>

              {isChanged ? (
                /* Split view for changed fields */
                <div className={styles.split}>
                  <div className="stack space-1">
                    <div className={styles.sideLabel}>Before</div>
                    <div
                      className={styles.valueBox}
                      data-side="before"
                    >
                      <JsonDiff
                        before={beforeValue}
                        after={value}
                        side="before"
                      />
                    </div>
                  </div>
                  <div className="stack space-1">
                    <div className={styles.sideLabel}>After</div>
                    <div
                      className={styles.valueBox}
                      data-side="after"
                    >
                      <JsonDiff
                        before={beforeValue}
                        after={value}
                        side="after"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Single view for unchanged fields */
                <div className={styles.single}>
                  <div className={styles.singleLabel}>Current Value</div>
                  <div className={styles.singleBox}>
                    <JsonDiff
                      before={value}
                      after={value}
                      side="after"
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
    <Card className={cn(styles.root, className)}>
      <CardHeader className={styles.header}>
        <div className={styles.headerRow}>
          <CardTitle className={styles.title}>
            <GitCompare className={styles.titleIcon} />
            {isCreateOperation ? 'Initial Data' : 'Changes Panel'}
          </CardTitle>
          {hasChanges && (
            <span className={styles.count}>
              {changes.length} change{changes.length !== 1 ? 's' : ''}
            </span>
          )}
          {isCreateOperation && !hasChanges && <span className={styles.count}>Created</span>}
        </div>
      </CardHeader>

      <CardContent className={styles.content}>
        {showContent ? (
          <>
            <div className={styles.section}>
              <ChangesSummary
                changes={changes}
                summary={summary}
              />
            </div>

            {/* For update operations, show changed fields by default with toggle for all fields */}
            {isUpdateOperation ? (
              <>
                <div className={styles.section}>
                  <div className={styles.controlsRow}>
                    <div className={styles.searchWrap}>
                      <Search className={styles.searchIcon} />
                      <Input
                        placeholder={showAllFields ? 'Search fields...' : 'Search changes...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                      />
                    </div>
                    <div className={styles.toggle}>
                      <Label
                        htmlFor="show-all-fields"
                        className={styles.toggleLabel}
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
                <ScrollArea className={styles.scroll}>
                  {showAllFields ? (
                    renderAllDataWithHighlights()
                  ) : (
                    <div className="stack space-3">
                      {filteredChanges.length > 0 ? (
                        filteredChanges.map((change) => (
                          <FieldDiff
                            key={change.path}
                            change={change}
                          />
                        ))
                      ) : (
                        <EmptyState message={searchTerm ? 'No changes match your search' : 'No field changes detected'} />
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
                className={styles.tabs}
              >
                <div className={styles.tabsWrap}>
                  <TabsList className={styles.tabsList}>
                    <TabsTrigger value="changes">{isCreateOperation && !hasChanges ? 'Initial Values' : 'Field Changes'}</TabsTrigger>
                    <TabsTrigger value="raw">Raw Data</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent
                  value="changes"
                  className={styles.tabPanel}
                >
                  <div className={styles.section}>
                    <div className={styles.searchWrap}>
                      <Search className={styles.searchIcon} />
                      <Input
                        placeholder="Search changes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                      />
                    </div>
                  </div>

                  <ScrollArea className={styles.scroll}>
                    <div className="stack space-3">
                      {hasChanges ? (
                        filteredChanges.length > 0 ? (
                          filteredChanges.map((change) => (
                            <FieldDiff
                              key={change.path}
                              change={change}
                            />
                          ))
                        ) : (
                          <EmptyState message="No changes match your search" />
                        )
                      ) : isCreateOperation && after ? (
                        <div className="stack space-3">
                          {Object.entries(after).map(([key, value]) => (
                            <div
                              key={key}
                              className={styles.fieldCard}
                            >
                              <div className={styles.fieldHead}>
                                <span className={styles.fieldName}>{humanise(key)}</span>
                                <code className={styles.fieldPath}>{key}</code>
                              </div>
                              {/* Split view for create operations too */}
                              <div className={styles.split}>
                                <div className="stack space-1">
                                  <div className={styles.sideLabel}>Original</div>
                                  <div
                                    className={styles.valueBox}
                                    data-side="absent"
                                  >
                                    <span className={styles.absentValue}>(no previous value)</span>
                                  </div>
                                </div>
                                <div className="stack space-1">
                                  <div className={styles.sideLabel}>Created</div>
                                  <div
                                    className={styles.valueBox}
                                    data-side="after"
                                  >
                                    <JsonDiff
                                      before={undefined}
                                      after={value}
                                      side="after"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="No data to display" />
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent
                  value="raw"
                  className={styles.tabPanel}
                >
                  <ScrollArea className={styles.scroll}>
                    <div className="stack space-4">
                      {before && (
                        <div>
                          <h4 className={styles.rawHeading}>Before</h4>
                          <pre className={styles.pre}>
                            <code>{JSON.stringify(before, null, 2)}</code>
                          </pre>
                        </div>
                      )}
                      {after && (
                        <div>
                          <h4 className={styles.rawHeading}>After</h4>
                          <pre className={styles.pre}>
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
          <div className={styles.placeholder}>
            <div>
              <FileText className={styles.placeholderIcon} />
              <p className={styles.placeholderText}>No changes to display</p>
              <p className={styles.placeholderHint}>Field changes will appear here when available</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
