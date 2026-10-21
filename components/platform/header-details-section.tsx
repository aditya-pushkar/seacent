'use client';
/** Groups and renders all extracted invoice header fields (info, parties, charges/taxes). */


import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InvoiceHeader, ConfidenceData, FieldSourceLocation } from '@/lib/types';
import { InvoiceField } from './invoice-field';

interface HeaderDetailsSectionProps {
  header: Partial<InvoiceHeader>;
  confidence: ConfidenceData;
  onViewSource: (key: string, label: string, source: FieldSourceLocation | null) => void;
}

export function HeaderDetailsSection({ header, confidence, onViewSource }: HeaderDetailsSectionProps) {
  const get = (key: keyof InvoiceHeader) => header[key] ?? null;
  const field = (label: string, key: keyof InvoiceHeader) => (
    <InvoiceField
      label={label}
      value={get(key)}
      metadata={confidence[key]}
      onViewSource={() => onViewSource(key, label, confidence[key]?.source ?? null)}
    />
  );

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Invoice Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {field('Invoice Number', 'invoice_number')}
          {field('Invoice Date', 'invoice_date')}
          {field('Currency', 'currency')}
          {field('Total Invoice Value', 'total_invoice_value')}
          {field('Source File', 'source_file')}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Parties</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {field('Seller Name', 'seller_name')}
          {field('Seller Tax ID', 'seller_tax_id')}
          {field('Buyer Name', 'buyer_name')}
          {field('Buyer Tax ID', 'buyer_tax_id')}
          {field('Buyer IEC', 'buyer_iec')}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Charges & Taxes</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {field('Freight Charges', 'freight_charges')}
          {field('Freight Currency', 'freight_currency')}
          {field('Insurance Charges', 'insurance_charges')}
          {field('Insurance Currency', 'insurance_currency')}
          {field('Other Charges', 'other_charges')}
          {field('Total Tax Amount', 'total_tax_amount')}
        </CardContent>
      </Card>
    </div>
  );
}
