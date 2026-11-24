import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        outline:
          'border-border bg-card shadow-2xs hover:border-border-strong hover:bg-secondary/80 hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground',
        destructive:
          'bg-destructive/12 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/25',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'min-h-8 gap-1.5 px-2.5 py-1 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 pointer-coarse:min-h-11',
        xs: "min-h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 py-0.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 pointer-coarse:min-h-11 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 py-1 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 pointer-coarse:min-h-11 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'min-h-9 gap-1.5 px-2.5 py-1.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 pointer-coarse:min-h-11',
        icon: 'size-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg pointer-coarse:min-h-11 pointer-coarse:min-w-11 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg pointer-coarse:min-h-11 pointer-coarse:min-w-11',
        'icon-lg': 'size-9 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
