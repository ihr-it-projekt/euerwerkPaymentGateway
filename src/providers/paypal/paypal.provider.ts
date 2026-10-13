import { createHash } from 'node:crypto';
import type { PayPalCredentials } from '../../domain/config/models/payment-config.schema.ts';
import type {
	PaymentProvider,
	WebhookProcessor,
	WebhookRequest
} from '../../domain/payment/models/payment-provider.port.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';
import { buildPayPalOrder } from './build-paypal-order.helper.ts';
import type { PayPalApiClient, PayPalVerificationPayload } from './paypal-api.client.ts';
import { handlePayPalEvent } from './paypal-event-handlers.ts';
import { PayPalWebhookEventSchema } from './paypal.schemas.ts';
import { readGatewayOrder, toPayPalCheckoutView } from './read-paypal-order.ts';

const requireCredentials = (
	credentials: PayPalCredentials | null | undefined
): PayPalCredentials => {
	if (!credentials) {
		throw new DomainError('PROVIDER_NOT_CONFIGURED', 'PayPal ist nicht konfiguriert');
	}
	return credentials;
};

/** Gleicher Request → gleiche Request-Id → PayPal liefert bei Retries dieselbe Order. */
const requestIdFor = (order: unknown): string =>
	`pgw-${createHash('sha256').update(JSON.stringify(order)).digest('hex').slice(0, 64)}`;

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

const toSession = (
	view: ReturnType<typeof toPayPalCheckoutView>
): { providerReference: string; redirectUrl: string } => {
	if (!view.redirectUrl) {
		throw new DomainError('UPSTREAM_ERROR', 'PayPal hat keinen Freigabe-Link geliefert');
	}
	return { providerReference: view.id.slice('paypal.'.length), redirectUrl: view.redirectUrl };
};

export const createPayPalProvider = (api: PayPalApiClient): PaymentProvider => ({
	name: 'paypal',
	webhookSource: 'paypal',
	createCheckoutSession: async (checkout, config) => {
		const token = await api.getAccessToken(requireCredentials(config.paypal));
		const body = buildPayPalOrder(checkout);
		const gateway = readGatewayOrder(await api.createOrder(token, body, requestIdFor(body)));
		if (!gateway) {
			throw new DomainError('UPSTREAM_ERROR', 'PayPal-Order ohne Gateway-Kennzeichnung');
		}
		return toSession(toPayPalCheckoutView(gateway));
	},
	getCheckout: async (orderId, config) => {
		const token = await api.getAccessToken(requireCredentials(config.paypal));
		const gateway = readGatewayOrder(await api.getOrder(token, orderId));
		if (!gateway) {
			throw new DomainError('NOT_FOUND', 'Checkout nicht gefunden');
		}
		return toPayPalCheckoutView(gateway);
	}
});

export const createPayPalWebhookProcessor = (api: PayPalApiClient): WebhookProcessor => ({
	source: 'paypal',
	processWebhook: async (request, config) => {
		const paypal = requireCredentials(config.paypal);
		const payload = parseEvent(request.rawBody);
		const token = await api.getAccessToken(paypal);
		const verification = toVerificationPayload(request, paypal.webhookId, payload);
		if (!(await api.verifyWebhookSignature(token, verification))) {
			throw new DomainError('INVALID_WEBHOOK_SIGNATURE', 'Ungültige PayPal-Signatur');
		}
		return handlePayPalEvent(PayPalWebhookEventSchema.parse(payload), { api, token });
	}
});
