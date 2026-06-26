import React from 'react';
import { cn } from '@/lib/utils';

interface WizardStepperProps {
  currentStep: number; // 1-indexed
  totalSteps: number;
  labels: string[];
  className?: string;
}

export const WizardStepper: React.FC<WizardStepperProps> = ({ currentStep, totalSteps, labels, className }) => {
  return (
    <div className={cn("w-full mb-6", className)}>
      {/* Mobile view */}
      <div className="sm:hidden flex flex-col gap-1.5 px-1">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-ink">Step {currentStep} of {totalSteps}</span>
          <span className="text-slate font-medium">{labels[currentStep - 1]}</span>
        </div>
        <div className="w-full bg-slate/15 h-1.5 rounded-full overflow-hidden">
          <div 
            className="bg-brass h-full transition-all duration-300 ease-out" 
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop view */}
      <div className="hidden sm:block">
        <div className="flex justify-between items-center relative mb-4">
          {/* Progress bar line background */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate/15 -translate-y-1/2 z-0" />
          
          {/* Progress bar active line */}
          <div 
            className="absolute top-1/2 left-0 h-0.5 bg-brass -translate-y-1/2 z-0 transition-all duration-500 ease-out" 
            style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
          />

          {/* Stepper circles */}
          {Array.from({ length: totalSteps }).map((_, idx) => {
            const stepNum = idx + 1;
            const isActive = stepNum === currentStep;
            const isCompleted = stepNum < currentStep;

            return (
              <div 
                key={idx} 
                className="flex flex-col items-center relative z-10 w-1/12"
              >
                <div 
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-300",
                    isActive && "bg-paper border-brass text-brass ring-4 ring-brass/10 scale-110",
                    isCompleted && "bg-brass border-brass text-paper",
                    !isActive && !isCompleted && "bg-paper border-slate/30 text-slate"
                  )}
                >
                  {stepNum}
                </div>
              </div>
            );
          })}
        </div>

        {/* Stepper labels */}
        <div className="flex justify-between text-[11px] font-medium text-slate select-none px-2">
          {labels.map((label, idx) => {
            const stepNum = idx + 1;
            const isActive = stepNum === currentStep;
            const isCompleted = stepNum < currentStep;

            return (
              <span 
                key={idx} 
                className={cn(
                  "w-1/12 text-center truncate px-1",
                  isActive && "text-brass font-bold",
                  isCompleted && "text-ink font-semibold",
                  !isActive && !isCompleted && "text-slate/60"
                )}
                title={label}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
