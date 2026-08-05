export interface FieldChange {
  path: string;
  type: 'added' | 'modified' | 'removed';
  before?: unknown;
  after?: unknown;
  dataType?: string;
}

export interface AuditMetadata {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  endpoint?: string;
  sessionId?: string;
}

export interface AuditUser {
  id: string;
  name: string;
  email: string;
}

export interface AuditLog {
  id: string;
  model: string;
  action: string;
  recordId: string;
  userId: string | null;
  timestamp: Date;
  before: unknown;
  after: unknown;
  summary?: string | null;
  fieldChanges?: FieldChange[] | null;
  metadata?: AuditMetadata | null;
  user: AuditUser | null;
}

export interface ChangeSet {
  id: string;
  timestamp: Date;
  changes: FieldChange[];
}

export interface DiffResult {
  changes: FieldChange[];
  summary: string;
  hasChanges: boolean;
}
