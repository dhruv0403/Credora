import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '@/api/spaces';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDate } from '@/lib/formatDate';
import {
  FilePlus,
  Calendar,
  AlertCircle,
  Activity,
  ChevronRight,
  History,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const parsedSpaceId = Number(spaceId);
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', parsedSpaceId],
    queryFn: () => getDashboard(parsedSpaceId),
    enabled: !isNaN(parsedSpaceId),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-28 bg-slate/10 rounded-md" />
          <div className="h-28 bg-slate/10 rounded-md" />
          <div className="h-28 bg-slate/10 rounded-md" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-80 bg-slate/10 lg:col-span-2 rounded-md" />
          <div className="h-80 bg-slate/10 rounded-md" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={<AlertCircle className="w-8 h-8 text-payable" />}
        title="Error loading dashboard"
        description="Could not load your space dashboard snapshot. Please verify your connection."
        action={{
          label: 'Retry Now',
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  // Handle empty state if no active loans exist
  const hasNoLoans = data.active_loans_count === 0 && data.upcoming_payments.length === 0;

  if (hasNoLoans) {
    return (
      <div className="py-12 max-w-lg mx-auto">
        <EmptyState
          icon={<FilePlus className="w-10 h-10 text-brass" />}
          title="Record your first loan"
          description="It looks like this space is brand new! You haven't recorded any loans or transactions yet. Click below to launch the loan creator."
          action={{
            label: '+ Create First Loan',
            onClick: () => navigate(`/spaces/${spaceId}/loans/new`),
          }}
        />
      </div>
    );
  }

  const isNetPositive = parseFloat(data.net_position) >= 0;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Total Lent"
          value={formatCurrency(data.total_lent, 'INR')}
          direction="receivable"
          trend="Given Loans"
        />
        <StatCard
          label="Total Borrowed"
          value={formatCurrency(data.total_borrowed, 'INR')}
          direction="payable"
          trend="Taken Loans"
        />
        <StatCard
          label="Net Position"
          value={formatCurrency(data.net_position, 'INR')}
          direction={isNetPositive ? 'receivable' : 'payable'}
          trend="Asset Net Balance"
        />
      </div>

      {/* Main Panel grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Upcoming Payments */}
        <div className="lg:col-span-2 border border-slate/15 rounded-md p-6 bg-paper flex flex-col justify-between shadow-sm">
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate/10 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brass" />
                <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
                  Upcoming Payments
                </h3>
              </div>
              <span className="text-[10px] bg-slate/10 text-slate px-2 py-0.5 rounded font-semibold">
                Next 7-30 Days
              </span>
            </div>

            {data.upcoming_payments.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate font-medium">
                No scheduled payments due in the next 30 days.
              </div>
            ) : (
              <div className="divide-y divide-slate/10">
                {data.upcoming_payments.map((payment, idx) => (
                  <div key={idx} className="py-3 flex justify-between items-center text-xs first:pt-0 last:pb-0">
                    <div>
                      <p className="font-bold text-ink">{payment.contact_name}</p>
                      <p className="text-[10px] text-slate font-medium mt-0.5">
                        Due: {formatDate(payment.due_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold font-figures text-ink">
                        {formatCurrency(payment.amount_due, 'INR')}
                      </span>
                      <Link
                        to={`/spaces/${spaceId}/loans/${payment.loan_id}`}
                        className="text-brass hover:text-brass/80 p-1"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {data.upcoming_payments.length > 0 && (
            <div className="pt-4 border-t border-slate/10 flex justify-end">
              <Link
                to={`/spaces/${spaceId}/loans?status=ACTIVE`}
                className="text-[11px] font-bold text-brass hover:underline flex items-center gap-1"
              >
                View Active Loans
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Right Column: Recent Activity Feed */}
        <div className="border border-slate/15 rounded-md p-6 bg-paper flex flex-col justify-between shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate/10 pb-3">
              <History className="w-4 h-4 text-brass" />
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
                Recent Space Log
              </h3>
            </div>

            {data.recent_activity.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate font-medium">
                No activity logged in this space yet.
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[320px] overflow-y-auto pr-1">
                {data.recent_activity.map((activity, idx) => (
                  <div key={idx} className="flex gap-3 text-xs">
                    <div className="p-1 rounded-full bg-slate/10 text-slate h-fit mt-0.5">
                      <Activity className="w-3 h-3 text-brass" />
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <p className="text-ink leading-snug">{activity.description}</p>
                      <div className="flex justify-between items-center text-[9px] text-slate font-medium">
                        <span>Actor: {activity.actor_name}</span>
                        <span>{formatDate(activity.timestamp, 'dd MMM, hh:mm a')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {data.recent_activity.length > 0 && (
            <div className="pt-4 border-t border-slate/10 flex justify-end">
              <Link
                to={`/spaces/${spaceId}/activity`}
                className="text-[11px] font-bold text-brass hover:underline flex items-center gap-1"
              >
                Full Activity History
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Inline Quick Actions */}
      <div className="flex flex-wrap gap-4 border-t border-slate/15 pt-6">
        <Link
          to={`/spaces/${spaceId}/loans/new`}
          className="bg-brass hover:bg-brass/90 text-paper px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <FilePlus className="w-4 h-4" />
          Record New Loan
        </Link>
        <Link
          to={`/spaces/${spaceId}/contacts`}
          className="border border-slate/35 hover:bg-slate/5 text-ink px-4 py-2 rounded-md text-xs font-semibold transition-colors"
        >
          Manage Contacts
        </Link>
      </div>
    </div>
  );
};
