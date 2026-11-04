import type { JsonValue } from '@/db/schema/json';

/**
 * Shapes the Studio stores in jsonb columns and passes between the request
 * builder, the pipeline and the UI. Pure types, safe for the client bundle.
 */

export type MediaKind = 'image' | 'video' | 'audio' | 'model3d';
export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'video', 'audio', 'model3d'];

/** `shown`: the User fills it in. `fixed`: always `value`. `default`: omitted, so fal's default applies. */
export type FieldMode = 'shown' | 'fixed' | 'default';

/** Shows a Field or Variable only while another one's value is in `in`. */
export interface VisibleIf {
  field: string;
  in: JsonValue[];
}

/** How a Model or Template presents and constrains one input schema property. */
export interface FieldConfig {
  /** The schema property name. */
  name: string;
  mode: FieldMode;
  label?: string;
  help?: string;
  /** The default when shown, the value when fixed. */
  value?: JsonValue;
  min?: number;
  max?: number;
  step?: number;
  /** A subset and relabelling of the schema enum. */
  options?: { value: string; label: string }[];
  display?: 'slider' | 'number' | 'chips' | 'select' | 'text' | 'textarea' | 'switch' | 'file';
  /** Set on file inputs only. */
  accept?: MediaKind[];
  group?: string;
  order: number;
  visibleIf?: VisibleIf;
}

/** A Template Variable's card. */
export interface VariableConfig {
  name: string;
  kind: 'text' | 'choice' | 'multi' | 'number' | 'switch' | 'file';
  label?: string;
  help?: string;
  required: boolean;
  default?: JsonValue;
  group?: string;
  order: number;
  visibleIf?: VisibleIf;
  text?: { multiline: boolean; placeholder?: string; maxLength?: number };
  options?: { label: string; value: string }[];
  number?: { min: number; max: number; step: number; display: 'slider' | 'number' };
  switch?: { on: string; off: string };
  file?: { field: string; position?: number; accept: MediaKind[] };
}

/** A resolved JSON schema: `$ref`s inlined, as stored in a Model's snapshot. */
export interface JsonSchema {
  type?: string | string[];
  enum?: JsonValue[];
  const?: JsonValue;
  format?: string;
  default?: JsonValue;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  title?: string;
  description?: string;
  [key: string]: JsonValue | JsonSchema | JsonSchema[] | Record<string, JsonSchema> | undefined;
}

/** A Model's `schema_snapshot`: fal's input and output schemas at the time it was added. */
export interface SchemaSnapshot {
  input: JsonSchema;
  output: JsonSchema;
}

/** A Model's `pricing`: fal's unit price and how many units one request uses. */
export interface StudioPricing {
  unit: string;
  unitPrice: number;
  currency: string;
  quantity: { kind: 'fixed'; value: number } | { kind: 'field'; field: string; factor?: number };
}

/**
 * The value of a file input in `form_values`.
 *
 * `upload` names a part of the submit's FormData. `file` and `output` are the
 * User's own Files and Outputs. `url` is a file already on fal storage: the
 * pipeline stores uploads this way, so *Again* and *Retry* can resend them
 * until fal deletes them at `expiresAt` (ISO). Clients never send `url`.
 */
export type FileRef =
  | { source: 'upload'; key: string }
  | { source: 'file'; fileId: string }
  | { source: 'output'; outputId: string }
  | { source: 'url'; url: string; expiresAt: string };

export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export const ACTIVE_GENERATION_STATUSES: readonly GenerationStatus[] = ['queued', 'running'];
/** A Generation in one of these has an outcome; a `cancelled` one may still have fal finishing it (see `completed_at`). */
export const FINISHED_GENERATION_STATUSES: readonly GenerationStatus[] = ['succeeded', 'failed', 'cancelled'];

/** What fal reported while the request waited or ran. */
export interface GenerationProgress {
  queuePosition?: number;
}

export interface GenerationError {
  message: string;
  /** fal's `error_type`, or the `type` of its first validation detail. */
  type?: string;
  detail?: JsonValue;
  /** fal completed and billed the request, but its Outputs could not be used: its cost still counts. */
  billed?: boolean;
}
