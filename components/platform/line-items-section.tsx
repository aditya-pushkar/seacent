'use client';
/** Line-item table with per-row expandable detail showing each field's confidence and source. */


import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InvoiceLineItem, ConfidenceData, FieldSourceLocation } from '@/lib/types';
import { ConfidenceMeter } from './confidence-meter';
import { ProvenanceAction } from './provenance-action';

interface LineItemsSectionProps {
  items: InvoiceLineItem[];
  confidence: ConfidenceData;
  onViewSource: (key: string, label: string, source: FieldSourceLocation | null) => void;
}

const FIELDS: { key: keyof InvoiceLineItem; label: string }[] = [
  { key: 'item_description', label: 'Description' },
  { key: 'hsn_code', label: 'HSN Code' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unit_of_measure', label: 'Unit of Measure' },
  { key: 'uom_as_printed', label: 'UOM As Printed' },
  { key: 'unit_price', label: 'Unit Price' },
  { key: 'total_line_amount', label: 'Line Amount' },
];

export function LineItemsSection({ items, confidence, onViewSource }: LineItemsSectionProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const getConfidence = (field: string, lineNum: number | null) => {
    const key1 = lineNum !== null ? `${field}_${lineNum}` : field;
    return confidence[key1]?.confidence ?? confidence[field]?.confidence ?? null;
  };
  const getSource = (field: string, lineNum: number | null) => {
    const key1 = lineNum !== null ? `${field}_${lineNum}` : field;
    return confidence[key1]?.source ?? null;
  };

  const getRowConfidence = (lineNum: number | null): number | null => {
    const scores: number[] = [];
    FIELDS.forEach((f) => {
      const score = getConfidence(f.key, lineNum);
      if (score !== null && score !== undefined && !Number.isNaN(score)) {
        scores.push(score);
      }
    });
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Line Items ({items.length})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]" />
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Line Amount</TableHead>
              <TableHead className="w-[140px]">Confidence</TableHead>
              <TableHead className="w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const isExpanded = expanded === item.line_number;
              return (
                <Fragment key={item.line_number}>
                  <TableRow key={item.line_number} className="cursor-pointer" onClick={() => setExpanded(isExpanded ? null : item.line_number ?? null)}>
                    <TableCell>
                      <span className="inline-flex items-center">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{item.line_number}</TableCell>
                    <TableCell className="max-w-[200px] text-sm leading-tight">
                      <div className="line-clamp-2">{item.item_description ?? 'Not found'}</div>
                    </TableCell>
                    <TableCell className="text-sm">{item.hsn_code ?? 'Not found'}</TableCell>
                    <TableCell className="text-sm">{item.quantity ?? 'Not found'}</TableCell>
                    <TableCell className="text-sm">{item.unit_of_measure ?? 'Not found'}</TableCell>
                    <TableCell className="text-sm">{item.unit_price ?? 'Not found'}</TableCell>
                    <TableCell className="text-sm">{item.total_line_amount ?? 'Not found'}</TableCell>
                    <TableCell>
                      <ConfidenceMeter score={getRowConfidence(item.line_number)} />
                    </TableCell>
                    <TableCell>
                      <span onClick={(e) => e.stopPropagation()}>
                        <ProvenanceAction
                          source={getSource('total_line_amount', item.line_number)}
                          onClick={() => onViewSource('line', `Line ${item.line_number}`, getSource('total_line_amount', item.line_number))}
                          label="View"
                        />
                      </span>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${item.line_number}-detail`} className="bg-muted/30">
                      <TableCell colSpan={10}>
                        <div className="grid grid-cols-1 gap-2 whitespace-normal sm:grid-cols-2 lg:grid-cols-3 p-2">
                          {FIELDS.map((f) => (
                            <div key={f.key} className="min-w-0 rounded-lg border p-2 space-y-1">
                              <div className="text-xs text-muted-foreground break-words">{f.label}</div>
                              <div className="text-sm break-words">{(item[f.key] as string | number | null) ?? 'Not found'}</div>
                              <ConfidenceMeter score={getConfidence(f.key, item.line_number)} />
                              <ProvenanceAction
                                source={getSource(f.key, item.line_number)}
                                onClick={() => onViewSource(`${f.key}_${item.line_number}`, `Line ${item.line_number} · ${f.label}`, getSource(f.key, item.line_number))}
                                label="View in PDF"
                              />
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-sm text-muted-foreground">
                  No line items found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
