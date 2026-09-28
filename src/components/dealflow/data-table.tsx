'use client';

import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Inbox } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Create your first record to see it listed.',
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80 dark:bg-slate-900/80">
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={cn(
                  'text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                )}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32">
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                    <Inbox className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {emptyTitle}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {emptyDescription}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'cursor-default text-sm',
                  onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60',
                )}
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      c.align === 'right' && 'text-right tabular-nums',
                      c.align === 'center' && 'text-center',
                    )}
                  >
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
