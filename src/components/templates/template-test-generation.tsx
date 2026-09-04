import { AlertCircle, ExternalLink, Loader2, Play, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useFormWatch } from '@/components/ui/tanstack-form';
import { UPLOAD_CONFIG } from '@/config/upload-config';
import type { editingModelField } from '@/db/schema/ai';
import { streamSSE } from '@/libs/sse';
import { cn } from '@/libs/utils';
import type { TemplateVariable, TemplateVariableOption } from '@/types/template';
import styles from './template-test-generation.module.css';

type EditingModelField = typeof editingModelField.$inferSelect;
interface TemplateTestGenerationProps {
  models: { id: string; label: string; fields: EditingModelField[] }[];
}

type TestStatus = 'idle' | 'running' | 'succeeded' | 'failed';

const normalizeOption = (option: string | TemplateVariableOption): TemplateVariableOption => {
  if (typeof option === 'string') return { label: option, value: option, enabled: true };
  return { ...option, enabled: option.enabled !== false };
};

// Coerce a stored field value (DB defaults are strings) into the type the model
// expects, so Replicate receives e.g. an integer instead of "1".
const coerceFieldValue = (raw: unknown, type: string): unknown => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (type === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }
  if (type === 'boolean') return raw === true || raw === 'true';
  return raw;
};

const initialValueFor = (variable: TemplateVariable): string => {
  if (variable.defaultValue) return variable.defaultValue;
  if (variable.type === 'dropdown' && variable.options && variable.options.length > 0) {
    const first = normalizeOption(variable.options[0]!);
    if (first.enabled !== false) return first.value;
  }
  if (variable.type === 'boolean') return 'false';
  return '';
};

