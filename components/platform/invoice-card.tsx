'use client';
/** Square overview card for one invoice; disabled/non-clickable while processing. */


import { FileText, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { InvoiceSummary } from '@/lib/types';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { cn, formatCurrency } from '@/lib/utils';

interface InvoiceCardProps {
  invoice: InvoiceSummary;
  onClick: () => void;
}

export function InvoiceCard({ invoice, onClick }: InvoiceCardProps) {
  const isProcessing = invoice.status === 'Processing';
  const canClick = invoice.status !== 'Processing';

  return (
    <Card
      className={cn(
        'relative aspect-square cursor-pointer rounded-2xl bg-accent/40 transition-colors hover:bg-accent/50 focus-within:ring-2 focus-within:ring-ring',
        !canClick && 'cursor-not-allowed opacity-90'
      )}
      onClick={() => canClick && onClick()}
      tabIndex={canClick ? 0 : -1}
      onKeyDown={(e) => {
        if (canClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="flex h-full flex-col justify-between p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between">
            <FileText className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{invoice.invoiceNumber || '—'}</span>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium leading-tight line-clamp-2">{invoice.sourceFilename}</div>
            <div className="text-xs text-muted-foreground">{invoice.invoiceDate || 'No date'}</div>
            <div className="text-xs text-muted-foreground">
              {formatCurrency(invoice.totalInvoiceValue, invoice.currency)}
            </div>
            <div className="text-xs text-muted-foreground">{invoice.lineItemCount} line items</div>
          </div>
        </div>

        <div className="flex justify-end">
          <InvoiceStatusBadge status={invoice.status} weight="normal" />
        </div>

        {isProcessing && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background/85 shadow-sm">
              <Loader2 className="h-5 w-5 animate-spin text-foreground" />
              <span className="sr-only">Processing</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
