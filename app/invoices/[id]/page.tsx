'use client';
/** Detail route: loads one invoice and its extracted result. */

import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { getInvoice } from '@/lib/fetchers';
import { apiErrorMessage, getInvoiceRefreshInterval } from '@/lib/utils';
import { InvoiceDetailPage } from '@/components/platform/invoice-detail-page';
import { AppNavbar } from '@/components/platform/app-navbar';
import { Button } from '@/components/ui/button';

export default function InvoiceDetailRoute() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ? String(params.id) : null;
  const { data, isLoading, error } = useSWR(
    id ? `invoice:${id}` : null,
    () => getInvoice(id as string),
    { refreshInterval: (latest) => getInvoiceRefreshInterval(latest?.invoice) },
  );
  const invoice = data?.invoice ?? null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppNavbar onUploadClick={() => router.push('/')} />
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading invoice...
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-background">
        <AppNavbar onUploadClick={() => router.push('/')} />
        <div className="space-y-4 p-6 text-center">
          <div>{error ? apiErrorMessage(error) : 'Invoice not found'}</div>
          <Button variant="outline" onClick={() => router.push('/')}>
            Back to invoices
          </Button>
        </div>
      </div>
    );
  }

  return <InvoiceDetailPage invoice={invoice} onBack={() => router.push('/')} />;
}
