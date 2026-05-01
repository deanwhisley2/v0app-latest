'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeStatus =
  | 'LIVE'
  | 'BLOCKED'
  | 'LEARNING'
  | 'SAFE'
  | 'DANGER'
  | 'WARNING'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'PENDING'
  | 'WIN'
  | 'LOSS';

export interface NexusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

const statusConfig: Record<BadgeStatus, { bg: string; text: string; dot: string }> = {
  LIVE: { bg: 'bg-[#00E5FF]/15', text: 'text-[#00E5FF]', dot: 'bg-[#00E5FF]' },
  BLOCKED: { bg: 'bg-[#FF3A3A]/15', text: 'text-[#FF3A3A]', dot: 'bg-[#FF3A3A]' },
  LEARNING: { bg: 'bg-[#00E5FF]/10', text: 'text-[#00E5FF]', dot: 'bg-[#00E5FF]' },
  SAFE: { bg: 'bg-[#39FF14]/15', text: 'text-[#39FF14]', dot: 'bg-[#39FF14]' },
  DANGER: { bg: 'bg-[#FF3A3A]/15', text: 'text-[#FF3A3A]', dot: 'bg-[#FF3A3A]' },
  WARNING: { bg: 'bg-[#FFB800]/15', text: 'text-[#FFB800]', dot: 'bg-[#FFB800]' },
  ACTIVE: { bg: 'bg-[#39FF14]/15', text: 'text-[#39FF14]', dot: 'bg-[#39FF14]' },
  INACTIVE: { bg: 'bg-[#8B92A5]/15', text: 'text-[#8B92A5]', dot: 'bg-[#8B92A5]' },
  PENDING: { bg: 'bg-[#FFB800]/15', text: 'text-[#FFB800]', dot: 'bg-[#FFB800]' },
  WIN: { bg: 'bg-[#39FF14]/15', text: 'text-[#39FF14]', dot: 'bg-[#39FF14]' },
  LOSS: { bg: 'bg-[#FF3A3A]/15', text: 'text-[#FF3A3A]', dot: 'bg-[#FF3A3A]' },
};

const sizeStyles: Record<string, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-1 gap-1.5',
  lg: 'text-sm px-3 py-1.5 gap-2',
};

export function NexusBadge({
  status,
  size = 'md',
  animated = false,
  className,
  ...props
}: NexusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium font-mono',
        config.bg,
        config.text,
        sizeStyles[size],
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          config.dot,
          animated && 'animate-pulse-glow'
        )}
      />
      {status}
    </span>
  );
}
