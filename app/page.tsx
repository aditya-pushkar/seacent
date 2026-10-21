'use client';
/** Overview route: real invoice list, upload, and request-bound processing. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { InvoiceSummary } from '@/lib/types';
import { apiErrorMessage, getInvoiceListRefreshInterval } from '@/lib/utils';
import { getInvoices, processInvoice, uploadInvoice } from '@/lib/fetchers';
import { AppNavbar } from '@/components/platform/app-navbar';
import { InvoiceOverviewPage } from '@/components/platform/invoice-overview-page';
import { UploadInvoiceDialog } from '@/components/platform/upload-invoice-dialog';

export default function Page() {
  const router = useRouter();
  const { data, isLoading, error, mutate } = useSWR('invoices', getInvoices, {
    refreshInterval: (latest) => getInvoiceListRefreshInterval(latest?.invoices),
  });
  const invoices = data?.invoices ?? [];
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleInvoiceClick = (invoice: InvoiceSummary) => {
    router.push(`/invoices/${invoice.id}`);
  };

  const handleUpload = async (files: File[]) => {
    const ids: string[] = [];
    for (const file of files) {
      const { invoiceId } = await uploadInvoice(file);
      ids.push(invoiceId);
    }

    await mutate();
    void mutate(
      (current) =>
        current
          ? {
              invoices: current.invoices.map((invoice) =>
                ids.includes(invoice.id)
                  ? {
                      ...invoice,
                      status: 'Processing' as const,
                      machineStatus: 'processing' as const,
                      lastUpdated: new Date().toISOString(),
                    }
                  : invoice,
              ),
            }
          : current,
      { revalidate: false },
    );

    void Promise.all(
      ids.map(async (id) => {
        try {
          await processInvoice(id);
        } catch (error) {
          toast.error(apiErrorMessage(error));
        } finally {
          await mutate();
        }
      }),
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar onUploadClick={() => setUploadOpen(true)} />
      <InvoiceOverviewPage
        invoices={invoices}
        isLoading={isLoading}
        error={error}
        onInvoiceClick={handleInvoiceClick}
        onUploadClick={() => setUploadOpen(true)}
      />
      <UploadInvoiceDialog open={uploadOpen} onOpenChange={setUploadOpen} onUpload={handleUpload} />
    </div>
  );
}
