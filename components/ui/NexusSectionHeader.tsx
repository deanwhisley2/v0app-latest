'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface NexusSectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  live?: boolean;
  liveLabel?: string;
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles: Record<string, { title: string; subtitle: string }> = {
  sm: { title: 'text-sm', subtitle: 'text-[10px]' },
  md: { title: 'text-base', subtitle: 'text-xs' },
  lg: { title: 'text-lg', subtitle: 'text-sm' },
};

export function NexusSectionHeader({
  title,
  subtitle,
  live = false,
  liveLabel = 'LIVE',
  action,
  size = 'md',
  className,
  ...props
}: NexusSectionHeaderProps) {
  const styles = sizeStyles[size];

  return (
    <div
      className={cn(
        'flex items-center justify-between w-full',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3 min-w-0">
        {live && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#39FF14] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#39FF14]" />
            </span>
            <span className="text-[10px] font-mono font-bold text-[#39FF14] uppercase tracking-wider">
              {liveLabel}
            </span>
          </div>
        )}
        <div className="min-w-0">
          <h3
            className={cn(
              'font-mono font-bold text-foreground truncate',
              styles.title
            )}
          >
            {title}
          </h3>
          {subtitle && (
            <p className={cn('text-muted-foreground mt-0.5', styles.subtitle)}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && (
        <div className="shrink-0 ml-4">
          {action}
        </div>
      )}
    </div>
  );
}
