import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface DirectionBadgeProps {
  direction: 'GIVEN' | 'TAKEN';
  className?: string;
}

export const DirectionBadge: React.FC<DirectionBadgeProps> = ({ direction, className }) => {
  const isGiven = direction === 'GIVEN';
  const baseStyle = isGiven
    ? 'bg-receivable/10 text-receivable hover:bg-receivable/15 border-transparent'
    : 'bg-payable/10 text-payable hover:bg-payable/15 border-transparent';

  return (
    <Badge className={cn('font-medium px-2 py-0.5 rounded-full text-xs shadow-none border flex items-center gap-1 w-fit', baseStyle, className)}>
      {isGiven ? (
        <ArrowUpRight className="w-3.5 h-3.5" />
      ) : (
        <ArrowDownLeft className="w-3.5 h-3.5" />
      )}
      {isGiven ? 'Lent' : 'Borrowed'}
    </Badge>
  );
};
