import React from 'react';

export const MembersManager: React.FC = () => {
  return (
    <div className="p-8 border border-slate/15 bg-paper rounded-md text-center max-w-md mx-auto mt-12 space-y-3 shadow-sm">
      <h3 className="font-serif text-lg font-bold text-ink">Members & Invites</h3>
      <p className="text-xs text-slate">Manage space member roles (Owner, Admin, Viewer, Field Man) and dispatch team invite tokens.</p>
      <span className="inline-block text-[9px] bg-slate/10 text-slate px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
        Phase 2 Feature
      </span>
    </div>
  );
};
