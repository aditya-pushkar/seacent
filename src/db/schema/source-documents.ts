import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bytea } from './columns';
import { documentHeaders } from './document-headers';

export const sourceDocuments = pgTable(
  'source_documents',
  {
    headerId: uuid('header_id')
      .primaryKey()
      .references(() => documentHeaders.id, { onDelete: 'cascade' }),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    data: bytea('data').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export type SourceDocument = typeof sourceDocuments.$inferSelect;
