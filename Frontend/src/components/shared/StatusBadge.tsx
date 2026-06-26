import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LOAN_STATUS_LABELS } from '@/lib/labels';
import { EyeOff } from 'lucide-react';

interface StatusBadgeProps {
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'WRITTEN_OFF';
  isOverdue?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, isOverdue, className }) => {
  let label = LOAN_STATUS_LABELS[status] || status;
  let baseStyle = '';

  if (status === 'DRAFT') {
    baseStyle = 'bg-slate/10 text-slate hover:bg-slate/15 border-transparent';
  } else if (status === 'ACTIVE') {
    baseStyle = 'bg-brass/10 text-brass hover:bg-brass/15 border-transparent';
  } else if (status === 'CLOSED') {
    baseStyle = 'bg-ink/10 text-ink hover:bg-ink/15 border-transparent';
  } else if (status === 'WRITTEN_OFF') {
    label = 'Written Off';
    baseStyle = 'bg-slate/10 text-slate line-through hover:bg-slate/15 border-transparent flex items-center gap-1';
  }

  return (
    <div className="relative inline-flex items-center">
      <Badge className={cn('font-medium px-2 py-0.5 rounded-full text-xs shadow-none border', baseStyle, className)}>
        {status === 'WRITTEN_OFF' && <EyeOff className="w-3 h-3 text-slate/70" />}
        {label}
      </Badge>
      {status === 'ACTIVE' && isOverdue && (
        <span className="absolute -top-1 -right-1 flex h-2..5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-payable opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-payable"></span>
        </span>
      )}
    </div>
  );
};
