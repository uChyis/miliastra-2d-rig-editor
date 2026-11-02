import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Tooltip } from './tooltip'

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        filled: 'bg-primary text-on-primary hover:bg-primary-hover',
        tonal: 'bg-surface text-text hover:bg-surface-hover',
        outlined: 'hairline border-outline bg-transparent text-text hover:bg-surface',
        text: 'bg-transparent text-primary-text hover:bg-surface',
        danger: 'bg-danger text-on-primary hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-[12px]',
        default: 'h-9 px-4',
        lg: 'h-10 px-5',
      },
    },
    defaultVariants: { variant: 'tonal', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: React.ReactNode
  active?: boolean
}

/** Material 图标按钮：圆形、纯图标、悬停出提示 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, children, active, className, ...props }, ref) => (
    <Tooltip label={label}>
      <button
        ref={ref}
        aria-label={label}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors',
          'text-muted hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40',
          active && 'bg-surface-active text-text',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  ),
)
IconButton.displayName = 'IconButton'
