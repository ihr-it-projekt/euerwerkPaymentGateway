import { z } from 'zod';

export const StripeCredentialsSchema = z.object({
	secretKey: z.string().min(1),
	webhookSecret: z.string().min(1)
});
export type StripeCredentials = z.infer<typeof StripeCredentialsSchema>;

export const PayPalCredentialsSchema = z.object({
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
	webhookId: z.string().min(1)
});
export type PayPalCredentials = z.infer<typeof PayPalCredentialsSchema>;

/**
 * Wero hat keine eigene Händler-API, sondern läuft über einen Acquirer/PSP.
 * Aktuell: Stripe (Zahlungsart `wero` in Stripe Checkout, muss im Stripe-Dashboard aktiv sein).
 */
export const WeroSettingsSchema = z.object({
	acquirer: z.enum(['stripe']).default('stripe')
});

/**
 * Zahlungs-Konfiguration eines EÜRwerk-Mandanten. Wird bei jedem Request mit dem API-Key des
 * Shops aus EÜRwerk geladen (`GET /api/v1/payment-gateway/config`) – das Gateway speichert nichts.
 */
export const PaymentConfigSchema = z
	.object({
		stripe: StripeCredentialsSchema.nullish(),
		paypal: PayPalCredentialsSchema.nullish(),
		wero: WeroSettingsSchema.nullish()
	})
	.refine((config) => !config.wero || Boolean(config[config.wero.acquirer]), {
		message: 'Wero benötigt Credentials des gewählten Acquirers (z.B. stripe)',
		path: ['wero']
	});
export type PaymentConfig = z.infer<typeof PaymentConfigSchema>;
