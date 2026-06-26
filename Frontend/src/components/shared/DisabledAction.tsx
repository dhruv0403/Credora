import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DisabledActionProps {
  reason: string | null | undefined;
  children: React.ReactElement;
  disabled?: boolean;
}

export const DisabledAction: React.FC<DisabledActionProps> = ({ reason, children, disabled }) => {
  const isDisabled = disabled || !!reason;

  if (!isDisabled) {
    return children;
  }

  // Clone the child element to apply disabled state styles
  const child = React.cloneElement(children as any, {
    disabled: true,
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    // Force styling for disabled look
    className: `${(children as any).props.className || ''} opacity-50 cursor-not-allowed pointer-events-none`,
  });

  if (!reason) {
    return child;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block cursor-not-allowed pointer-events-auto">
            {child}
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-ink text-paper border-slate/20 text-xs max-w-xs">
          <p>{reason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
