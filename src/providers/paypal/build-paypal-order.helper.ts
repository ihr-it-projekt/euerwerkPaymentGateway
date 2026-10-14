import type { CheckoutRequest } from '../../domain/checkout/models/checkout.schema.ts';
import { formatMinorUnits } from '../../shared/money/format-minor-units.helper.ts';
import { toCustomId, toTaxSku } from './paypal-metadata.ts';

const money = (
	currency: string,
	amountMinor: number
): { currency_code: string; value: string } => ({
	currency_code: currency,
	value: formatMinorUnits(amountMinor)
});

/**
 * PayPal Orders v2 Request (intent CAPTURE): Positionen netto, Umsatzsteuer je Satz summiert in
 * `tax_total` – wie auf der EÜRwerk-Rechnung. Gateway-Daten stecken in `custom_id`/`sku`.
 */
export const buildPayPalOrder = (checkout: CheckoutRequest): Record<string, unknown> => ({
	intent: 'CAPTURE',
	purchase_units: [
		{
			reference_id: checkout.reference,
			custom_id: toCustomId({
				contactId: checkout.contactId,
				tax: checkout.tax,
				amountNet: checkout.amountNet
			}),
			amount: {
				...money(checkout.currency, checkout.amountTotal),
				breakdown: {
					item_total: money(checkout.currency, checkout.amountNet),
					tax_total: money(checkout.currency, checkout.amountTax)
				}
			},
			items: checkout.items.map((item) => ({
				name: item.name,
				...(item.description ? { description: item.description.slice(0, 127) } : {}),
				quantity: String(item.quantity),
				sku: toTaxSku(item.taxRate),
				unit_amount: money(checkout.currency, item.unitNetAmount)
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
