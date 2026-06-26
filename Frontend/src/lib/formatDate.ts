import { format, parseISO } from 'date-fns';

export const formatDate = (dateStr: string | Date | null | undefined, formatStr: string = 'dd MMM yyyy'): string => {
  if (!dateStr) return '—';
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return format(date, formatStr);
  } catch (error) {
    return '—';
  }
};

export const formatDateTime = (dateStr: string | Date | null | undefined): string => {
  return formatDate(dateStr, 'dd MMM yyyy, hh:mm a');
};
