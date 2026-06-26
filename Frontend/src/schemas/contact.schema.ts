import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  relationship_tag: z.string().min(1, 'Relationship tag is required'),
  phone: z.string().optional().nullable().refine(
    (val) => !val || /^\+?[0-9\s\-()]{7,20}$/.test(val),
    {
      message: 'Invalid phone number format',
    }
  ),
  email: z.string().optional().nullable().refine(
    (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    {
      message: 'Invalid email address format',
    }
  ),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type ContactInput = z.infer<typeof contactSchema>;
