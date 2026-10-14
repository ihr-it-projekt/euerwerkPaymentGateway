import type Stripe from 'stripe';
import type {
	CheckoutRequest,
	LineItem,
	ProviderName,
	TaxLine
} from '../../domain/checkout/models/checkout.schema.ts';
import { STRIPE_META } from './stripe-metadata.ts';

type SessionLineItem = Stripe.Checkout.SessionCreateParams.LineItem;

const productLine = (currency: string, item: LineItem): SessionLineItem => ({
	quantity: item.quantity,
	price_data: {
		currency,
		unit_amount: item.unitNetAmount,
		tax_behavior: 'exclusive',
		product_data: {
			name: item.name,
			metadata: { [STRIPE_META.taxRate]: String(item.taxRate) },
			...(item.description ? { description: item.description } : {})
		}
	}
});

/** Eigene Zeile je Steuersatz – Stripe zeigt dem Kunden Netto + USt. wie auf der Rechnung. */
const taxLine = (currency: string, country: string, line: TaxLine): SessionLineItem => ({
	quantity: 1,
	price_data: {
		currency,
		unit_amount: line.taxAmount,
		product_data: {
			name: `Umsatzsteuer ${String(line.taxRate).replace('.', ',')} % (${country})`,
			metadata: { [STRIPE_META.kind]: 'tax', [STRIPE_META.taxRate]: String(line.taxRate) }
		}
	}
});

export const buildStripeSessionParams = (
	checkout: CheckoutRequest,
	provider: ProviderName
): Stripe.Checkout.SessionCreateParams => {
	const currency = checkout.currency.toLowerCase();
	return {
		mode: 'payment',
		client_reference_id: checkout.reference,
		customer_email: checkout.customer.email,
		success_url: checkout.successUrl,
		cancel_url: checkout.cancelUrl,
		metadata: {
			...checkout.metadata,
			[STRIPE_META.provider]: provider,
			[STRIPE_META.reference]: checkout.reference,
			[STRIPE_META.contactId]: checkout.contactId,
			[STRIPE_META.taxCountry]: checkout.tax.country,
			[STRIPE_META.taxRegime]: checkout.tax.regime,
			[STRIPE_META.amountNet]: String(checkout.amountNet)
		},
		line_items: [
			...checkout.items.map((item) => productLine(currency, item)),
			...checkout.taxLines
				.filter((line) => line.taxAmount > 0)
				.map((line) => taxLine(currency, checkout.tax.country, line))
		]
	};
};
