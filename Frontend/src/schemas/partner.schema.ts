import { z } from 'zod';

const numericPreprocess = (val: any) => {
  if (val === '' || val === null || val === undefined) return undefined;
  const parsed = Number(val);
  return isNaN(parsed) ? val : parsed;
};

export const partnerSchema = z.object({
  space_member_id: z.preprocess(numericPreprocess, z.number({ message: 'Member is required' }).int()),
  initial_contribution_amount: z.preprocess(
    numericPreprocess,
    z.number().min(0, 'Contribution must be non-negative').optional().nullable()
  ),
  profit_share_percent: z.preprocess(
    numericPreprocess,
    z.number().min(0, 'Share must be at least 0%').max(100, 'Share cannot exceed 100%').optional().nullable()
  ),
});

export type PartnerInput = z.infer<typeof partnerSchema>;

export const partnerCapitalTransactionSchema = z.object({
  type: z.enum(['CONTRIBUTION', 'WITHDRAWAL']),
  amount: z.preprocess(
    numericPreprocess,
    z.number({ message: 'Amount is required' }).positive('Amount must be positive')
  ),
  transaction_date: z.string().min(1, 'Date is required'),
  note: z.string().optional().nullable(),
});

export type PartnerCapitalTransactionInput = z.infer<typeof partnerCapitalTransactionSchema>;
