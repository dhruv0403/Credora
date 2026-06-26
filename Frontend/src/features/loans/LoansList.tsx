import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listLoans } from '@/api/loans';
import type { Loan, LoanListParams } from '@/api/loans';
import { useSpace } from '@/app/SpaceContext';
import { ResponsiveList } from '@/components/shared/ResponsiveList';
import type { ColumnDef } from '@/components/shared/ResponsiveList';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DirectionBadge } from '@/components/shared/DirectionBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDate } from '@/lib/formatDate';
import { Button } from '@/components/ui/button';
import { Search, FilePlus, AlertCircle } from 'lucide-react';

type TabType = 'all' | 'given' | 'taken' | 'active' | 'overdue' | 'closed' | 'written_off';

export const LoansList: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const parsedSpaceId = Number(spaceId);
  const navigate = useNavigate();
  const { currentRole, currentSpace } = useSpace();

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [page, setPage] = useState(1);

  // Map active tab to API filter params
  const getFilterParams = (): LoanListParams => {
    const params: LoanListParams = { page };

    if (activeTab === 'given') {
      params.direction = 'GIVEN';
    } else if (activeTab === 'taken') {
      params.direction = 'TAKEN';
    } else if (activeTab === 'active') {
      params.status = 'ACTIVE';
    } else if (activeTab === 'overdue') {
      params.is_overdue = true;
    } else if (activeTab === 'closed') {
      params.status = 'CLOSED';
    } else if (activeTab === 'written_off') {
      params.closure_reason = 'WRITTEN_OFF';
    }

    return params;
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['loans', parsedSpaceId, activeTab, page],
    queryFn: () => listLoans(parsedSpaceId, getFilterParams()),
    enabled: !isNaN(parsedSpaceId),
  });

  const isFieldMan = currentRole === 'FIELDMAN';
  const currencyCode = currentSpace?.currency_code || 'INR';

  // Columns for desktop Table
  const columns: ColumnDef<Loan>[] = [
    {
      header: 'Contact',
      cell: (loan) => (
        <Link
          to={`/spaces/${spaceId}/loans/${loan.id}`}
          className="font-semibold text-brass hover:underline"
        >
          {loan.contact_name || `Contact #${loan.contact_id}`}
        </Link>
      ),
    },
    {
      header: 'Direction',
      cell: (loan) => <DirectionBadge direction={loan.direction} />,
    },
    {
      header: 'Principal',
      className: 'font-figures',
      cell: (loan) => formatCurrency(loan.principal_amount, currencyCode),
    },
    {
      header: 'Outstanding',
      className: 'font-semibold font-figures',
      cell: (loan) => formatCurrency(loan.outstanding_balance, currencyCode),
    },
    {
      header: 'Status',
      cell: (loan) => <StatusBadge status={loan.status === 'CLOSED' && loan.closure_reason === 'WRITTEN_OFF' ? 'WRITTEN_OFF' : loan.status} isOverdue={loan.is_overdue} />,
    },
    {
      header: 'Start Date',
      cell: (loan) => formatDate(loan.start_date),
    },
  ];

  // Mobile card renderer
  const renderCard = (loan: Loan) => {
    return (
      <div
        onClick={() => navigate(`/spaces/${spaceId}/loans/${loan.id}`)}
        className="bg-paper border border-slate/15 p-4 rounded-md shadow-sm active:bg-slate/5 transition-colors space-y-3 cursor-pointer"
      >
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-bold text-ink">{loan.contact_name || `Contact #${loan.contact_id}`}</h4>
            <span className="text-[10px] text-slate font-medium">{formatDate(loan.start_date)}</span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <DirectionBadge direction={loan.direction} />
            <StatusBadge status={loan.status === 'CLOSED' && loan.closure_reason === 'WRITTEN_OFF' ? 'WRITTEN_OFF' : loan.status} isOverdue={loan.is_overdue} />
          </div>
        </div>

        <div className="flex justify-between items-baseline pt-2 border-t border-slate/10">
          <span className="text-[10px] text-slate font-semibold uppercase tracking-wider">Outstanding</span>
          <span className="text-base font-bold font-figures text-ink">
            {formatCurrency(loan.outstanding_balance, currencyCode)}
          </span>
        </div>
      </div>
    );
  };

  const tabs: { value: TabType; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'given', label: 'Lent' },
    { value: 'taken', label: 'Borrowed' },
    { value: 'active', label: 'Active' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'closed', label: 'Closed' },
    { value: 'written_off', label: 'Written Off' },
  ];

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header quick actions */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        {/* Simple Tab Bar */}
        <div className="flex border-b border-slate/15 overflow-x-auto max-w-full no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all border-b-2 -mb-px ${
                activeTab === tab.value
                  ? 'border-brass text-brass font-bold'
                  : 'border-transparent text-slate hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!isFieldMan && (
          <Button
            onClick={() => navigate(`/spaces/${spaceId}/loans/new`)}
            className="bg-brass hover:bg-brass/90 text-paper font-semibold text-xs py-2 px-4 rounded flex items-center gap-1.5 shadow-sm"
          >
            <FilePlus className="w-4 h-4" />
            New Loan
          </Button>
        )}
      </div>

      {error ? (
        <EmptyState
          icon={<AlertCircle className="w-8 h-8 text-payable" />}
          title="Error loading loans"
          description="We couldn't pull the loans database. Check your API endpoint configurations."
          action={{
            label: 'Retry Fetch',
            onClick: () => refetch(),
          }}
        />
      ) : (
        <ResponsiveList
          data={data?.results}
          columns={columns}
          cardRenderer={renderCard}
          isLoading={isLoading}
          currentPage={page}
          totalPages={data ? Math.ceil(data.count / 20) : 1}
          onPageChange={setPage}
          emptyState={
            <EmptyState
              icon={<Search className="w-8 h-8 text-slate" />}
              title="No loans found"
              description={
                activeTab === 'all'
                  ? 'No loans recorded in this space yet.'
                  : `No records found under the "${activeTab.replace('_', ' ')}" filters.`
              }
              action={
                !isFieldMan
                  ? {
                      label: 'Record New Loan',
                      onClick: () => navigate(`/spaces/${spaceId}/loans/new`),
                    }
                  : undefined
              }
            />
          }
        />
      )}
    </div>
  );
};
