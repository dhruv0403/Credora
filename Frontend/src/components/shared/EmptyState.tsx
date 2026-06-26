import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className }) => {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate/30 rounded-md bg-paper/50", className)}>
      <div className="text-slate p-3 bg-slate/10 rounded-full mb-4">
        {icon}
      </div>
      <h2 className="font-serif text-xl font-medium text-ink mb-1">{title}</h2>
      {description && (
        <p className="text-xs text-slate max-w-sm mb-6 font-sans">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} className="bg-brass hover:bg-brass/90 text-paper font-medium text-xs">
          {action.label}
        </Button>
      )}
    </div>
  );
};
