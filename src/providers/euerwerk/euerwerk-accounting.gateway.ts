import { z } from 'zod';
import type { AccountingGateway } from '../../domain/accounting/models/accounting.port.ts';
import { fetchJson } from '../../shared/http/fetch-json.helper.ts';
import { buildContactPayload } from './build-contact-payload.helper.ts';
import { euerwerkRequest } from './euerwerk-request.helper.ts';

const ContactSchema = z.object({ id: z.uuid() });
const InvoiceSchema = z.object({
	id: z.uuid(),
	status: z.enum(['DRAFT', 'OPEN', 'PAID', 'PARTIALLY_PAID', 'CANCELLED'])
});

/**
 * Buchhaltungs-Adapter auf die EÜRwerk REST-API (`/api/v1`).
 * Kontakt und Rechnung sind dort über externe Referenzen idempotent (200 = existiert bereits).
 */
export const createEuerwerkAccountingGateway = (baseUrl: string): AccountingGateway => ({
	upsertContact: async (apiKey, customer) => {
		const response = await fetchJson(
			`${baseUrl}/contacts`,
			euerwerkRequest(apiKey, 'POST', buildContactPayload(customer))
		);
		return ContactSchema.parse(response).id;
	},
	createInvoice: async (apiKey, draft) => {
		const body = {
			contactId: draft.contactId,
			externalReference: draft.externalReference,
			headerText: draft.headerText,
			priceMode: 'GROSS',
			items: draft.items.map(({ unitPriceGross, ...item }) => ({
				...item,
				unitPrice: unitPriceGross
			}))
		};
		const response = await fetchJson(`${baseUrl}/invoices`, euerwerkRequest(apiKey, 'POST', body));
		return InvoiceSchema.parse(response);
	},
	finalizeInvoice: async (apiKey, invoiceId) => {
		await fetchJson(`${baseUrl}/invoices/${invoiceId}/enshrine`, euerwerkRequest(apiKey, 'POST'));
	},
	bookPayment: async (apiKey, invoiceId, payment) => {
		await fetchJson(
			`${baseUrl}/invoices/${invoiceId}/book-amount`,
			euerwerkRequest(apiKey, 'POST', {
				...payment,
				paymentDate: payment.paymentDate.toISOString()
			})
		);
	}
});
