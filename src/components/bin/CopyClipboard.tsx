import { Check, ClipboardCopy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useClipboard } from '@/hooks/use-copy-to-clipboard';

const CopyClipboard = (props: { text: string }) => {
  const { copy, copied } = useClipboard({ timeout: 1000 });

  return (
    <Button
      onClick={() => {
        copy(props.text);
      }}
      className="ml-auto flex items-center gap-1"
    >
      {copied ? <Check /> : <ClipboardCopy />}
      {copied ? 'Copied!' : 'Copy to clipboard'}
    </Button>
  );
};

export default CopyClipboard;
