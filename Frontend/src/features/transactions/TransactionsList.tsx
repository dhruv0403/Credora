import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listTransactions } from '@/api/transactions';
import { ResponsiveList } from '@/components/shared/ResponsiveList';
import type { ColumnDef } from '@/components/shared/ResponsiveList';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDate } from '@/lib/formatDate';
import { Receipt, Filter, RefreshCcw } from 'lucide-react';

const PAGE_SIZE = 10;

export const TransactionsList: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const parsedSpaceId = Number(spaceId);

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Fetch Transactions List
  const { data, isLoading } = useQuery({
    queryKey: ['transactions', parsedSpaceId, page, typeFilter, dateFrom, dateTo],
    queryFn: () =>
      listTransactions(parsedSpaceId, {
        page,
        type: typeFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled: !isNaN(parsedSpaceId),
  });

  const transactions = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleResetFilters = () => {
    setTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  // Define Table Columns
  const columns: ColumnDef<any>[] = [
    {
      header: 'Date',
      cell: (t) => (
        <span className={t.is_reversed ? 'line-through text-slate/50' : 'text-ink'}>
          {formatDate(t.transaction_date)}
        </span>
      ),
      className: 'text-xs font-mono',
    },
    {
      header: 'Link & Contact',
      cell: (t) => (
        <div className={t.is_reversed ? 'line-through text-slate/50 space-y-0.5' : 'space-y-0.5'}>
          <Link
            to={`/spaces/${spaceId}/loans/${t.loan_id}`}
            className="font-bold text-ink hover:text-brass transition-colors block text-xs"
          >
            Contract #{t.loan_id}
          </Link>
          <span className="text-[10px] text-slate font-medium">
            {t.loan_contact_name || 'Counterparty'}
          </span>
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (t) => (
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={`text-[9px] font-bold py-0.5 ${
              t.is_reversed
                ? 'border-slate/15 text-slate bg-slate/5 line-through'
                : t.type.includes('RECEIVED') || t.type.includes('PAYMENT_')
                ? 'border-receivable/20 bg-receivable/5 text-receivable'
                : 'border-brass/20 bg-brass/5 text-brass'
            }`}
          >
            {t.type.replace('_', ' ')}
          </Badge>
          {t.is_reversed && (
            <span className="text-[8px] bg-payable/10 text-payable font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
              Reversed
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Amount',
      cell: (t) => (
        <span
          className={`font-bold font-figures ${
            t.is_reversed
              ? 'line-through text-slate/40'
              : t.type.includes('PAYMENT_RECEIVED') || t.type === 'DISBURSEMENT'
              ? 'text-receivable'
              : 'text-payable'
          }`}
        >
          {formatCurrency(t.amount, 'INR')}
        </span>
      ),
      className: 'text-right font-figures text-xs',
      headerClassName: 'text-right',
    },
    {
      header: 'Method',
      cell: (t) => (
        <span className={t.is_reversed ? 'line-through text-slate/40 text-xs' : 'text-slate text-xs'}>
          {t.collection_method || '—'}
        </span>
      ),
    },
    {
      header: 'Audit Note / Reason',
      cell: (t) => (
        <span
          className={t.is_reversed ? 'line-through text-slate/40 text-xs' : 'text-ink/80 text-xs'}
          title={t.note || t.adjustment_reason}
        >
          {t.note || t.adjustment_reason || '—'}
        </span>
      ),
      className: 'max-w-xs truncate',
    },
  ];

  // Define Mobile Card view
  const cardRenderer = (t: any) => (
    <div
      className={`bg-paper border border-slate/15 rounded-md p-4 space-y-3 shadow-sm hover:border-slate/30 transition-colors ${
        t.is_reversed ? 'opacity-60 bg-slate/5' : ''
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-0.5">
          <Link
            to={`/spaces/${spaceId}/loans/${t.loan_id}`}
            className={`font-bold text-ink hover:text-brass text-xs ${t.is_reversed ? 'line-through' : ''}`}
          >
            Contract #{t.loan_id}
          </Link>
          <span className="text-[10px] text-slate block font-medium">
            {t.loan_contact_name || 'Counterparty'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className={`text-[8px] font-bold uppercase ${
              t.type.includes('RECEIVED') ? 'border-receivable/20 text-receivable' : 'border-brass/20 text-brass'
            }`}
          >
            {t.type.substring(0, 15).replace('_', ' ')}
          </Badge>
          {t.is_reversed && (
            <span className="text-[8px] bg-payable/15 text-payable font-bold px-1 rounded">REV</span>
          )}
        </div>
      </div>

      <div className="flex justify-between items-end">
        <div className="text-[10px] text-slate font-mono space-y-0.5">
          <div>Date: {formatDate(t.transaction_date)}</div>
          {t.collection_method && <div>Method: {t.collection_method}</div>}
        </div>
        <div
          className={`font-serif text-base font-bold font-figures ${
            t.type.includes('RECEIVED') ? 'text-receivable' : 'text-payable'
          } ${t.is_reversed ? 'line-through opacity-50' : ''}`}
        >
          {formatCurrency(t.amount, 'INR')}
        </div>
      </div>

      {(t.note || t.adjustment_reason) && (
        <p className="text-[10px] text-slate italic bg-slate/5 p-2 rounded border border-slate/10 truncate">
          {t.note || t.adjustment_reason}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Title */}
      <div className="pb-3 border-b border-slate/15">
        <h1 className="font-serif text-3xl font-bold text-ink">Transactions Ledger</h1>
        {/* Signature brass underline tick */}
        <div className="h-0.5 w-8 bg-brass mt-1 rounded-full" />
      </div>

      {/* Filters Row */}
      <div className="border border-slate/15 bg-paper rounded-md p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-1 text-xs font-bold text-ink border-b border-slate/10 pb-1.5">
          <Filter className="w-3.5 h-3.5 text-brass" />
          Filter Transactions
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-slate uppercase">Type</Label>
            <Select value={typeFilter} onValueChange={(val: any) => setTypeFilter(val === 'ALL' ? '' : val)}>
              <SelectTrigger className="bg-paper border-slate/30 text-ink text-xs h-9">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent className="bg-paper border-slate/15 text-ink text-xs">
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="PAYMENT_RECEIVED">Payment Received</SelectItem>
                <SelectItem value="PAYMENT_MADE">Payment Made</SelectItem>
                <SelectItem value="DISBURSEMENT">Disbursement</SelectItem>
                <SelectItem value="MANUAL_ADJUSTMENT">Manual Adjustment</SelectItem>
                <SelectItem value="INTEREST_ACCRUED">Interest Accrued</SelectItem>
                <SelectItem value="PENALTY_ACCRUED">Penalty Accrued</SelectItem>
                <SelectItem value="SETTLEMENT">Settlement</SelectItem>
                <SelectItem value="WRITE_OFF">Write Off</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="date_from" className="text-[10px] font-semibold text-slate uppercase">From Date</Label>
            <Input
              id="date_from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-paper border-slate/30 text-ink text-xs h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="date_to" className="text-[10px] font-semibold text-slate uppercase">To Date</Label>
            <Input
              id="date_to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-paper border-slate/30 text-ink text-xs h-9"
            />
          </div>

          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="w-full text-xs font-semibold border-slate/30 text-ink hover:bg-slate/5 h-9"
            >
              <RefreshCcw className="w-3.5 h-3.5 mr-1" />
              Reset Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <ResponsiveList
        data={transactions}
        columns={columns}
        cardRenderer={cardRenderer}
        isLoading={isLoading}
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyState={
          <EmptyState
            icon={<Receipt className="w-8 h-8 text-slate/80" />}
            title="No transactions logged"
            description="All repayments, disbursements, interest charges, and moratoria will appear in this ledger."
          />
        }
      />
    </div>
  );
};
