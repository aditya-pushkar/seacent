/** Maps an invoice status to its badge label and colour variant. */

import { Badge } from '@/components/ui/badge';
import { InvoiceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  weight?: 'normal' | 'semibold';
}

export function InvoiceStatusBadge({ status, weight = 'normal' }: InvoiceStatusBadgeProps) {
  const variants: Record<InvoiceStatus, string> = {
    'Queued': 'bg-muted text-muted-foreground',
    'Processing': 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100',
    'Succeeded': 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-100',
    'Needs review': 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100',
    'Failed': 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100',
    'Rejected': 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100',
  };

  return (
    <Badge className={cn(variants[status], weight === 'semibold' ? 'font-semibold' : 'font-normal')}>
      {status}
    </Badge>
  );
}