export function TemplateTestGeneration({ models }: TemplateTestGenerationProps) {
  const editingModelId = useFormWatch('editingModelId') as string | undefined;
  const prompt = (useFormWatch('prompt') as string) || '';
  const variables = (useFormWatch('variables') as TemplateVariable[]) || [];
  const fieldValues = (useFormWatch('editingModelFieldValues') as Record<string, unknown>) || {};

  const selectedModel = models.find((m) => m.id === editingModelId);
  const enabledVariables = variables.filter((v) => v.enabled !== false && v.name.trim() !== '');

  const [sampleImage, setSampleImage] = useState<File | null>(null);
  const [samplePreview, setSamplePreview] = useState<string | null>(null);
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<TestStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seed test values from variable defaults, preserving anything already typed.
  useEffect(() => {
    const enabled = variables.filter((v) => v.enabled !== false && v.name.trim() !== '');
    setTestValues((prev) => {
      const next: Record<string, string> = {};
      for (const variable of enabled) {
        next[variable.name] = prev[variable.name] ?? initialValueFor(variable);
      }
      return next;
    });
  }, [variables]);

  useEffect(() => {
    if (!sampleImage) {
      setSamplePreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(sampleImage);
    setSamplePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [sampleImage]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
      toast.error(`Image is too large. Maximum size is ${UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB.`);
      return;
    }
    if (!(UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      toast.error('Unsupported image format.');
      return;
    }
    setSampleImage(file);
  };

  const buildFinalPrompt = () => {
    let result = prompt;
    for (const variable of enabledVariables) {
      const value = testValues[variable.name] ?? '';
      result = result.replace(new RegExp(`\\{${variable.name}\\}`, 'g'), () => value);
    }
    return result;
  };

  const handleRun = async () => {
    if (!selectedModel) {
      toast.error('Select a base model first.');
      return;
    }
    if (!sampleImage) {
      toast.error('Upload a sample image to test with.');
      return;
    }
    const missingRequired = enabledVariables.filter((v) => v.required && !(testValues[v.name] ?? '').trim());
    if (missingRequired.length > 0) {
      toast.error(`Fill required variables: ${missingRequired.map((v) => v.label).join(', ')}`);
      return;
    }

    // Merge configured field values with model defaults so untouched fields
    // (e.g. the {template_prompt} placeholder) are still applied, coercing each
    // value to the type the model expects.
    const mergedFieldValues: Record<string, unknown> = {};
    for (const field of selectedModel.fields) {
      const current = fieldValues[field.name];
      const raw = current !== undefined && current !== '' ? current : field.defaultValue;
      // Keep the {template_prompt} placeholder as-is; the server substitutes it.
      const value = raw === '{template_prompt}' ? raw : coerceFieldValue(raw, field.type);
      if (value !== undefined) mergedFieldValues[field.name] = value;
    }

    setStatus('running');
    setProgress(0);
    setMessage('Starting…');
    setResultUrl(null);
    setError(null);

    const formData = new FormData();
    formData.append('editingModelId', selectedModel.id);
    formData.append('finalPrompt', buildFinalPrompt());
    formData.append('editingModelFieldValues', JSON.stringify(mergedFieldValues));
    formData.append('image_0', sampleImage);

    try {
      await streamSSE({
        url: '/api/admin/templates/test-generate',
        body: formData,
        onEvent: (event) => {
          const data = event as { status: string; progress?: number; message?: string; error?: string; resultImageUrl?: string };
          if (typeof data.progress === 'number') setProgress(data.progress);
          if (data.message) setMessage(data.message);
          if (data.status === 'succeeded' && data.resultImageUrl) {
            setResultUrl(data.resultImageUrl);
            setStatus('succeeded');
          } else if (data.status === 'failed') {
            setError(data.error || 'Generation failed');
            setStatus('failed');
          }
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setStatus('failed');
    }
  };

  const isRunning = status === 'running';

  return (
    <Card>
      <CardHeader>
        <CardTitle className={styles.title}>
          <Play className={styles.titleIcon} />
          Test Generation
        </CardTitle>
        <CardDescription>
          Run a real generation with the settings currently in this form — no need to save first. The result is previewed here only and is
          not stored.
        </CardDescription>
      </CardHeader>
      <CardContent className="stack space-6">
        {!selectedModel && <p className={cn('type-sm', styles.muted)}>Select a base model above to enable testing.</p>}

        <div className="stack space-2">
          <Label>Sample Image</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES.join(',')}
            className="hide"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {samplePreview ? (
            <div className={styles.previewWrap}>
              <img
                src={samplePreview}
                alt="Sample"
                className={styles.samplePreview}
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className={styles.removeSample}
                onClick={() => setSampleImage(null)}
              >
                <X className={styles.removeIcon} />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className={styles.actionButton}
            >
              <Upload className={styles.buttonIcon} />
              Upload sample image
            </Button>
          )}
        </div>

        {enabledVariables.length > 0 && (
          <div className="stack space-3">
            <Label>Variable Values</Label>
            <div className={styles.variableGrid}>
              {enabledVariables.map((variable) => (
                <div
                  key={variable.id || variable.name}
                  className="stack space-2"
                >
                  <Label
                    htmlFor={`test-${variable.name}`}
                    className="type-sm weight-normal"
                  >
                    {variable.label}
                    {variable.required && <span className={styles.required}>*</span>}
                  </Label>
                  {variable.type === 'dropdown' && variable.options ? (
                    <Select
                      value={testValues[variable.name] ?? ''}
                      onValueChange={(v) => setTestValues((prev) => ({ ...prev, [variable.name]: v ?? '' }))}
                    >
                      <SelectTrigger id={`test-${variable.name}`}>
                        <SelectValue placeholder={`Select ${variable.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {variable.options.map((option) => {
                          const normalized = normalizeOption(option);
                          if (normalized.enabled === false) return null;
                          return (
                            <SelectItem
                              key={`${variable.name}-${normalized.value}`}
                              value={normalized.value}
                            >
                              {normalized.label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : variable.type === 'boolean' ? (
                    <div className={styles.switchRow}>
                      <Switch
                        id={`test-${variable.name}`}
                        checked={testValues[variable.name] === 'true'}
                        onCheckedChange={(checked) => setTestValues((prev) => ({ ...prev, [variable.name]: checked ? 'true' : 'false' }))}
                      />
                    </div>
                  ) : (
                    <Input
                      id={`test-${variable.name}`}
                      type={variable.type === 'number' ? 'number' : 'text'}
                      value={testValues[variable.name] ?? ''}
                      onChange={(e) => setTestValues((prev) => ({ ...prev, [variable.name]: e.target.value }))}
                      placeholder={variable.description || variable.label}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          type="button"
          onClick={handleRun}
          disabled={isRunning || !selectedModel || !sampleImage}
          className={styles.actionButton}
        >
          {isRunning ? <Loader2 className={styles.spinner} /> : <Play className={styles.buttonIcon} />}
          {isRunning ? 'Generating…' : 'Run Test Generation'}
        </Button>

        {isRunning && (
          <div className="stack space-2">
            <Progress value={progress} />
            <p className={cn('type-sm', styles.muted)}>{message}</p>
          </div>
        )}

        {status === 'failed' && error && (
          <div className={styles.errorBox}>
            <AlertCircle className={styles.errorIcon} />
            <p className={cn('type-sm', styles.danger)}>{error}</p>
          </div>
        )}

        {status === 'succeeded' && resultUrl && (
          <div className="stack space-3">
            <div className={styles.resultHeader}>
              <Label>Result</Label>
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('type-sm', styles.resultLink)}
              >
                Open full size <ExternalLink className={styles.linkIcon} />
              </a>
            </div>
            <img
              src={resultUrl}
              alt="Generated result"
              className={styles.resultImage}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
