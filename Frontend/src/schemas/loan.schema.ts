import { z } from 'zod';

const numericPreprocess = (val: any) => {
  if (val === '' || val === null || val === undefined) return undefined;
  const parsed = Number(val);
  return isNaN(parsed) ? val : parsed;
};

export const loanSchema = z
  .object({
    contact_id: z.preprocess(numericPreprocess, z.number({ message: 'Contact is required' }).int()),
    direction: z.enum(['GIVEN', 'TAKEN']),
    principal_amount: z.preprocess(
      numericPreprocess,
      z.number({ message: 'Principal amount is required' }).positive('Amount must be positive')
    ),
    start_date: z.string().min(1, 'Start date is required'),
    first_due_date: z.string().optional().nullable(),
    tenure_periods: z.preprocess(numericPreprocess, z.number().int().positive().optional().nullable()),

    interest_type: z.enum(['NONE', 'FIXED', 'FLAT', 'REDUCING_BALANCE', 'COMPOUND', 'CUSTOM']),
    rate_value: z.preprocess(numericPreprocess, z.number().min(0, 'Rate must be non-negative').optional().nullable()),
    rate_period: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).optional().nullable(),
    fixed_interest_amount: z.preprocess(numericPreprocess, z.number().positive().optional().nullable()),
    fixed_interest_frequency: z.enum(['WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional().nullable(),
    interest_timing: z.enum(['UPFRONT', 'DEDUCTED_FROM_DISBURSEMENT', 'PAYABLE_PERIODICALLY', 'AT_END']),
    net_disbursed_amount: z.preprocess(numericPreprocess, z.number().positive().optional().nullable()),
    interest_rate_behavior: z.enum(['FIXED', 'VARIABLE', 'PROMOTIONAL']),
    promo_rate: z.preprocess(numericPreprocess, z.number().min(0).optional().nullable()),
    promo_period_days: z.preprocess(numericPreprocess, z.number().int().positive().optional().nullable()),

    repayment_type: z.enum(['ONE_TIME', 'EMI', 'INTEREST_ONLY', 'PRINCIPAL_ONLY', 'FLEXIBLE', 'CUSTOM_INSTALLMENTS']),
    payment_frequency: z.enum(['WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional().nullable(),
    payment_timing_rule: z.enum(['SCHEDULED', 'ANYTIME']),

    advance_payment_mode: z.enum(['CARRY_FORWARD_CREDIT', 'RECALCULATE_SCHEDULE']).optional().nullable(),
    penalty_type: z.enum(['NONE', 'FIXED', 'PERCENTAGE', 'EXTRA_INTEREST']),
    penalty_value: z.preprocess(numericPreprocess, z.number().min(0).optional().nullable()),
    grace_period_days: z.preprocess(numericPreprocess, z.number().int().min(0).optional().nullable()),
  })
  .refine(
    (data) => {
      // first_due_date required unless payment_timing_rule === 'ANYTIME'
      if (data.payment_timing_rule !== 'ANYTIME') {
        return !!data.first_due_date;
      }
      return true;
    },
    {
      message: 'First due date is required for scheduled payments',
      path: ['first_due_date'],
    }
  )
  .refine(
    (data) => {
      // first_due_date must be >= start_date
      if (data.first_due_date && data.start_date) {
        return data.first_due_date >= data.start_date;
      }
      return true;
    },
    {
      message: 'First due date cannot be before start date',
      path: ['first_due_date'],
    }
  )
  .refine(
    (data) => {
      // tenure_periods positive integer, required unless repayment_type is ONE_TIME or FLEXIBLE
      if (data.repayment_type !== 'ONE_TIME' && data.repayment_type !== 'FLEXIBLE' && data.repayment_type !== 'CUSTOM_INSTALLMENTS') {
        return data.tenure_periods !== null && data.tenure_periods !== undefined;
      }
      return true;
    },
    {
      message: 'Tenure periods is required',
      path: ['tenure_periods'],
    }
  )
  .refine(
    (data) => {
      // fixed_interest_amount & fixed_interest_frequency required when interest_type === 'FIXED'
      if (data.interest_type === 'FIXED') {
        return !!data.fixed_interest_amount && !!data.fixed_interest_frequency;
      }
      return true;
    },
    {
      message: 'Fixed interest amount and frequency are required',
      path: ['fixed_interest_amount'],
    }
  )
  .refine(
    (data) => {
      // rate_value & rate_period required when interest_type ∈ {FLAT, REDUCING_BALANCE, COMPOUND}
      if (['FLAT', 'REDUCING_BALANCE', 'COMPOUND'].includes(data.interest_type)) {
        return data.rate_value !== null && data.rate_value !== undefined && !!data.rate_period;
      }
      return true;
    },
    {
      message: 'Interest rate and period are required',
      path: ['rate_value'],
    }
  )
  .refine(
    (data) => {
      // net_disbursed_amount required when interest_timing === 'DEDUCTED_FROM_DISBURSEMENT'
      if (data.interest_timing === 'DEDUCTED_FROM_DISBURSEMENT') {
        return data.net_disbursed_amount !== null && data.net_disbursed_amount !== undefined;
      }
      return true;
    },
    {
      message: 'Net disbursed amount is required when interest is deducted upfront',
      path: ['net_disbursed_amount'],
    }
  )
  .refine(
    (data) => {
      // net_disbursed_amount must be < principal_amount
      if (
        data.interest_timing === 'DEDUCTED_FROM_DISBURSEMENT' &&
        data.net_disbursed_amount !== null &&
        data.net_disbursed_amount !== undefined
      ) {
        return data.net_disbursed_amount < data.principal_amount;
      }
      return true;
    },
    {
      message: 'Net disbursed amount must be less than the principal amount',
      path: ['net_disbursed_amount'],
    }
  )
  .refine(
    (data) => {
      // promo_period_days required when interest_rate_behavior === 'PROMOTIONAL'
      if (data.interest_rate_behavior === 'PROMOTIONAL') {
        return data.promo_period_days !== null && data.promo_period_days !== undefined;
      }
      return true;
    },
    {
      message: 'Promotional period is required',
      path: ['promo_period_days'],
    }
  )
  .refine(
    (data) => {
      // penalty_type === 'EXTRA_INTEREST' + interest_type === 'COMPOUND' is rejected client-side
      if (data.penalty_type === 'EXTRA_INTEREST' && data.interest_type === 'COMPOUND') {
        return false;
      }
      return true;
    },
    {
      message: 'Extra interest penalty cannot be combined with compound interest',
      path: ['penalty_type'],
    }
  );

export type LoanInput = z.infer<typeof loanSchema>;
