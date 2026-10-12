import { randomUUID } from 'node:crypto';
import { http, HttpResponse } from 'msw';
import { EUERWERK_API } from '../constants.ts';
import { recorded } from '../request-log.ts';

interface InvoiceItemBody {
	quantity: number;
	unitPrice: number;
	taxRate: number;
}

/** Bildet die EÜRwerk-Berechnung nach: Netto pro Position in Cent runden, Steuer aufschlagen. */
const calculateGross = (items: InvoiceItemBody[]): number => {
	const cents = items.reduce((sum, item) => {
		const net = Math.round(item.quantity * item.unitPrice * 100);
		return sum + net + Math.round((net * item.taxRate) / 100);
	}, 0);
	return cents / 100;
};

const unauthorized = (request: Request): Response | null =>
	request.headers.get('authorization')?.startsWith('Bearer ')
		? null
		: HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });

export const euerwerkHandlers = [
	http.post(
		`${EUERWERK_API}/contacts`,
		recorded(async ({ request }) => {
			const body = (await request.json()) as Record<string, unknown>;
			return (
				unauthorized(request) ??
				HttpResponse.json({ id: randomUUID(), customerNumber: '10001', ...body }, { status: 201 })
			);
		})
	),
	http.post(
		`${EUERWERK_API}/invoices`,
		recorded(async ({ request }) => {
			const body = (await request.json()) as { items: InvoiceItemBody[] };
			return (
				unauthorized(request) ??
				HttpResponse.json(
					{
						id: randomUUID(),
						status: 'DRAFT',
						grossAmount: calculateGross(body.items),
						paidAmount: 0
					},
					{ status: 201 }
				)
			);
		})
	),
	http.post(
		`${EUERWERK_API}/invoices/:id/enshrine`,
		recorded(({ params }) =>
			HttpResponse.json({ id: params.id, status: 'OPEN', isEnshrined: true })
		)
	),
	http.post(
		`${EUERWERK_API}/invoices/:id/book-amount`,
		recorded(({ params }) => HttpResponse.json({ id: params.id, status: 'PAID' }))
	)
];

export const euerwerkFailingInvoiceHandler = () =>
	http.post(
		`${EUERWERK_API}/invoices`,
		recorded(() => HttpResponse.json({ error: 'Mocked EÜRwerk failure' }, { status: 400 }))
	);
