import { Check, Clock, Copy, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import styles from './FormShareViewer.module.css';
import { SensitiveFieldValue } from './SensitiveFieldValue';

type FormField = {
  id: string;
  label: string;
  value: string | null;
  type: string;
  isSensitive: boolean;
  sortOrder: number;
};

type FormShareViewerProps = {
  shareId: string;
  title: string | null;
  fields: FormField[];
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  viewToken: string | null;
};

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const calc = () => Math.max(0, new Date(expiresAt).getTime() - Date.now());
    setRemaining(calc());
    const interval = setInterval(() => {
      const ms = calc();
      setRemaining(ms);
      if (ms <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (remaining === null) {
    return null;
  }

  if (remaining <= 0) {
    return <span>This share has expired</span>;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let display: string;
  if (days > 0) {
    display = `${days}d ${hours}h ${minutes}m remaining`;
  } else if (hours > 0) {
    display = `${hours}h ${minutes}m ${seconds}s remaining`;
  } else {
    display = `${minutes}m ${seconds}s remaining`;
  }

  return <span className={styles.countdown}>{display}</span>;
}

function FieldValue({ field, shareId, viewToken }: { field: FormField; shareId: string; viewToken: string | null }) {
  const [copied, setCopied] = useState(false);
  const value = field.value ?? '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (field.isSensitive) {
    return (
      <SensitiveFieldValue
        shareId={shareId}
        fieldId={field.id}
        viewToken={viewToken}
      />
    );
  }

  const renderValue = () => {
    if (field.type === 'url') {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          {value}
        </a>
      );
    }

    if (field.type === 'email') {
      return (
        <a
          href={`mailto:${value}`}
          className={styles.link}
        >
          {value}
        </a>
      );
    }

    return <span className={styles.plainValue}>{value}</span>;
  };

  return (
    <div className={styles.valueRow}>
      <code className={styles.value}>{renderValue()}</code>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        className={styles.copyButton}
        title="Copy"
      >
        {copied ? <Check className={styles.copiedIcon} /> : <Copy />}
      </Button>
    </div>
  );
}

export function FormShareViewer({ shareId, title, fields, expiresAt, maxViews, viewCount, viewToken }: FormShareViewerProps) {
  const sortedFields = fields.filter((field) => field.type !== 'hidden').sort((a, b) => a.sortOrder - b.sortOrder);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopyAll = async () => {
    const text = sortedFields
      .map((field) => `${field.label}: ${field.isSensitive ? '[sensitive value hidden]' : (field.value ?? '')}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>{title || 'Shared form data'}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyAll}
          className={styles.copyAll}
        >
          {copiedAll ? <Check className={styles.copiedIcon} /> : <Copy />}
          Copy all
        </Button>
      </div>

      <div className={styles.meta}>
        {expiresAt && (
          <div className={styles.metaItem}>
            <Clock />
            <CountdownTimer expiresAt={expiresAt} />
          </div>
        )}
        {maxViews && (
          <div className={styles.metaItem}>
            <Eye />
            <span>{`${maxViews - viewCount} views remaining`}</span>
          </div>
        )}
      </div>

      <div className={styles.fieldList}>
        {sortedFields.map((field) => (
          <Card key={field.id}>
            <CardContent className={styles.fieldBody}>
              <label className={styles.fieldLabel}>{field.label}</label>
              <FieldValue
                field={field}
                shareId={shareId}
                viewToken={viewToken}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
