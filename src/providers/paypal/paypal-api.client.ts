import type { PayPalCredentials } from '../../domain/config/models/payment-config.schema.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';
import { fetchJson } from '../../shared/http/fetch-json.helper.ts';
import {
	type PayPalOrder,
	PayPalOrderSchema,
	PayPalTokenResponseSchema,
	PayPalVerifyResponseSchema
} from './paypal.schemas.ts';

export interface PayPalVerificationPayload {
	auth_algo: string;
	cert_url: string;
	transmission_id: string;
	transmission_sig: string;
	transmission_time: string;
	webhook_id: string;
	webhook_event: unknown;
}

export interface PayPalApiClient {
	getAccessToken: (credentials: PayPalCredentials) => Promise<string>;
	createOrder: (token: string, order: unknown, requestId: string) => Promise<PayPalOrder>;
	getOrder: (token: string, orderId: string) => Promise<PayPalOrder>;
	captureOrder: (token: string, orderId: string) => Promise<PayPalOrder>;
	verifyWebhookSignature: (token: string, payload: PayPalVerificationPayload) => Promise<boolean>;
}

const ORDER_ID = /^[A-Z0-9]{1,64}$/i;

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** Order-IDs landen im URL-Pfad → strikt validieren. */
const orderPath = (baseUrl: string, orderId: string): string => {
	if (!ORDER_ID.test(orderId)) {
		throw new DomainError('NOT_FOUND', 'Checkout nicht gefunden');
	}
	return `${baseUrl}/v2/checkout/orders/${orderId}`;
};

const requestAccessToken = async (
	baseUrl: string,
	{ clientId, clientSecret }: PayPalCredentials
): Promise<string> => {
	const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
	const response = await fetchJson(`${baseUrl}/v1/oauth2/token`, {
		method: 'POST',
		headers: { Authorization: `Basic ${basic}` },
		formBody: new URLSearchParams({ grant_type: 'client_credentials' })
	});
	return PayPalTokenResponseSchema.parse(response).access_token;
};

const verifySignature = async (
	baseUrl: string,
	token: string,
	payload: PayPalVerificationPayload
): Promise<boolean> => {
	const response = await fetchJson(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
		method: 'POST',
		headers: bearer(token),
		body: payload
	});
	return PayPalVerifyResponseSchema.parse(response).verification_status === 'SUCCESS';
};

/** Minimaler REST-Client für PayPal Orders v2 + Webhook-Verifikation. */
export const createPayPalApiClient = (baseUrl: string): PayPalApiClient => ({
	getAccessToken: (credentials) => requestAccessToken(baseUrl, credentials),
	verifyWebhookSignature: (token, payload) => verifySignature(baseUrl, token, payload),
	createOrder: async (token, order, requestId) => {
		const response = await fetchJson(`${baseUrl}/v2/checkout/orders`, {
			method: 'POST',
			headers: { ...bearer(token), 'PayPal-Request-Id': requestId },
			body: order
		});
		return PayPalOrderSchema.parse(response);
	},
	getOrder: async (token, orderId) => {
		const response = await fetchJson(orderPath(baseUrl, orderId), {
			headers: bearer(token),
			errorCodes: { 404: 'NOT_FOUND' }
		});
		return PayPalOrderSchema.parse(response);
	},
	captureOrder: async (token, orderId) => {
		const response = await fetchJson(`${orderPath(baseUrl, orderId)}/capture`, {
			method: 'POST',
			// Gleiche Request-Id → PayPal liefert bei Wiederholung dieselbe Antwort (idempotent)
			headers: {
				...bearer(token),
				'PayPal-Request-Id': `capture-${orderId}`,
				Prefer: 'return=representation'
			},
			body: {}
		});
		return PayPalOrderSchema.parse(response);
	}
});
