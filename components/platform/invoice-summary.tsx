/** Compact summary strip: invoice number, date, total, line-item count. */

import { Card } from '@/components/ui/card';
import { Invoice } from '@/lib/types';

interface InvoiceSummaryProps {
  invoice: Invoice;
}

export function InvoiceSummary({ invoice }: InvoiceSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="p-3 rounded-xl">
        <div className="text-xs text-muted-foreground">Invoice #</div>
        <div className="text-sm font-medium">{invoice.invoiceNumber || '—'}</div>
      </Card>
      <Card className="p-3 rounded-xl">
        <div className="text-xs text-muted-foreground">Date</div>
        <div className="text-sm font-medium">{invoice.invoiceDate || '—'}</div>
      </Card>
      <Card className="p-3 rounded-xl">
        <div className="text-xs text-muted-foreground">Total</div>
        <div className="text-sm font-medium">
          {invoice.currency} {invoice.totalInvoiceValue || '—'}
        </div>
      </Card>
      <Card className="p-3 rounded-xl">
        <div className="text-xs text-muted-foreground">Line Items</div>
        <div className="text-sm font-medium">{invoice.lineItemCount}</div>
      </Card>
    </div>
  );
}
