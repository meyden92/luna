import type * as React from 'react';

import { cn } from '@/libs/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-border/80 bg-muted/35 hover:bg-muted/45 hover:border-border focus-visible:bg-background focus-visible:border-ring focus-visible:ring-ring/35 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 resize-none rounded-lg border px-3 py-3 text-base shadow-sm transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:-translate-y-[1px] focus-visible:shadow-md focus-visible:ring-2 aria-invalid:ring-2 md:text-sm placeholder:text-muted-foreground/75 flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
