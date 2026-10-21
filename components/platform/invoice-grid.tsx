'use client';
/** Responsive grid of invoice overview cards. */


import { InvoiceSummary } from '@/lib/types';
import { InvoiceCard } from './invoice-card';

interface InvoiceGridProps {
  invoices: InvoiceSummary[];
  onInvoiceClick: (invoice: InvoiceSummary) => void;
}

export function InvoiceGrid({ invoices, onInvoiceClick }: InvoiceGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {invoices.map((invoice) => (
        <InvoiceCard key={invoice.id} invoice={invoice} onClick={() => onInvoiceClick(invoice)} />
      ))}
    </div>
  );
}
