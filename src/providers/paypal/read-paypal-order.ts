import { formatCheckoutId } from '../../domain/checkout/helpers/checkout-id.helper.ts';
import type {
	CheckoutView,
	LineItem,
	PaymentRecord
} from '../../domain/checkout/models/checkout.schema.ts';
import { type GatewayOrderMeta, readCustomId, taxRateFromSku } from './paypal-metadata.ts';
import type { PayPalItem, PayPalOrder } from './paypal.schemas.ts';
import { toOrderStatus } from './to-order-status.helper.ts';

type PurchaseUnit = PayPalOrder['purchase_units'][number];

export interface GatewayOrder {
	order: PayPalOrder;
	unit: PurchaseUnit;
	meta: GatewayOrderMeta;
}

const APPROVAL_RELS = new Set(['payer-action', 'approve']);

const toMinor = (value: string): number => Math.round(Number(value) * 100);

/** Nur vom Gateway angelegte Orders (custom_id `pgw:…`) – fremde Orders → `null`. */
export const readGatewayOrder = (order: PayPalOrder): GatewayOrder | null => {
	const unit = order.purchase_units[0];
	const meta = readCustomId(unit?.custom_id);
	return unit && meta ? { order, unit, meta } : null;
};

const NO_CAPTURE = { id: null, status: null } as const;

const firstCapture = (unit: PurchaseUnit): { id: string | null; status: string | null } =>
	unit.payments?.captures[0] ?? NO_CAPTURE;

/** Freigabe-Link nur, solange der Kunde noch zahlen muss. */
const approvalUrl = (order: PayPalOrder, status: CheckoutView['status']): string | null => {
	const link = order.links.find((candidate) => APPROVAL_RELS.has(candidate.rel));
	return status === 'PENDING' && link ? link.href : null;
};

export const toPayPalCheckoutView = (gateway: GatewayOrder): CheckoutView => {
	const capture = firstCapture(gateway.unit);
	const status = toOrderStatus(gateway.order.status, capture.status);
	const amountTotal = toMinor(gateway.unit.amount.value);
	return {
		id: formatCheckoutId('paypal', gateway.order.id),
		provider: 'paypal',
		status,
		reference: gateway.unit.reference_id ?? '',
		currency: gateway.unit.amount.currency_code,
		tax: gateway.meta.tax,
		amountNet: gateway.meta.amountNet,
		amountTax: amountTotal - gateway.meta.amountNet,
		amountTotal,
		redirectUrl: approvalUrl(gateway.order, status),
		providerPaymentId: capture.id
	};
};

const toLineItem = (item: PayPalItem): LineItem => ({
	name: item.name,
	...(item.description ? { description: item.description } : {}),
	quantity: Number(item.quantity),
	unitNetAmount: toMinor(item.unit_amount.value),
	taxRate: taxRateFromSku(item.sku)
});

export const toPayPalPaymentRecord = (gateway: GatewayOrder): PaymentRecord => {
	const view = toPayPalCheckoutView(gateway);
	return {
		checkoutId: view.id,
		provider: 'paypal',
		reference: view.reference,
		contactId: gateway.meta.contactId,
		currency: view.currency,
		tax: view.tax,
		amountNet: view.amountNet,
		amountTax: view.amountTax,
		amountTotal: view.amountTotal,
		items: gateway.unit.items.map(toLineItem),
		providerPaymentId: view.providerPaymentId
	};
};
