import { z } from 'zod';

const numericPreprocess = (val: any) => {
  if (val === '' || val === null || val === undefined) return undefined;
  const parsed = Number(val);
  return isNaN(parsed) ? val : parsed;
};

export const transactionSchema = z.object({
  type: z.enum([
    'PAYMENT_RECEIVED',
    'PAYMENT_MADE',
    'DISBURSEMENT',
    'MANUAL_ADJUSTMENT',
    'INTEREST_ACCRUED',
    'PENALTY_ACCRUED',
    'SETTLEMENT',
    'WRITE_OFF'
  ]),
  amount: z.preprocess(numericPreprocess, z.number({ message: 'Amount is required' })),
  transaction_date: z.string().min(1, 'Date is required'),
  collection_method: z.enum(['UPI', 'CASH', 'BANK_TRANSFER', 'ACH', 'OTHER']).optional().nullable(),
  note: z.string().optional().nullable(),
  adjustment_reason: z.string().optional().nullable(),
  allocations: z.array(
    z.object({
      schedule_line_id: z.number(),
      principal_component: z.preprocess(numericPreprocess, z.number().nonnegative().default(0)),
      interest_component: z.preprocess(numericPreprocess, z.number().nonnegative().default(0)),
      penalty_component: z.preprocess(numericPreprocess, z.number().nonnegative().default(0)).optional().nullable(),
    })
  ).optional().nullable(),
}).refine(
  (data) => {
    if (data.type !== 'MANUAL_ADJUSTMENT') {
      return data.amount > 0;
    }
    return data.amount !== 0;
  },
  {
    message: 'Amount must be positive for standard transactions',
    path: ['amount'],
  }
).refine(
  (data) => {
    if (data.type === 'MANUAL_ADJUSTMENT') {
      return !!data.adjustment_reason && data.adjustment_reason.trim().length > 0;
    }
    return true;
  },
  {
    message: 'Adjustment reason is required for manual adjustments',
    path: ['adjustment_reason'],
  }
);

export type TransactionInput = z.infer<typeof transactionSchema>;
