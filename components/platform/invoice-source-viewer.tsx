'use client';
/** Document viewer: real page PNGs from the API with provenance highlighting. */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FieldSourceLocation, InvoicePage } from '@/lib/types';
import { SourceHighlightOverlay } from './source-highlight-overlay';

interface InvoiceSourceViewerProps {
  documentName: string;
  sourceFilename: string;
  pages: InvoicePage[];
  activeSource?: FieldSourceLocation | null;
  selectedLabel?: string | null;
}

export function InvoiceSourceViewer({
  documentName,
  sourceFilename,
  pages,
  activeSource,
  selectedLabel,
}: InvoiceSourceViewerProps) {
  const [currentPage, setCurrentPage] = useState(activeSource?.page ?? 1);
  const [zoom, setZoom] = useState(100);

  const totalPages = Math.max(1, pages.length);
  const pageNumber = Math.min(Math.max(1, currentPage), totalPages);
  const page = pages.find((entry) => entry.page === pageNumber) ?? pages[0] ?? null;
  const showHighlight = page !== null && activeSource?.page === page.page;

  return (
    <Card className="rounded-2xl h-fit sticky top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Original Document</CardTitle>
        <div className="text-xs text-muted-foreground">{sourceFilename}</div>
        {selectedLabel && (
          <div className="text-xs text-muted-foreground">Selected: {selectedLabel}</div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
              disabled={pageNumber <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {pageNumber} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
              disabled={pageNumber >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((value) => Math.max(50, value - 10))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm">{zoom}%</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((value) => Math.min(200, value + 10))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-auto rounded-xl border bg-muted/20">
          {page ? (
            <div className="relative w-full" style={{ zoom: zoom / 100 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.imageUrl}
                alt={`${documentName} page ${page.page}`}
                className="block h-auto w-full"
              />
              {showHighlight && (
                <SourceHighlightOverlay source={activeSource} isActive={true} />
              )}
            </div>
          ) : (
            <div className="flex min-h-48 items-center justify-center p-4 text-center text-sm text-muted-foreground">
              Page images are not available yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
