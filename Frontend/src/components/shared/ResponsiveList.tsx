import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ColumnDef<T> {
  header: string;
  cell: (item: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface ResponsiveListProps<T> {
  data: T[] | undefined;
  columns: ColumnDef<T>[];
  cardRenderer: (item: T) => React.ReactNode;
  emptyState?: React.ReactNode;
  isLoading?: boolean;
  
  // Optional pagination
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function ResponsiveList<T>({
  data,
  columns,
  cardRenderer,
  emptyState,
  isLoading,
  currentPage,
  totalPages,
  onPageChange,
}: ResponsiveListProps<T>) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate gap-2 w-full">
        <Loader2 className="w-6 h-6 animate-spin text-brass" />
        <span className="text-xs font-medium text-slate/75">Loading records...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <div className="w-full">{emptyState || <div className="text-center py-12 text-slate text-sm">No data available</div>}</div>;
  }

  return (
    <div className="space-y-4 w-full">
      {/* Desktop view: Table */}
      <div className="hidden sm:block border border-slate/15 rounded-md overflow-hidden bg-paper shadow-sm">
        <Table>
          <TableHeader className="bg-ink hover:bg-ink">
            <TableRow className="hover:bg-ink/95 border-b border-slate/20">
              {columns.map((col, idx) => (
                <TableHead
                  key={idx}
                  className={cn(
                    "text-paper text-xs font-semibold uppercase tracking-wider h-10 py-2 first:pl-4 last:pr-4",
                    col.headerClassName
                  )}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, rowIdx) => (
              <TableRow
                key={rowIdx}
                className="border-b border-slate/15 last:border-0 hover:bg-slate/5 transition-colors"
              >
                {columns.map((col, colIdx) => (
                  <TableCell
                    key={colIdx}
                    className={cn(
                      "py-3 text-sm text-ink first:pl-4 last:pr-4",
                      col.className
                    )}
                  >
                    {col.cell(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile view: Stacked Cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {data.map((item, idx) => (
          <div key={idx} className="w-full">
            {cardRenderer(item)}
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages && totalPages > 1 && onPageChange && currentPage && (
        <div className="flex justify-between items-center px-2 py-4 bg-transparent border-t border-slate/15">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="text-xs font-semibold border-slate/30 text-ink hover:bg-slate/5"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <span className="text-xs text-slate font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="text-xs font-semibold border-slate/30 text-ink hover:bg-slate/5"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
