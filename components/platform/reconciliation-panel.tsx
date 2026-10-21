'use client';
/** Shows arithmetic reconciliation status, invoice totals and review reasons. */


import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Invoice } from '@/lib/types';
import { InvoiceStatusBadge } from './invoice-status-badge';

interface ReconciliationPanelProps {
  invoice: Invoice;
}

export function ReconciliationPanel({ invoice }: ReconciliationPanelProps) {
  const { result } = invoice;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Arithmetic Reconciliation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">Status</span>
          <span className="text-sm font-medium">{result.is_arithmetic_valid ? 'Valid' : 'Invalid'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Invoice Status</span>
          <InvoiceStatusBadge status={invoice.status} weight="semibold" />
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div>Document: {result.document}</div>
          <div>Printed total: {invoice.totalInvoiceValue ?? 'N/A'} {invoice.currency}</div>
          <div>Line items: {invoice.lineItemCount}</div>
          {result.review_reasons.length > 0 && (
            <div>
              <div className="font-medium text-foreground">Review reasons:</div>
              <ul className="list-disc list-inside space-y-1">
                {result.review_reasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
