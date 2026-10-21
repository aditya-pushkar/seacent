/** Empty state shown when no invoices match the current search/filter. */

import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface InvoiceEmptyStateProps {
  onUploadClick: () => void;
}

export function InvoiceEmptyState({ onUploadClick }: InvoiceEmptyStateProps) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <Upload className="h-10 w-10 text-muted-foreground" />
        <div className="space-y-1">
          <h3 className="font-medium text-base">No invoices yet</h3>
          <p className="text-sm text-muted-foreground">Upload your first invoice to get started</p>
        </div>
        <Button onClick={onUploadClick} className="gap-2">
          <Upload className="h-4 w-4" />
          Upload Invoice
        </Button>
      </CardContent>
    </Card>
  );
}
