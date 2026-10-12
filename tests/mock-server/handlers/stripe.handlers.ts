import { randomUUID } from 'node:crypto';
import { http, HttpResponse } from 'msw';
import { STRIPE_API } from '../constants.ts';
import { recorded } from '../request-log.ts';

export const buildStripeSession = (
	overrides: Record<string, unknown> = {}
): Record<string, unknown> => {
	const id = `cs_test_${randomUUID().replaceAll('-', '')}`;
	return {
		id,
		object: 'checkout.session',
		url: `https://checkout.stripe.com/c/pay/${id}`,
		payment_status: 'unpaid',
		status: 'open',
		payment_intent: null,
		...overrides
	};
};

export const stripeHandlers = [
	http.post(
		`${STRIPE_API}/v1/checkout/sessions`,
		recorded(async ({ request }) => {
			const form = new URLSearchParams(await request.text());
			return HttpResponse.json(
				buildStripeSession({
					client_reference_id: form.get('client_reference_id'),
					success_url: form.get('success_url'),
					cancel_url: form.get('cancel_url')
				})
			);
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
