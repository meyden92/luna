import { useLocation } from '@tanstack/react-router';
import { Check, Copy, FileWarning, Package } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useClipboard } from '@/hooks/use-copy-to-clipboard';

interface ViewButtonNavProps {
  url: string;
}

function ViewButtonNav({ url }: ViewButtonNavProps) {
  const { copied, copy } = useClipboard({ timeout: 1000 });
  const path = useLocation({ select: (loc) => loc.pathname });

  return (
    <TooltipProvider delay={150}>
      <div className="absolute left-5 top-24 z-10 flex items-center gap-2 rounded-md border bg-primary/30 p-2 animate-in">
        <Tooltip>
          <TooltipTrigger>
            {copied ? (
              <Check className="cursor-default text-primary" />
            ) : (
              <Copy
                onClick={() => copy(url)}
                className="transition-colors hover:cursor-pointer"
              />
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy URL</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<a href={url} />}>
            <Package className="transition-colors hover:cursor-pointer" />
          </TooltipTrigger>
          <TooltipContent>
            <p>View Raw</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<a href={`${path}/report`} />}>
            <FileWarning className="transition-colors hover:cursor-pointer" />
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
