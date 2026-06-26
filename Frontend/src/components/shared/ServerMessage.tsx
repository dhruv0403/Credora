import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, XCircle, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ServerMessageProps {
  error?: {
    message?: string;
    code?: string;
    edge_case_ref?: number | null;
  } | null;
  warnings?: string[] | null;
  className?: string;
}

export const ServerMessage: React.FC<ServerMessageProps> = ({ error, warnings: initialWarnings, className }) => {
  const [activeWarnings, setActiveWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (initialWarnings) {
      setActiveWarnings(initialWarnings);
    } else {
      setActiveWarnings([]);
    }
  }, [initialWarnings]);

  const handleDismissWarning = (indexToDismiss: number) => {
    setActiveWarnings((prev) => prev.filter((_, idx) => idx !== indexToDismiss));
  };

  const isDev = import.meta.env.DEV;

  if (!error && activeWarnings.length === 0) return null;

  return (
    <div className={`space-y-2 w-full ${className || ''}`}>
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="bg-payable/10 border-payable/20 text-payable animate-fadeIn">
          <XCircle className="h-4 w-4 text-payable" />
          <AlertTitle className="flex items-center gap-2 font-semibold">
            Action Blocked
            {isDev && (error.code || error.edge_case_ref) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] bg-payable/20 text-payable px-1.5 py-0.5 rounded cursor-help font-mono">
                      DEV INFO
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="bg-ink text-paper border-slate/20 text-xs p-2">
                    <p className="font-mono">Code: {error.code || 'N/A'}</p>
                    {error.edge_case_ref !== undefined && (
                      <p className="font-mono">PRD Edge Case: #{error.edge_case_ref}</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </AlertTitle>
          <AlertDescription className="text-xs mt-1">
            {error.message || 'An unexpected error occurred. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings Alerts */}
      {activeWarnings.map((warning, idx) => (
        <Alert
          key={idx}
          className="bg-brass/10 border-brass/20 text-ink animate-fadeIn flex justify-between items-start"
        >
          <div className="flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 text-brass mt-0.5" />
            <div>
              <AlertTitle className="font-semibold text-xs text-brass">Warning</AlertTitle>
              <AlertDescription className="text-xs text-ink/80">{warning}</AlertDescription>
            </div>
          </div>
          <button
            onClick={() => handleDismissWarning(idx)}
            className="text-slate hover:text-ink transition-colors p-1"
            aria-label="Dismiss warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </Alert>
      ))}
    </div>
  );
};
