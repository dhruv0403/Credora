import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  direction?: 'receivable' | 'payable' | 'neutral';
  trend?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, direction = 'neutral', trend, className }) => {
  let valueColor = 'text-ink';
  if (direction === 'receivable') {
    valueColor = 'text-receivable';
  } else if (direction === 'payable') {
    valueColor = 'text-payable';
  }

  return (
    <Card className={cn("bg-paper border border-slate/15 shadow-none rounded-md", className)}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-slate uppercase tracking-wider mb-1">{label}</p>
        <div className="flex items-baseline justify-between">
          <p className={cn("text-2xl font-bold font-figures tracking-tight", valueColor)}>
            {value}
          </p>
          {trend && (
            <span className="text-[10px] text-slate font-medium bg-slate/10 px-1.5 py-0.5 rounded">
              {trend}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
