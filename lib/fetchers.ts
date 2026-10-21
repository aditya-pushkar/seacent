import axios from 'axios';
import type { InvoiceDetailResponse, InvoiceListResponse } from './types';
import {
  invoiceDetailResponseSchema,
  invoiceListResponseSchema,
  uploadResponseSchema,
} from './schemas';

const api = axios.create({
  headers: { Accept: 'application/json' },
  timeout: 1_800_000,
});

export async function getInvoices(): Promise<InvoiceListResponse> {
  const response = await api.get('/api/invoices');
  return invoiceListResponseSchema.parse(response.data);
}

export async function getInvoice(id: string): Promise<InvoiceDetailResponse> {
  const response = await api.get(`/api/invoices/${encodeURIComponent(id)}`);
  return invoiceDetailResponseSchema.parse(response.data);
}

export async function uploadInvoice(file: File): Promise<{ invoiceId: string }> {
  const form = new FormData();
  form.append('file', file);
  const response = await api.post('/api/invoices', form);
  return uploadResponseSchema.parse(response.data);
}

export async function processInvoice(id: string): Promise<InvoiceDetailResponse> {
  const response = await api.post(`/api/invoices/${encodeURIComponent(id)}/process`);
  return invoiceDetailResponseSchema.parse(response.data);
}
