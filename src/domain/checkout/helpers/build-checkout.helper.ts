import { randomUUID } from 'node:crypto';
import type { Merchant } from '../../merchant/models/merchant.schema.ts';
import type { Checkout, CreateCheckoutInput } from '../models/checkout.schema.ts';
import { calculateAmountTotal } from './calculate-amount-total.helper.ts';

/** Erzeugt einen neuen Checkout im Status PENDING (noch ohne Provider-Verknüpfung). */
export const buildCheckout = (
	merchant: Merchant,
	input: CreateCheckoutInput,
	now: Date
): Checkout => ({
	id: randomUUID(),
	merchantId: merchant.id,
	reference: input.reference,
	provider: input.provider,
	status: 'PENDING',
	currency: input.currency,
	amountTotal: calculateAmountTotal(input.items),
	customer: input.customer,
	items: input.items,
	successUrl: input.successUrl,
	cancelUrl: input.cancelUrl,
	metadata: input.metadata,
	providerReference: null,
	providerPaymentId: null,
	redirectUrl: null,
	accountingStatus: merchant.credentials.accounting ? 'PENDING' : 'NOT_REQUIRED',
	accountingInvoiceId: null,
	createdAt: now,
	updatedAt: now
});
