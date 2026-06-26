import React, { useEffect } from 'react';
import { useSpace } from '@/app/SpaceContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { logout } from '@/api/auth';
import { formatCurrency } from '@/lib/formatCurrency';
import { Plus, LogOut, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const SpacesLanding: React.FC = () => {
  const { spaces, isLoadingSpaces, refreshSpaces, switchSpace } = useSpace();
  const navigate = useNavigate();
  const [switchingId, setSwitchingId] = React.useState<number | null>(null);

  useEffect(() => {
    refreshSpaces();
  }, []);

  const handleSelectSpace = async (spaceId: number) => {
    setSwitchingId(spaceId);
    try {
      await switchSpace(spaceId);
      // After switching context, determine redirect based on the updated role
      // SpaceContext switchSpace will populate the role. Let's do a fetch of members to route.
      // Or we can let the shell/router re-evaluate. To be immediate, we can read the role.
      // For simplicity, switchSpace determines it, and we can query the details.
      toast.success('Switched space successfully');
      navigate(`/spaces/${spaceId}/dashboard`);
    } catch (error) {
      toast.error('Failed to load space permissions');
    } finally {
      setSwitchingId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (e) {
      toast.error('Logout failed');
    }
  };

  return (
    <div className="min-h-screen bg-paper py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate/15 pb-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink relative inline-block">
              Your Spaces
              <span className="absolute bottom-0 left-0 w-8 h-1 bg-brass translate-y-1"></span>
            </h1>
            <p className="text-xs text-slate mt-2">
              Select an account ledger space to begin managing loans
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="text-xs font-semibold border-slate/30 text-ink hover:bg-slate/5 flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </Button>
        </div>

        {/* Loading State */}
        {isLoadingSpaces ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-brass" />
            <p className="text-xs font-semibold text-slate">Loading spaces...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Space Cards */}
            {spaces.map((space) => {
              const isBusiness = space.space_type === 'BUSINESS';
              const isShared = space.space_visibility === 'SHARED';

              return (
                <Card
                  key={space.id}
                  onClick={() => handleSelectSpace(space.id)}
                  className="bg-paper border border-slate/15 hover:border-brass/50 cursor-pointer transition-all hover:shadow-md group relative flex flex-col justify-between"
                >
                  <CardContent className="p-6 space-y-4">
                    {/* Header: Title and Badges */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-start">
                        <h3 className="font-semibold text-base text-ink group-hover:text-brass transition-colors">
                          {space.name}
                        </h3>
                        {switchingId === space.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-brass" />
                        ) : (
                          <ArrowRight className="w-4 h-4 text-slate group-hover:text-brass group-hover:translate-x-1 transition-all" />
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <span className="text-[10px] bg-slate/10 text-slate px-1.5 py-0.5 rounded font-medium">
                          {isBusiness ? 'Business' : 'Personal'}
                        </span>
                        <span className="text-[10px] bg-slate/10 text-slate px-1.5 py-0.5 rounded font-medium">
                          {isShared ? 'Shared' : 'Private'}
                        </span>
                      </div>
                    </div>

                    {/* Snapshot values */}
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate/10 text-xs">
                      <div>
                        <p className="text-slate font-medium uppercase tracking-wider text-[9px] mb-0.5">
                          Lent (Receivables)
                        </p>
                        <p className="font-bold text-receivable font-figures">
                          {formatCurrency(space.total_lent || '0.00', space.currency_code)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate font-medium uppercase tracking-wider text-[9px] mb-0.5">
                          Borrowed (Payables)
                        </p>
                        <p className="font-bold text-payable font-figures">
                          {formatCurrency(space.total_borrowed || '0.00', space.currency_code)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* "+ New Space" Card */}
            <Card
              onClick={() => navigate('/spaces/new')}
              className="bg-paper border border-dashed border-slate/30 hover:border-brass hover:bg-slate/5 cursor-pointer transition-all flex flex-col items-center justify-center p-6 text-center h-full min-h-[160px]"
            >
              <div className="p-3 rounded-full bg-slate/10 text-slate mb-3 group-hover:bg-brass/10 group-hover:text-brass">
                <Plus className="w-6 h-6 text-brass" />
              </div>
              <h3 className="font-serif text-base font-semibold text-ink">
                Create Space
              </h3>
              <p className="text-[11px] text-slate mt-1 max-w-[200px]">
                Setup a new ledger book for personal or partnership tracking
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
