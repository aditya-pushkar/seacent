/**
 * Schema barrel. drizzle-kit discovers tables by walking this file's exports,
 * so every table module is re-exported at the top level. The named `schema`
 * object is what the runtime Drizzle client receives.
 */
import * as documentHeadersSchema from './schema/document-headers';
import * as documentLineItemsSchema from './schema/document-line-items';
import * as documentPagesSchema from './schema/document-pages';
import * as fieldConfidencesSchema from './schema/field-confidences';
import * as sourceDocumentsSchema from './schema/source-documents';
import * as validationIssuesSchema from './schema/validation-issues';

export * from './schema/columns';
export * from './schema/document-headers';
export * from './schema/document-line-items';
export * from './schema/document-pages';
export * from './schema/field-confidences';
export * from './schema/source-documents';
export * from './schema/validation-issues';

export const schema = {
  ...documentHeadersSchema,
  ...documentLineItemsSchema,
  ...documentPagesSchema,
  ...fieldConfidencesSchema,
  ...sourceDocumentsSchema,
  ...validationIssuesSchema,
};
