import { z } from 'zod';

const numericPreprocess = (val: any) => {
  if (val === '' || val === null || val === undefined) return undefined;
  const parsed = Number(val);
  return isNaN(parsed) ? val : parsed;
};

export const expenseSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  amount: z.preprocess(
    numericPreprocess,
    z.number({ message: 'Amount is required' }).positive('Amount must be positive')
  ),
  date: z.string().min(1, 'Date is required'),
  note: z.string().optional().nullable(),
  loan_id: z.preprocess(numericPreprocess, z.number().int().positive().optional().nullable()),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
