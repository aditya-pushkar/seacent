'use client';
/** Detail page header: back navigation, invoice identity, status badge, copy-JSON action. */

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Invoice } from '@/lib/types';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { CopyResultJsonButton } from './copy-result-json-button';

interface InvoiceDetailHeaderProps {
  invoice: Invoice;
  onBack: () => void;
}

export function InvoiceDetailHeader({ invoice, onBack }: InvoiceDetailHeaderProps) {
  return (
    <div className="border-b bg-background">
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to invoices
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-semibold text-xl">{invoice.invoiceNumber || invoice.id}</h1>
              <InvoiceStatusBadge status={invoice.status} weight="semibold" />
            </div>
            <div className="text-sm text-muted-foreground">
              {invoice.sourceFilename} • {invoice.invoiceDate || 'No date'}
            </div>
            <div className="text-sm text-muted-foreground">
              {invoice.currency} {invoice.totalInvoiceValue}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CopyResultJsonButton result={invoice.result} />
          </div>
        </div>
      </div>
    </div>
  );
}
