import type {
	CheckoutView,
	CreateCheckoutInput
} from '#src/domain/checkout/models/checkout.schema.ts';
import { buildCreateCheckoutInput } from '../../factories/checkout.factory.ts';
import { authHeaders, type TestApp } from './test-app.ts';

export const postCheckout = async (
	app: TestApp,
	apiKey: string,
	overrides: Partial<CreateCheckoutInput> = {}
): Promise<Response> =>
	await app.request('/v1/checkouts', {
		method: 'POST',
		headers: authHeaders(apiKey),
		body: JSON.stringify(buildCreateCheckoutInput(overrides))
	});

export const createCheckout = async (
	app: TestApp,
	apiKey: string,
	overrides: Partial<CreateCheckoutInput> = {}
): Promise<CheckoutView> => {
	const response = await postCheckout(app, apiKey, overrides);
	if (response.status !== 201) {
		throw new Error(`Checkout-Anlage fehlgeschlagen: ${response.status} ${await response.text()}`);
	}
	return (await response.json()) as CheckoutView;
};

export const getCheckout = async (
	app: TestApp,
	apiKey: string,
	id: string
): Promise<CheckoutView> => {
	const response = await app.request(`/v1/checkouts/${id}`, { headers: authHeaders(apiKey) });
	return (await response.json()) as CheckoutView;
};

/** Checkout-ID `<provider>.<ref>` → Provider-Referenz (Stripe-Session- bzw. PayPal-Order-ID). */
export const providerRef = (checkout: CheckoutView): string =>
	checkout.id.slice(checkout.id.indexOf('.') + 1);
