'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  className?: string;
  width?: string;
}

export interface NexusTableProps<T> extends React.HTMLAttributes<HTMLDivElement> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  compact?: boolean;
}

export function NexusTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data available',
  compact = false,
  className,
  ...props
}: NexusTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal);
      const strB = String(bVal);
      return sortDirection === 'asc'
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    });
  }, [data, sortKey, sortDirection]);

  return (
    <div
      className={cn(
        'w-full overflow-x-auto rounded-lg border border-[#1E2028]',
        className
      )}
      {...props}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[#1E2028] bg-[#0A0B0E]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'text-left text-xs font-mono font-medium text-[#8B92A5] uppercase tracking-wider',
                  compact ? 'px-3 py-2' : 'px-4 py-3',
                  col.sortable && 'cursor-pointer select-none hover:text-[#00E5FF] transition-colors',
                  col.className
                )}
                style={col.width ? { width: col.width } : undefined}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && (
                    <span className="inline-flex flex-col">
                      {sortKey === col.key ? (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="h-3 w-3 text-[#00E5FF]" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-[#00E5FF]" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 text-[#8B92A5]" />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E2028]">
          {sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className={cn(
                  'text-center text-[#8B92A5] font-mono',
                  compact ? 'px-3 py-8' : 'px-4 py-12'
                )}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={cn(
                  'transition-colors duration-150',
                  onRowClick && 'cursor-pointer hover:bg-[#1E2028]/50'
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'text-sm text-[#F0F2F5] font-mono',
                      compact ? 'px-3 py-2' : 'px-4 py-3',
                      col.className
                    )}
                  >
                    {col.render ? col.render(item) : String(item[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
