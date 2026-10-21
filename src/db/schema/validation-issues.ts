import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Bbox } from '../../../lib/types';
import { documentHeaders } from './document-headers';

export const validationIssues = pgTable(
  'validation_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    headerId: uuid('header_id')
      .notNull()
      .references(() => documentHeaders.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    severity: text('severity').$type<'low' | 'medium' | 'high'>().notNull(),
    message: text('message').notNull(),
    field: text('field'),
    lineNumber: integer('line_number'),
    expected: text('expected'),
    actual: text('actual'),
    page: integer('page'),
    bbox: jsonb('bbox').$type<Bbox>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('validation_issues_header_idx').on(table.headerId),
  ],
);

export type ValidationIssueRow = typeof validationIssues.$inferSelect;
