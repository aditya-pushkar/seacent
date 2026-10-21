"use client"
/** Invoice list page: heading, grid or empty state. */

import { InvoiceSummary } from "@/lib/types"
import { InvoiceGrid } from "./invoice-grid"
import { InvoiceEmptyState } from "./invoice-empty-state"

interface InvoiceOverviewPageProps {
  invoices: InvoiceSummary[]
  onInvoiceClick: (invoice: InvoiceSummary) => void
  onUploadClick: () => void
  isLoading?: boolean
  error?: unknown
}

export function InvoiceOverviewPage({
  invoices,
  onInvoiceClick,
  onUploadClick,
  isLoading = false,
  error,
}: InvoiceOverviewPageProps) {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Invoices</h1>
      </div>

      {!isLoading && !error && invoices.length === 0 ? (
        <InvoiceEmptyState onUploadClick={onUploadClick} />
      ) : (
        <InvoiceGrid invoices={invoices} onInvoiceClick={onInvoiceClick} />
      )}
    </div>
  )
}
