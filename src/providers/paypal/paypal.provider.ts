import type { PayPalCredentials } from '../../domain/merchant/models/merchant.schema.ts';
import type {
	PaymentProvider,
	WebhookProcessor,
	WebhookRequest
} from '../../domain/payment/models/payment-provider.port.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';
import type { PayPalApiClient, PayPalVerificationPayload } from './paypal-api.client.ts';
import { buildPayPalOrder } from './build-paypal-order.helper.ts';
import { PAYPAL_EVENT_HANDLERS } from './paypal-event-handlers.ts';
import { type PayPalOrderResponse, PayPalWebhookEventSchema } from './paypal.schemas.ts';

const APPROVAL_RELS = new Set(['payer-action', 'approve']);

const requireCredentials = (credentials: PayPalCredentials | undefined): PayPalCredentials => {
	if (!credentials) {
		throw new DomainError('PROVIDER_NOT_CONFIGURED', 'PayPal ist nicht konfiguriert');
	}
	return credentials;
};

const findApprovalUrl = (order: PayPalOrderResponse): string => {
	const link = order.links.find((candidate) => APPROVAL_RELS.has(candidate.rel));
	if (!link) {
		throw new DomainError('UPSTREAM_ERROR', 'PayPal hat keinen Freigabe-Link geliefert');
	}
	return link.href;
};

const parseEvent = (rawBody: string): unknown => {
	try {
		return JSON.parse(rawBody) as unknown;
	} catch (error) {
		throw new DomainError('INVALID_WEBHOOK_SIGNATURE', 'Ungültiger PayPal-Payload', {
			cause: error
		});
	}
};

const toVerificationPayload = (
	request: WebhookRequest,
	webhookId: string,
	webhookEvent: unknown
): PayPalVerificationPayload => {
	const header = (name: string): string => request.headers[`paypal-${name}`] ?? '';
	return {
		auth_algo: header('auth-algo'),
		cert_url: header('cert-url'),
		transmission_id: header('transmission-id'),
		transmission_sig: header('transmission-sig'),
		transmission_time: header('transmission-time'),
		webhook_id: webhookId,
		webhook_event: webhookEvent
	};
};

export const createPayPalProvider = (api: PayPalApiClient): PaymentProvider => ({
	name: 'paypal',
	webhookSource: 'paypal',
	createCheckoutSession: async (checkout, credentials) => {
		const token = await api.getAccessToken(requireCredentials(credentials.paypal));
		const order = await api.createOrder(
			token,
			buildPayPalOrder(checkout),
			`checkout-${checkout.id}`
		);
		return { providerReference: order.id, redirectUrl: findApprovalUrl(order) };
	}
});

export const createPayPalWebhookProcessor = (api: PayPalApiClient): WebhookProcessor => ({
	source: 'paypal',
	processWebhook: async (request, credentials) => {
		const paypal = requireCredentials(credentials.paypal);
		const payload = parseEvent(request.rawBody);
		const token = await api.getAccessToken(paypal);
		const verification = toVerificationPayload(request, paypal.webhookId, payload);
		if (!(await api.verifyWebhookSignature(token, verification))) {
			throw new DomainError('INVALID_WEBHOOK_SIGNATURE', 'Ungültige PayPal-Signatur');
		}
		const event = PayPalWebhookEventSchema.parse(payload);
		const handler = PAYPAL_EVENT_HANDLERS[event.event_type];
		return handler ? handler(event, { api, token }) : null;
	}
});
