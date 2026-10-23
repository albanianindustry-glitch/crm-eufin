import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PDF_BYTES, validatePdfDataUri } from '../api/file.js';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const dataUri = (bytes, mime = 'application/pdf') => `data:${mime};base64,${bytes.toString('base64')}`;

test('PDF validation accepts a bounded PDF payload and returns decoded size', () => {
  const result = validatePdfDataUri(dataUri(pdf));
  assert.deepEqual(result, { ok: true, data: pdf.toString('base64'), size: pdf.length });
});

test('PDF validation permits a header within the first 1024 bytes', () => {
  const bytes = Buffer.concat([Buffer.alloc(100, 0), pdf]);
  assert.equal(validatePdfDataUri(dataUri(bytes)).ok, true);
});

test('PDF validation rejects arbitrary bytes, malformed base64 and non-PDF MIME', () => {
  assert.equal(validatePdfDataUri(dataUri(Buffer.from('not a PDF'))).status, 400);
  assert.equal(validatePdfDataUri('data:application/pdf;base64,%%%').status, 400);
  assert.equal(validatePdfDataUri(dataUri(pdf, 'text/plain')).status, 400);
});

test('PDF validation enforces the 3 MiB limit on decoded bytes', () => {
  const bytes = Buffer.alloc(MAX_PDF_BYTES + 1);
  Buffer.from('%PDF-1.4').copy(bytes);
  Buffer.from('%%EOF').copy(bytes, bytes.length - 5);
  assert.equal(validatePdfDataUri(dataUri(bytes)).status, 413);
});
