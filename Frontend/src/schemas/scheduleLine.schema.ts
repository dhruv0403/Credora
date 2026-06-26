import { z } from 'zod';

const numericPreprocess = (val: any) => {
  if (val === '' || val === null || val === undefined) return 0;
  const parsed = Number(val);
  return isNaN(parsed) ? val : parsed;
};

export const scheduleLineSchema = z.object({
  due_date: z.string().min(1, 'Due date is required'),
  principal_due: z.preprocess(numericPreprocess, z.number().nonnegative('Principal due must be non-negative')),
  interest_due: z.preprocess(numericPreprocess, z.number().nonnegative('Interest due must be non-negative').default(0)),
});

export const customScheduleLinesSchema = z.array(scheduleLineSchema);

export type ScheduleLineInput = z.infer<typeof scheduleLineSchema>;
