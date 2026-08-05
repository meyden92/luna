import { Input as InputPrimitive } from '@base-ui/react/input';
import type * as React from 'react';

import { cn } from '@/libs/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'bg-muted/35 border-border/80 hover:bg-muted/45 hover:border-border focus-visible:bg-background focus-visible:border-ring focus-visible:ring-ring/35 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-9 rounded-lg border px-3 py-1 text-base shadow-sm transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out file:h-7 file:text-sm file:font-medium focus-visible:-translate-y-[1px] focus-visible:shadow-md focus-visible:ring-2 aria-invalid:ring-2 md:text-sm file:text-foreground placeholder:text-muted-foreground/75 w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
