'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface NexusButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-[#00E5FF] text-[#0A0B0E] hover:bg-[#00E5FF]/90 active:bg-[#00E5FF]/80',
  secondary:
    'bg-[#39FF14] text-[#0A0B0E] hover:bg-[#39FF14]/90 active:bg-[#39FF14]/80',
  danger:
    'bg-[#FF3A3A] text-white hover:bg-[#FF3A3A]/90 active:bg-[#FF3A3A]/80',
  ghost:
    'bg-transparent text-[#F0F2F5] hover:bg-[#1E2028] active:bg-[#1E2028]/80',
  outline:
    'bg-transparent border border-[#1E2028] text-[#F0F2F5] hover:border-[#00E5FF] hover:text-[#00E5FF] active:border-[#00E5FF]/80',
};

const sizeStyles: Record<string, string> = {
  sm: 'h-8 px-3 text-xs rounded',
  md: 'h-10 px-4 text-sm rounded',
  lg: 'h-12 px-6 text-base rounded',
};

export function NexusButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: NexusButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0E]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
