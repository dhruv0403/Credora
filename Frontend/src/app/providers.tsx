import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SpaceProvider } from './SpaceContext';
import { Toaster } from 'sonner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SpaceProvider>
          {children}
          <Toaster 
            position="top-right" 
            richColors 
            toastOptions={{
              className: 'bg-paper text-ink border-slate/15 font-sans text-xs rounded-md shadow-md',
            }}
          />
        </SpaceProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};
