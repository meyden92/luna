import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import styles from './period-selector.module.css';

interface PeriodSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className={styles.root}>
      <span className={styles.label}>Period:</span>
      <Select
        value={value}
        onValueChange={(v) => v && onChange(v)}
      >
        <SelectTrigger className={styles.select}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7">7 days</SelectItem>
          <SelectItem value="30">30 days</SelectItem>
          <SelectItem value="90">90 days</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
