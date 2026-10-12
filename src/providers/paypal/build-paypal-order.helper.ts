import type { Checkout } from '../../domain/checkout/models/checkout.schema.ts';
import { formatMinorUnits } from '../../shared/money/format-minor-units.helper.ts';

const money = (
	currency: string,
	amountMinor: number
): { currency_code: string; value: string } => ({
	currency_code: currency,
	value: formatMinorUnits(amountMinor)
});

/** PayPal Orders v2 Request (intent CAPTURE, Bruttopreise). */
export const buildPayPalOrder = (checkout: Checkout): Record<string, unknown> => ({
	intent: 'CAPTURE',
	purchase_units: [
		{
			reference_id: checkout.reference,
			custom_id: checkout.id,
			amount: {
				...money(checkout.currency, checkout.amountTotal),
				breakdown: { item_total: money(checkout.currency, checkout.amountTotal) }
			},
			items: checkout.items.map((item) => ({
				name: item.name,
				quantity: String(item.quantity),
				unit_amount: money(checkout.currency, item.unitAmount)
			}))
		}
	],
	payment_source: {
		paypal: {
			email_address: checkout.customer.email,
			experience_context: {
				user_action: 'PAY_NOW',
				shipping_preference: 'NO_SHIPPING',
				return_url: checkout.successUrl,
				cancel_url: checkout.cancelUrl
			}
		}
	}
});
