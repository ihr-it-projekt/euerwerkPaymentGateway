import { z } from 'zod';
import type { AccountingGateway } from '../../domain/accounting/models/accounting.port.ts';
import { fetchJson } from '../../shared/http/fetch-json.helper.ts';
import { buildContactPayload } from './build-contact-payload.helper.ts';

const CreatedContactSchema = z.object({ id: z.string() });
const CreatedInvoiceSchema = z.object({ id: z.string(), grossAmount: z.coerce.number() });

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** Adapter auf die EÜRwerk REST-API (`/api/v1`). */
export const createEuerwerkAccountingGateway = (baseUrl: string): AccountingGateway => ({
	createContact: async (apiToken, customer) => {
		const response = await fetchJson(`${baseUrl}/contacts`, {
			method: 'POST',
			headers: bearer(apiToken),
			body: buildContactPayload(customer)
		});
		return CreatedContactSchema.parse(response).id;
	},
	createInvoice: async (apiToken, draft) => {
		const response = await fetchJson(`${baseUrl}/invoices`, {
			method: 'POST',
			headers: bearer(apiToken),
			body: {
				contactId: draft.contactId,
				headerText: draft.headerText,
				items: draft.items.map(({ unitPriceNet, ...item }) => ({
					...item,
					unitPrice: unitPriceNet
				}))
			}
		});
		return CreatedInvoiceSchema.parse(response);
	},
	finalizeInvoice: async (apiToken, invoiceId) => {
		await fetchJson(`${baseUrl}/invoices/${invoiceId}/enshrine`, {
			method: 'POST',
			headers: bearer(apiToken)
		});
	},
	bookPayment: async (apiToken, invoiceId, payment) => {
		await fetchJson(`${baseUrl}/invoices/${invoiceId}/book-amount`, {
			method: 'POST',
			headers: bearer(apiToken),
			body: { ...payment, paymentDate: payment.paymentDate.toISOString() }
		});
	}
});
