import type { PaymentOutcome } from '../../domain/payment/models/payment-provider.port.ts';
import type { PayPalApiClient } from './paypal-api.client.ts';
import {
	PayPalCaptureResourceSchema,
	PayPalOrderResourceSchema,
	type PayPalWebhookEvent
} from './paypal.schemas.ts';
import {
	type GatewayOrder,
	readGatewayOrder,
	toPayPalCheckoutView,
	toPayPalPaymentRecord
} from './read-paypal-order.ts';

interface HandlerContext {
	api: PayPalApiClient;
	token: string;
}

interface EventSpec {
	orderId: (event: PayPalWebhookEvent) => string;
	/** Bei Freigabe captured das Gateway selbst (idempotent per PayPal-Request-Id). */
	capture: boolean;
}

const fromOrderResource = (event: PayPalWebhookEvent): string =>
	PayPalOrderResourceSchema.parse(event.resource).id;

const fromCaptureResource = (event: PayPalWebhookEvent): string =>
	PayPalCaptureResourceSchema.parse(event.resource).supplementary_data.related_ids.order_id;

const captureEvent: EventSpec = { orderId: fromCaptureResource, capture: false };

const EVENTS: Readonly<Record<string, EventSpec>> = {
	'CHECKOUT.ORDER.APPROVED': { orderId: fromOrderResource, capture: true },
	'PAYMENT.CAPTURE.COMPLETED': captureEvent,
	'PAYMENT.CAPTURE.PENDING': captureEvent,
	'PAYMENT.CAPTURE.DENIED': captureEvent,
	'PAYMENT.CAPTURE.DECLINED': captureEvent
};

const toOutcome = (gateway: GatewayOrder): PaymentOutcome | null => {
	const { status } = toPayPalCheckoutView(gateway);
	if (status === 'PENDING') {
		return null;
	}
	const payment = status === 'SUCCEEDED' ? toPayPalPaymentRecord(gateway) : null;
	return { providerReference: gateway.order.id, status, payment };
};

const captureIfApproved = async (
	gateway: GatewayOrder,
	{ api, token }: HandlerContext
): Promise<GatewayOrder> => {
	if (gateway.order.status !== 'APPROVED') {
		return gateway;
	}
	const captured = await api.captureOrder(token, gateway.order.id);
	return readGatewayOrder(captured) ?? gateway;
};

/**
 * Lädt immer zuerst die Order: fremde Orders (anderes System im selben PayPal-Konto) werden
 * weder captured noch gebucht.
 */
export const handlePayPalEvent = async (
	event: PayPalWebhookEvent,
	context: HandlerContext
): Promise<PaymentOutcome | null> => {
	const spec = EVENTS[event.event_type];
	if (!spec) {
		return null;
	}
	const gateway = readGatewayOrder(await context.api.getOrder(context.token, spec.orderId(event)));
	if (!gateway) {
		return null;
	}
	return toOutcome(spec.capture ? await captureIfApproved(gateway, context) : gateway);
};
