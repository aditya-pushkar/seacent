'use client';
/** Composes the full invoice detail page: summary, reconciliation, source viewer, data panels. */


import { useState } from 'react';
import { Eye, EyeOff, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Invoice, FieldSourceLocation } from '@/lib/types';
import { InvoiceDetailHeader } from './invoice-detail-header';
import { InvoiceSummary } from './invoice-summary';
import { InvoiceSourceViewer } from './invoice-source-viewer';
import { HeaderDetailsSection } from './header-details-section';
import { LineItemsSection } from './line-items-section';
import { ReconciliationPanel } from './reconciliation-panel';
import { ValidationIssuesSection } from './validation-issues-section';

interface InvoiceDetailPageProps {
  invoice: Invoice;
  onBack: () => void;
}

export function InvoiceDetailPage({ invoice, onBack }: InvoiceDetailPageProps) {
  const [activeSource, setActiveSource] = useState<FieldSourceLocation | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(true);

  const handleViewSource = (key: string, label: string, source: FieldSourceLocation | null) => {
    setActiveSource(source);
    setSelectedLabel(label);
    setShowSource(true);
  };

  const issues = invoice.result.validation_issues;

  return (
    <div className="min-h-screen bg-background">
      <InvoiceDetailHeader invoice={invoice} onBack={onBack} />
      <div className="p-4 sm:p-6 space-y-6">
        <InvoiceSummary invoice={invoice} />
        <ReconciliationPanel invoice={invoice} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-6">
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full justify-between rounded-2xl bg-card px-4 py-3 text-left"
              onClick={() => setShowSource((s) => !s)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Source document
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {showSource ? 'Hide' : 'Show'}
                {showSource ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </span>
            </Button>
            {showSource && (
              <InvoiceSourceViewer
                key={`${activeSource?.page ?? 0}-${selectedLabel ?? ''}`}
                documentName={invoice.documentName}
                sourceFilename={invoice.sourceFilename}
                pages={invoice.pages}
                activeSource={activeSource}
                selectedLabel={selectedLabel}
              />
            )}
          </div>
          <div className="min-w-0 space-y-6">
            <HeaderDetailsSection
              header={invoice.result.header}
              confidence={invoice.result.confidence}
              onViewSource={handleViewSource}
            />
            <LineItemsSection
              items={invoice.result.line_items}
              confidence={invoice.result.confidence}
              onViewSource={handleViewSource}
            />
            <ValidationIssuesSection issues={issues} onViewSource={(source) => setActiveSource(source)} />
          </div>
        </div>
      </div>
    </div>
  );
}
