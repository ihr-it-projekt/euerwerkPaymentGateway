import { randomUUID } from 'node:crypto';
import { http, HttpResponse } from 'msw';
import { STRIPE_API } from '../constants.ts';
import { parseStripeForm } from '../parse-stripe-form.ts';
import { recorded } from '../request-log.ts';

interface FormLineItem {
	quantity: string;
	price_data: {
		currency: string;
		unit_amount: string;
		product_data: { name: string; description?: string; metadata?: Record<string, string> };
	};
}

export type MockSession = Record<string, unknown> & {
	id: string;
	metadata: Record<string, string>;
};

interface StoredSession {
	secretKey: string;
	session: MockSession;
	lineItems: FormLineItem[];
}

const sessions = new Map<string, StoredSession>();

const secretKeyOf = (request: Request): string =>
	request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';

const notFound = (): Response =>
	HttpResponse.json(
		{ error: { type: 'invalid_request_error', message: 'No such checkout.session' } },
		{ status: 404 }
	);

const sumOf = (items: FormLineItem[]): number =>
	items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price_data.unit_amount), 0);

const toListItem = (item: FormLineItem): Record<string, unknown> => ({
	id: `li_${randomUUID().slice(0, 8)}`,
	object: 'item',
	description: item.price_data.product_data.name,
	quantity: Number(item.quantity),
	currency: item.price_data.currency,
	price: {
		object: 'price',
		unit_amount: Number(item.price_data.unit_amount),
		product: {
			object: 'product',
			id: `prod_${randomUUID().slice(0, 8)}`,
			...item.price_data.product_data
		}
	}
});

const ownedSession = (request: Request, id: string): StoredSession | undefined => {
	const stored = sessions.get(id);
	return stored?.secretKey === secretKeyOf(request) ? stored : undefined;
};

/** Test-API des Stripe-Mocks: Sessions abschließen/ablaufen lassen wie das echte Stripe. */
export const stripeMock = {
	updateSession: (id: string, patch: Record<string, unknown>): MockSession => {
		const stored = sessions.get(id);
		if (!stored) throw new Error(`Session ${id} unbekannt`);
		stored.session = { ...stored.session, ...patch };
		return stored.session;
	},
	reset: (): void => {
		sessions.clear();
	}
};

export const stripeHandlers = [
	http.post(
		`${STRIPE_API}/v1/checkout/sessions`,
		recorded(async ({ request }) => {
			const form = parseStripeForm(await request.text());
			const lineItems = form.line_items as FormLineItem[];
			const id = `cs_test_${randomUUID().replaceAll('-', '')}`;
			const session: MockSession = {
				id,
				object: 'checkout.session',
				url: `https://checkout.stripe.com/c/pay/${id}`,
				status: 'open',
				payment_status: 'unpaid',
				payment_intent: null,
				currency: lineItems[0]?.price_data.currency ?? 'eur',
				amount_total: sumOf(lineItems),
				client_reference_id: form.client_reference_id,
				metadata: (form.metadata ?? {}) as Record<string, string>
			};
			sessions.set(id, { secretKey: secretKeyOf(request), session, lineItems });
			return HttpResponse.json(session);
		})
	),
	http.get(
		`${STRIPE_API}/v1/checkout/sessions/:id`,
		recorded(({ request, params }) => {
			const stored = ownedSession(request, String(params.id));
			return stored ? HttpResponse.json(stored.session) : notFound();
		})
	),
	http.get(
		`${STRIPE_API}/v1/checkout/sessions/:id/line_items`,
		recorded(({ request, params }) => {
			const stored = ownedSession(request, String(params.id));
			if (!stored) return notFound();
			return HttpResponse.json({
				object: 'list',
				has_more: false,
				url: `/v1/checkout/sessions/${stored.session.id}/line_items`,
				data: stored.lineItems.map(toListItem)
			});
		})
	)
];

export const stripeErrorHandler = (status = 500) =>
	http.post(
		`${STRIPE_API}/v1/checkout/sessions`,
		recorded(() =>
			HttpResponse.json(
				{ error: { type: 'api_error', message: 'Mocked Stripe failure' } },
				{ status }
			)
		)
	);
