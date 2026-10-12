import { randomUUID } from 'node:crypto';
import { http, HttpResponse } from 'msw';
import { PAYPAL_API, PAYPAL_INVALID_SIGNATURE } from '../constants.ts';
import { recorded } from '../request-log.ts';

const newId = (): string => randomUUID().replaceAll('-', '').slice(0, 17).toUpperCase();

export const paypalHandlers = [
	http.post(
		`${PAYPAL_API}/v1/oauth2/token`,
		recorded(() =>
			HttpResponse.json({ access_token: `A21_${newId()}`, token_type: 'Bearer', expires_in: 32400 })
		)
	),
	http.post(
		`${PAYPAL_API}/v2/checkout/orders`,
		recorded(() => {
			const id = newId();
			return HttpResponse.json(
				{
					id,
					status: 'PAYER_ACTION_REQUIRED',
					links: [
						{ href: `${PAYPAL_API}/v2/checkout/orders/${id}`, rel: 'self' },
						{ href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`, rel: 'payer-action' }
					]
				},
				{ status: 200 }
			);
		})
	),
	http.post(
		`${PAYPAL_API}/v2/checkout/orders/:orderId/capture`,
		recorded(({ params }) =>
			HttpResponse.json(
				{
					id: params.orderId,
					status: 'COMPLETED',
					purchase_units: [{ payments: { captures: [{ id: newId(), status: 'COMPLETED' }] } }]
				},
				{ status: 201 }
			)
		)
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

export const paypalCaptureHandler = (captureStatus: string) =>
	http.post(
		`${PAYPAL_API}/v2/checkout/orders/:orderId/capture`,
		recorded(({ params }) =>
			HttpResponse.json(
				{
					id: params.orderId,
					status: captureStatus,
					purchase_units: [{ payments: { captures: [{ id: newId(), status: captureStatus }] } }]
				},
				{ status: 201 }
			)
		)
	);
