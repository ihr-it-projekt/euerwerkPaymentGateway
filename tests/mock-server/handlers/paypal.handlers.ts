import { randomUUID } from 'node:crypto';
import { http, HttpResponse } from 'msw';
import { PAYPAL_API, PAYPAL_INVALID_SIGNATURE } from '../constants.ts';
import { recorded } from '../request-log.ts';

type Order = Record<string, unknown> & {
	id: string;
	status: string;
	purchase_units: Record<string, unknown>[];
};

interface StoredOrder {
	clientId: string;
	order: Order;
}

const orders = new Map<string, StoredOrder>();
let captureStatus = 'COMPLETED';

const newId = (): string => randomUUID().replaceAll('-', '').slice(0, 17).toUpperCase();

/** Token = `A21.<clientId>` → Mandant ist an jedem Folge-Request erkennbar. */
const clientIdFromBasic = (request: Request): string =>
	Buffer.from(request.headers.get('authorization')?.replace(/^Basic /, '') ?? '', 'base64')
		.toString()
		.split(':')[0] ?? '';

const clientIdFromBearer = (request: Request): string =>
	request.headers.get('authorization')?.replace(/^Bearer A21\./, '') ?? '';

const ownedOrder = (request: Request, id: string): StoredOrder | undefined => {
	const stored = orders.get(id);
	return stored?.clientId === clientIdFromBearer(request) ? stored : undefined;
};

const notFound = (): Response => HttpResponse.json({ name: 'RESOURCE_NOT_FOUND' }, { status: 404 });

const withCapture = (order: Order): Order => ({
	...order,
	status: 'COMPLETED',
	links: [],
	purchase_units: order.purchase_units.map((unit) => ({
		...unit,
		payments: { captures: [{ id: newId(), status: captureStatus }] }
	}))
});

/** Test-API des PayPal-Mocks: Käufer-Freigabe simulieren, Capture-Ergebnis steuern. */
export const paypalMock = {
	approveOrder: (id: string): void => {
		const stored = orders.get(id);
		if (!stored) throw new Error(`Order ${id} unbekannt`);
		stored.order = { ...stored.order, status: 'APPROVED', links: [] };
	},
	/** Fremde Order (nicht vom Gateway) im selben PayPal-Konto. */
	seedForeignOrder: (clientId: string): string => {
		const id = newId();
		const order: Order = {
			id,
			status: 'APPROVED',
			purchase_units: [{ reference_id: 'fremd', amount: { currency_code: 'EUR', value: '5.00' } }]
		};
		orders.set(id, { clientId, order });
		return id;
	},
	/** Ausstehendes Capture wird von PayPal nachträglich abgeschlossen. */
	completeCapture: (id: string): void => {
		const stored = orders.get(id);
		if (!stored) throw new Error(`Order ${id} unbekannt`);
		captureStatus = 'COMPLETED';
		stored.order = withCapture(stored.order);
	},
	setCaptureStatus: (status: string): void => {
		captureStatus = status;
	},
	reset: (): void => {
		orders.clear();
		captureStatus = 'COMPLETED';
	}
};

export const paypalHandlers = [
	http.post(
		`${PAYPAL_API}/v1/oauth2/token`,
		recorded(({ request }) =>
			HttpResponse.json({
				access_token: `A21.${clientIdFromBasic(request)}`,
				token_type: 'Bearer',
				expires_in: 32400
			})
		)
	),
	http.post(
		`${PAYPAL_API}/v2/checkout/orders`,
		recorded(async ({ request }) => {
			const body = (await request.json()) as { purchase_units: Record<string, unknown>[] };
			const id = newId();
			const order: Order = {
				id,
				status: 'PAYER_ACTION_REQUIRED',
				purchase_units: body.purchase_units,
				links: [
					{ href: `${PAYPAL_API}/v2/checkout/orders/${id}`, rel: 'self' },
					{ href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`, rel: 'payer-action' }
				]
			};
			orders.set(id, { clientId: clientIdFromBearer(request), order });
			return HttpResponse.json(order);
		})
	),
	http.get(
		`${PAYPAL_API}/v2/checkout/orders/:orderId`,
		recorded(({ request, params }) => {
			const stored = ownedOrder(request, String(params.orderId));
			return stored ? HttpResponse.json(stored.order) : notFound();
		})
	),
	http.post(
		`${PAYPAL_API}/v2/checkout/orders/:orderId/capture`,
		recorded(({ request, params }) => {
			const stored = ownedOrder(request, String(params.orderId));
			if (!stored) return notFound();
			if (stored.order.status === 'APPROVED') stored.order = withCapture(stored.order);
			const ok = stored.order.status === 'COMPLETED';
			return ok
				? HttpResponse.json(stored.order, { status: 201 })
				: HttpResponse.json({ name: 'UNPROCESSABLE_ENTITY' }, { status: 422 });
		})
	),
	http.post(
		`${PAYPAL_API}/v1/notifications/verify-webhook-signature`,
		recorded(async ({ request }) => {
			const body = (await request.json()) as { transmission_sig?: string };
			const valid = body.transmission_sig !== PAYPAL_INVALID_SIGNATURE;
			return HttpResponse.json({ verification_status: valid ? 'SUCCESS' : 'FAILURE' });
		})
	)
];
