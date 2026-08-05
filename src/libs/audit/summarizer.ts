import type { FieldChange } from '@/types/audit';

export class Summarizer {
  private static readonly FIELD_LABELS: Record<string, string> = {
    name: 'name',
    email: 'email address',
    role: 'role',
    banned: 'ban status',
    banReason: 'ban reason',
    banExpires: 'ban expiration',
    bio: 'bio',
    description: 'description',
    isProfilePublic: 'profile visibility',
    receiveEmail: 'email notifications',
    emailVerified: 'email verification',
    active: 'account status',
    title: 'title',
    content: 'content',
    tags: 'tags',
    private: 'privacy setting',
    isPublic: 'visibility',
    language: 'language',
    url: 'URL',
    size: 'file size',
    contentType: 'content type',
  };

  static generateActionSummary(model: string, action: string, changes: FieldChange[], recordId: string): string {
    const modelName = model.toLowerCase();

    switch (action) {
      case 'create':
        return `Created new ${modelName} (${Summarizer.truncateId(recordId)})`;

      case 'delete':
        return `Deleted ${modelName} (${Summarizer.truncateId(recordId)})`;

      case 'update':
        return Summarizer.generateUpdateSummary(modelName, changes, recordId);

      default:
        return `Performed ${action} on ${modelName} (${Summarizer.truncateId(recordId)})`;
    }
  }

  private static generateUpdateSummary(modelName: string, changes: FieldChange[], recordId: string): string {
    if (changes.length === 0) {
      return `Updated ${modelName} (${Summarizer.truncateId(recordId)}) with no field changes`;
    }

    if (changes.length === 1) {
      const change = changes[0];
      if (!change) return `Updated ${modelName} (${Summarizer.truncateId(recordId)})`;
      const fieldName = Summarizer.getFieldLabel(change.path);
      return `Updated ${fieldName} for ${modelName} (${Summarizer.truncateId(recordId)})`;
    }

    if (changes.length <= 3) {
      const fieldNames = changes.map((c) => Summarizer.getFieldLabel(c.path)).join(', ');
      return `Updated ${fieldNames} for ${modelName} (${Summarizer.truncateId(recordId)})`;
    }

    return `Updated ${changes.length} fields for ${modelName} (${Summarizer.truncateId(recordId)})`;
  }

  private static getFieldLabel(path: string): string {
    // Extract the field name from the path (e.g., "user.email" -> "email")
    const fieldName = path.split('.').pop() || path;

    // Remove array indices (e.g., "tags[0]" -> "tags")
    const cleanFieldName = fieldName.replace(/\[\d+\]/g, '');

    return Summarizer.FIELD_LABELS[cleanFieldName] || cleanFieldName;
  }

  private static truncateId(id: string): string {
    if (id.length <= 8) return id;
    return `${id.substring(0, 8)}...`;
  }

  static generateChangeDescription(change: FieldChange): string {
    const fieldName = Summarizer.getFieldLabel(change.path);

    switch (change.type) {
      case 'added':
        return `Added ${fieldName}: ${Summarizer.formatValue(change.after)}`;

      case 'removed':
        return `Removed ${fieldName} (was ${Summarizer.formatValue(change.before)})`;

      case 'modified':
        return `Changed ${fieldName} from ${Summarizer.formatValue(change.before)} to ${Summarizer.formatValue(change.after)}`;

      default:
        return `Modified ${fieldName}`;
    }
  }

  private static formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') {
      if (value.length > 50) {
        return `"${value.substring(0, 47)}..."`;
      }
      return `"${value}"`;
    }
    if (typeof value === 'number') return value.toString();
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      return `{${keys.length} fields}`;
    }
    return String(value);
  }
}
