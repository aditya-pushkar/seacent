import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { OcrWord, PageKind } from '../../../lib/types';
import { bytea } from './columns';
import { documentHeaders } from './document-headers';

export const documentPages = pgTable(
  'document_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    headerId: uuid('header_id')
      .notNull()
      .references(() => documentHeaders.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    sourceKind: text('source_kind').$type<PageKind>().notNull(),
    pngData: bytea('png_data'),
    imageWidth: integer('image_width'),
    imageHeight: integer('image_height'),
    ocrWords: jsonb('ocr_words').$type<OcrWord[]>().notNull().default(sql`'[]'::jsonb`),
    pageError: text('page_error'),
    rawModelJson: jsonb('raw_model_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('document_pages_header_page_uq').on(table.headerId, table.pageNumber),
  ],
);

export type DocumentPage = typeof documentPages.$inferSelect;
