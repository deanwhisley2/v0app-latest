'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface NexusStatBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  prefix?: string;
  suffix?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'profit' | 'loss' | 'warning' | 'info';
  sparkline?: boolean;
}

const variantStyles: Record<string, string> = {
  default: '',
  profit: 'text-[#39FF14]',
  loss: 'text-[#FF3A3A]',
  warning: 'text-[#FFB800]',
  info: 'text-[#00E5FF]',
};

const sizeStyles: Record<string, { container: string; label: string; value: string }> = {
  sm: {
    container: 'p-3 gap-1',
    label: 'text-[10px]',
    value: 'text-sm',
  },
  md: {
    container: 'p-4 gap-1.5',
    label: 'text-xs',
    value: 'text-lg',
  },
  lg: {
    container: 'p-5 gap-2',
    label: 'text-sm',
    value: 'text-2xl',
  },
};

export function NexusStatBlock({
  label,
  value,
  change,
  changeLabel,
  prefix = '',
  suffix = '',
  size = 'md',
  variant = 'default',
  className,
  ...props
}: NexusStatBlockProps) {
  const styles = sizeStyles[size];
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change === 0;

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-lg flex flex-col text-card-foreground',
        styles.container,
        className
      )}
      {...props}
    >
      <span className={cn('text-muted-foreground font-medium tracking-wide uppercase', styles.label)}>
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono font-bold tracking-tight',
            variant !== 'default' ? variantStyles[variant] : 'text-foreground',
            styles.value
          )}
        >
          {prefix}{value}{suffix}
        </span>
        {change !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-mono font-medium',
              isPositive && 'text-[#39FF14]',
              isNegative && 'text-[#FF3A3A]',
              isNeutral && 'text-muted-foreground'
            )}
          >
            {isPositive && <TrendingUp className="h-3 w-3" />}
            {isNegative && <TrendingDown className="h-3 w-3" />}
            {isNeutral && <Minus className="h-3 w-3" />}
            {change > 0 ? '+' : ''}{change}%
            {changeLabel && <span className="text-muted-foreground ml-0.5">{changeLabel}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
