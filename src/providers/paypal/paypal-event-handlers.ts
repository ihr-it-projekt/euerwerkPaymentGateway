import type { PaymentOutcome } from '../../domain/payment/models/payment-provider.port.ts';
import { extractCapture } from './extract-capture.helper.ts';
import type { PayPalApiClient } from './paypal-api.client.ts';
import { PayPalCaptureResourceSchema, type PayPalWebhookEvent } from './paypal.schemas.ts';
import { toCaptureStatus } from './to-capture-status.helper.ts';

export type PayPalEventHandler = (
	event: PayPalWebhookEvent,
	context: { api: PayPalApiClient; token: string }
) => Promise<PaymentOutcome>;

/** Kunde hat freigegeben → Gateway captured die Order selbst. */
const handleOrderApproved: PayPalEventHandler = async (event, { api, token }) => {
	const orderId = String(event.resource.id);
	const capture = extractCapture(await api.captureOrder(token, orderId));
	return {
		providerReference: orderId,
		status: toCaptureStatus(capture.status),
		providerPaymentId: capture.id
	};
};

const captureHandler =
	(status: PaymentOutcome['status']): PayPalEventHandler =>
	(event) => {
		const resource = PayPalCaptureResourceSchema.parse(event.resource);
		return Promise.resolve({
			providerReference: resource.supplementary_data.related_ids.order_id,
			status,
			providerPaymentId: resource.id
		});
	};

export const PAYPAL_EVENT_HANDLERS: Readonly<Record<string, PayPalEventHandler>> = {
	'CHECKOUT.ORDER.APPROVED': handleOrderApproved,
	'PAYMENT.CAPTURE.COMPLETED': captureHandler('SUCCEEDED'),
	'PAYMENT.CAPTURE.PENDING': captureHandler('PROCESSING'),
	'PAYMENT.CAPTURE.DENIED': captureHandler('FAILED'),
	'PAYMENT.CAPTURE.DECLINED': captureHandler('FAILED')
};
