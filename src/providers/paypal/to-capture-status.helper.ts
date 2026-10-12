import type { PaymentOutcome } from '../../domain/payment/models/payment-provider.port.ts';

const CAPTURE_STATUS: Record<string, PaymentOutcome['status']> = {
	COMPLETED: 'SUCCEEDED',
	PENDING: 'PROCESSING',
	DECLINED: 'FAILED',
	FAILED: 'FAILED'
};

/** PayPal Capture-Status → Checkout-Status (unbekannt → PROCESSING, finaler Status folgt per Webhook). */
export const toCaptureStatus = (paypalStatus: string): PaymentOutcome['status'] =>
	CAPTURE_STATUS[paypalStatus] ?? 'PROCESSING';
