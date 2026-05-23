'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface NexusCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glow' | 'glowGreen' | 'glowRed' | 'elevated';
  padding?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  default: 'bg-card border border-border text-card-foreground shadow-sm',
  glow: 'bg-card border border-primary/20 text-card-foreground shadow-sm',
  glowGreen: 'bg-card border border-success/25 text-card-foreground shadow-sm',
  glowRed: 'bg-card border border-destructive/25 text-card-foreground shadow-sm',
  elevated: 'bg-card border border-border text-card-foreground shadow-[var(--shadow-elevated)]',
};

const paddingStyles: Record<string, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function NexusCard({
  variant = 'default',
  padding = 'md',
  className,
  children,
  ...props
}: NexusCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg transition-all duration-200',
        variantStyles[variant],
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
