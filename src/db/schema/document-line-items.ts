import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Bbox } from '../../../lib/types';
import { documentHeaders } from './document-headers';

export const documentLineItems = pgTable(
  'document_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    headerId: uuid('header_id')
      .notNull()
      .references(() => documentHeaders.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    pageNumber: integer('page_number'),
    rowBbox: jsonb('row_bbox').$type<Bbox>(),
    itemDescription: text('item_description'),
    hsnCode: text('hsn_code'),
    quantity: numeric('quantity'),
    unitOfMeasure: text('unit_of_measure'),
    uomAsPrinted: text('uom_as_printed'),
    unitPrice: numeric('unit_price'),
    totalLineAmount: numeric('total_line_amount'),
    flags: jsonb('flags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    uniqueIndex('document_line_items_header_line_uq').on(table.headerId, table.lineNumber),
    index('document_line_items_header_idx').on(table.headerId),
  ],
);

export type DocumentLineItem = typeof documentLineItems.$inferSelect;
