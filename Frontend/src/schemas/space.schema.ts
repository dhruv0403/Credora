import { z } from 'zod';

export const spaceSchema = z.object({
  name: z.string().min(1, 'Space name is required').max(100, 'Name must be 100 characters or less'),
  space_type: z.enum(['PERSONAL', 'BUSINESS']),
  space_visibility: z.enum(['PRIVATE', 'SHARED']),
  currency_code: z.string().length(3, 'Currency code must be exactly 3 characters (e.g. INR)').toUpperCase(),
});

export type SpaceInput = z.infer<typeof spaceSchema>;
