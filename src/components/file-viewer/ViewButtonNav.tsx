import { useLocation } from '@tanstack/react-router';
import { Check, Copy, FileWarning, Package } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useClipboard } from '@/hooks/use-copy-to-clipboard';
import styles from './ViewButtonNav.module.css';

interface ViewButtonNavProps {
  url: string;
}

function ViewButtonNav({ url }: ViewButtonNavProps) {
  const { copied, copy } = useClipboard({ timeout: 1000 });
  const path = useLocation({ select: (loc) => loc.pathname });

  return (
    <TooltipProvider delay={150}>
      <div className={styles.root}>
        <Tooltip>
          <TooltipTrigger>
            {copied ? (
              <Check className={styles.copied} />
            ) : (
              <Copy
                onClick={() => copy(url)}
                className={styles.action}
              />
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy URL</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<a href={url} />}>
            <Package className={styles.action} />
          </TooltipTrigger>
          <TooltipContent>
            <p>View Raw</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<a href={`${path}/report`} />}>
            <FileWarning className={styles.action} />
          </TooltipTrigger>
          <TooltipContent>
            <p>Report File</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export default ViewButtonNav;
