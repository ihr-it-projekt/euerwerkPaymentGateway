import type { PayPalCredentials } from '../../domain/merchant/models/merchant.schema.ts';
import { fetchJson } from '../../shared/http/fetch-json.helper.ts';
import {
	type PayPalCaptureResponse,
	PayPalCaptureResponseSchema,
	type PayPalOrderResponse,
	PayPalOrderResponseSchema,
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
	createOrder: (token: string, order: unknown, requestId: string) => Promise<PayPalOrderResponse>;
	captureOrder: (token: string, orderId: string) => Promise<PayPalCaptureResponse>;
	verifyWebhookSignature: (token: string, payload: PayPalVerificationPayload) => Promise<boolean>;
}

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** Minimaler REST-Client für PayPal Orders v2 + Webhook-Verifikation. */
export const createPayPalApiClient = (baseUrl: string): PayPalApiClient => ({
	getAccessToken: async ({ clientId, clientSecret }) => {
		const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
		const response = await fetchJson(`${baseUrl}/v1/oauth2/token`, {
			method: 'POST',
			headers: { Authorization: `Basic ${basic}` },
			formBody: new URLSearchParams({ grant_type: 'client_credentials' })
		});
		return PayPalTokenResponseSchema.parse(response).access_token;
	},
	createOrder: async (token, order, requestId) => {
		const response = await fetchJson(`${baseUrl}/v2/checkout/orders`, {
			method: 'POST',
			headers: { ...bearer(token), 'PayPal-Request-Id': requestId },
			body: order
		});
		return PayPalOrderResponseSchema.parse(response);
	},
	captureOrder: async (token, orderId) => {
		const response = await fetchJson(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
			method: 'POST',
			// Gleiche Request-Id → PayPal liefert bei Wiederholung dieselbe Antwort (idempotent)
			headers: { ...bearer(token), 'PayPal-Request-Id': `capture-${orderId}` },
			body: {}
		});
		return PayPalCaptureResponseSchema.parse(response);
	},
	verifyWebhookSignature: async (token, payload) => {
		const response = await fetchJson(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
			method: 'POST',
			headers: bearer(token),
			body: payload
		});
		return PayPalVerifyResponseSchema.parse(response).verification_status === 'SUCCESS';
	}
});
