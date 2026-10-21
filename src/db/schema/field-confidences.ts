import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Bbox, ConfidenceSource } from '../../../lib/types';
import { documentHeaders } from './document-headers';

export const fieldConfidences = pgTable(
  'field_confidences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    headerId: uuid('header_id')
      .notNull()
      .references(() => documentHeaders.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number'),
    field: text('field').notNull(),
    score: numeric('score', { precision: 4, scale: 3 }).notNull(),
    rawValue: text('raw_value'),
    normalizedValue: text('normalized_value'),
    evidence: text('evidence'),
    page: integer('page'),
    bbox: jsonb('bbox').$type<Bbox>(),
    source: text('source').$type<ConfidenceSource>().notNull(),
    components: jsonb('components')
      .$type<{ grounding: number; source: number; validation: number }>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // NULL line numbers would otherwise permit duplicate header-level rows.
    uniqueIndex('field_confidences_scope_uq').on(
      table.headerId,
      table.field,
      sql`coalesce(${table.lineNumber}, 0)`,
    ),
    index('field_confidences_header_idx').on(table.headerId),
  ],
);

export type FieldConfidenceRow = typeof fieldConfidences.$inferSelect;
