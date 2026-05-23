'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface NexusCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glow' | 'glowGreen' | 'glowRed' | 'elevated';
  padding?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  default: 'bg-card border border-border text-card-foreground',
  glow: 'bg-card border border-border text-card-foreground shadow-[0_0_12px_rgba(0,229,255,0.15)]',
  glowGreen: 'bg-card border border-border text-card-foreground shadow-[0_0_12px_rgba(57,255,20,0.15)]',
  glowRed: 'bg-card border border-border text-card-foreground shadow-[0_0_12px_rgba(255,58,58,0.15)]',
  elevated: 'bg-card border border-border text-card-foreground shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
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
