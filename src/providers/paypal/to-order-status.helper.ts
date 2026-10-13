import type { CheckoutStatus } from '../../domain/checkout/models/checkout.schema.ts';

/** Bei COMPLETED entscheidet der Capture-Status, sonst der Order-Status. */
const STATUS: Readonly<Record<string, CheckoutStatus>> = {
	CREATED: 'PENDING',
	SAVED: 'PENDING',
	PAYER_ACTION_REQUIRED: 'PENDING',
	APPROVED: 'PROCESSING',
	VOIDED: 'FAILED',
	'CAPTURE:COMPLETED': 'SUCCEEDED',
	'CAPTURE:PENDING': 'PROCESSING',
	'CAPTURE:DECLINED': 'FAILED',
	'CAPTURE:FAILED': 'FAILED'
};

export const toOrderStatus = (
	orderStatus: string,
	captureStatus: string | null
): CheckoutStatus => {
	const key = captureStatus ? `CAPTURE:${captureStatus}` : orderStatus;
	return STATUS[key] ?? 'PROCESSING';
};
