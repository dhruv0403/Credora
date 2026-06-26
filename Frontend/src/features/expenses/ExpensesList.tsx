import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listExpenses, createExpense, updateExpense, deleteExpense } from '@/api/expenses';
import { listLoans } from '@/api/loans';
import { expenseSchema } from '@/schemas/expense.schema';
import type { ExpenseInput } from '@/schemas/expense.schema';
import { ResponsiveList } from '@/components/shared/ResponsiveList';
import type { ColumnDef } from '@/components/shared/ResponsiveList';
import { EmptyState } from '@/components/shared/EmptyState';
import { ServerMessage } from '@/components/shared/ServerMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDate } from '@/lib/formatDate';
import { CreditCard, Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

export const ExpensesList: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const parsedSpaceId = Number(spaceId);
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [serverError, setServerError] = useState<any>(null);

  // Form for Creation/Edit
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(expenseSchema) as any,
    defaultValues: {
      category: 'MARKETING',
      amount: 0,
      date: new Date().toISOString().substring(0, 10),
      note: '',
      loan_id: null,
    },
  });

  // Query expenses
  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses', parsedSpaceId],
    queryFn: () => listExpenses(parsedSpaceId),
    enabled: !isNaN(parsedSpaceId),
  });

  // Query active loans to link expenses
  const { data: loansData } = useQuery({
    queryKey: ['active-loans-for-link', parsedSpaceId],
    queryFn: () => listLoans(parsedSpaceId, { status: 'ACTIVE' }),
    enabled: !isNaN(parsedSpaceId) && isModalOpen,
  });
  const activeLoans = loansData?.results || [];

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: (data: ExpenseInput) =>
      createExpense(parsedSpaceId, {
        ...data,
        amount: data.amount.toString(),
        loan_id: data.loan_id || null,
      }),
    onSuccess: () => {
      toast.success('Expense recorded successfully!');
      queryClient.invalidateQueries({ queryKey: ['expenses', parsedSpaceId] });
      setIsModalOpen(false);
      setServerError(null);
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: (data: ExpenseInput) =>
      updateExpense(parsedSpaceId, editingExpenseId!, {
        ...data,
        amount: data.amount.toString(),
        loan_id: data.loan_id || null,
      }),
    onSuccess: () => {
      toast.success('Expense updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['expenses', parsedSpaceId] });
      setIsModalOpen(false);
      setServerError(null);
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteExpense(parsedSpaceId, id),
    onSuccess: () => {
      toast.success('Expense record deleted.');
      queryClient.invalidateQueries({ queryKey: ['expenses', parsedSpaceId] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete expense');
    },
  });

  const onSubmit = (data: any) => {
    setServerError(null);
    const payload = {
      ...data,
      amount: Number(data.amount),
      loan_id: data.loan_id ? Number(data.loan_id) : null,
    };
    if (editingExpenseId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const openCreateModal = () => {
    setServerError(null);
    setEditingExpenseId(null);
    reset({
      category: 'MARKETING',
      amount: 0,
      date: new Date().toISOString().substring(0, 10),
      note: '',
      loan_id: null,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (expense: any) => {
    setServerError(null);
    setEditingExpenseId(expense.id);
    reset({
      category: expense.category,
      amount: parseFloat(expense.amount),
      date: expense.date,
      note: expense.note || '',
      loan_id: expense.loan_id ? expense.loan_id.toString() : null,
    });
    setIsModalOpen(true);
  };

  const handleDeleteExpense = (id: number) => {
    if (window.confirm('Delete this expense? This action is permanent.')) {
      deleteMutation.mutate(id);
    }
  };

  // Define Columns
  const columns: ColumnDef<any>[] = [
    {
      header: 'Date',
      cell: (e) => formatDate(e.date),
      className: 'text-xs font-mono',
    },
    {
      header: 'Category',
      cell: (e) => (
        <Badge variant="outline" className="text-[10px] font-bold border-slate/30 text-ink bg-slate/5 py-0.5">
          {e.category}
        </Badge>
      ),
    },
    {
      header: 'Amount',
      cell: (e) => formatCurrency(e.amount, 'INR'),
      className: 'font-bold text-payable font-figures text-xs text-right',
      headerClassName: 'text-right',
    },
    {
      header: 'Linked Loan',
      cell: (e) =>
        e.loan_id ? (
          <Link
            to={`/spaces/${spaceId}/loans/${e.loan_id}`}
            className="font-bold text-ink hover:text-brass transition-colors text-xs"
          >
            Contract #{e.loan_id}
            {e.loan_contact_name && <span className="text-[9px] text-slate block font-medium">({e.loan_contact_name})</span>}
          </Link>
        ) : (
          <span className="text-slate text-xs">—</span>
        ),
    },
    {
      header: 'Note',
      cell: (e) => e.note || '—',
      className: 'text-xs text-ink/80 max-w-xs truncate',
    },
    {
      header: 'Actions',
      cell: (e) => (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="icon"
            onClick={() => openEditModal(e)}
            className="w-7 h-7 border-slate/30 text-ink hover:bg-slate/5"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleDeleteExpense(e.id)}
            className="w-7 h-7 border-payable/30 text-payable hover:bg-payable/5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
      className: 'w-20',
      headerClassName: 'text-right pr-4',
    },
  ];

  // Define Mobile Card view
  const cardRenderer = (e: any) => (
    <div className="bg-paper border border-slate/15 rounded-md p-4 space-y-3 shadow-sm hover:border-slate/30 transition-colors">
      <div className="flex justify-between items-start">
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate font-mono">{formatDate(e.date)}</span>
          <Badge variant="outline" className="text-[9px] font-bold border-slate/20 text-ink bg-slate/5 block w-fit">
            {e.category}
          </Badge>
        </div>
        <div className="font-serif text-base font-bold text-payable font-figures">
          {formatCurrency(e.amount, 'INR')}
        </div>
      </div>

      <div className="flex justify-between items-end text-[10px] pt-1">
        <div>
          {e.loan_id ? (
            <Link to={`/spaces/${spaceId}/loans/${e.loan_id}`} className="font-bold text-ink hover:text-brass">
              Contract #{e.loan_id}
            </Link>
          ) : (
            <span className="text-slate font-medium">Unlinked Expense</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => openEditModal(e)} className="text-brass hover:underline font-bold">
            Edit
          </button>
          <button onClick={() => handleDeleteExpense(e.id)} className="text-payable hover:underline font-bold">
            Delete
          </button>
        </div>
      </div>

      {e.note && (
        <p className="text-[10px] text-slate italic bg-slate/5 p-2 rounded border border-slate/10 truncate">
          {e.note}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Title */}
      <div className="flex justify-between items-center pb-3 border-b border-slate/15">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink">Expenses</h1>
          {/* Signature brass underline tick */}
          <div className="h-0.5 w-8 bg-brass mt-1 rounded-full" />
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-brass hover:bg-brass/90 text-paper font-semibold text-xs py-2 px-3 rounded flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Record Expense
        </Button>
      </div>

      {/* Expenses list */}
      <ResponsiveList
        data={expenses}
        columns={columns}
        cardRenderer={cardRenderer}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={<CreditCard className="w-8 h-8 text-slate/80" />}
            title="No expenses registered"
            description="Track business operations, office costs, or transaction-linked fees here."
            action={{
              label: 'Record Expense',
              onClick: openCreateModal,
            }}
          />
        }
      />

      {/* Record/Edit Expense Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md bg-paper border border-slate/15 shadow-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-ink font-bold">
              {editingExpenseId ? 'Edit Expense Record' : 'Record Expense'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate">
              Record business costs or link them directly to a specific loan contract.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <ServerMessage error={serverError} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-ink">Category</Label>
                <Select
                  defaultValue="MARKETING"
                  onValueChange={(val: any) => setValue('category', val)}
                >
                  <SelectTrigger className="bg-paper border-slate/30 text-ink text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-paper border-slate/15 text-ink text-xs">
                    <SelectItem value="MARKETING">Marketing / Client Acquisition</SelectItem>
                    <SelectItem value="OFFICE_RENT">Office Rent</SelectItem>
                    <SelectItem value="SALARIES">Staff Salaries</SelectItem>
                    <SelectItem value="LEGAL">Legal & Regulatory</SelectItem>
                    <SelectItem value="TRAVEL">Field Travel Costs</SelectItem>
                    <SelectItem value="UTILITIES">Utilities & Software</SelectItem>
                    <SelectItem value="OTHER">Other Miscellaneous</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="exp_amount" className="text-xs font-semibold text-ink">Amount</Label>
                <Input
                  id="exp_amount"
                  type="number"
                  step="0.01"
                  className="bg-paper border-slate/30 text-ink text-xs h-9"
                  {...register('amount')}
                />
                {errors.amount && (
                  <p className="text-[10px] text-payable font-medium">{errors.amount.message as string}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="exp_date" className="text-xs font-semibold text-ink">Expense Date</Label>
                <Input
                  id="exp_date"
                  type="date"
                  className="bg-paper border-slate/30 text-ink text-xs h-9"
                  {...register('date')}
                />
                {errors.date && (
                  <p className="text-[10px] text-payable font-medium">{errors.date.message as string}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-ink">Link to Active Loan (Optional)</Label>
                <Select
                  onValueChange={(val: any) => setValue('loan_id', val === 'NONE' ? null : val)}
                >
                  <SelectTrigger className="bg-paper border-slate/30 text-ink text-xs h-9">
                    <SelectValue placeholder="Do not link" />
                  </SelectTrigger>
                  <SelectContent className="bg-paper border-slate/15 text-ink text-xs">
                    <SelectItem value="NONE">Do not link</SelectItem>
                    {activeLoans.map((l) => (
                      <SelectItem key={l.id} value={l.id.toString()}>
                        Contract #{l.id} ({l.contact_name || `ID #${l.contact_id}`})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="exp_note" className="text-xs font-semibold text-ink">Notes / Description</Label>
              <Textarea
                id="exp_note"
                placeholder="Details of expense..."
                className="bg-paper border-slate/30 text-ink text-xs min-h-[60px]"
                {...register('note')}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="text-xs border-slate/30 text-ink hover:bg-slate/5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Record Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
