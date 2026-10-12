import { z } from 'zod';

export const StripeCredentialsSchema = z.object({
	secretKey: z.string().min(1),
	webhookSecret: z.string().min(1)
});

export const PayPalCredentialsSchema = z.object({
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
	webhookId: z.string().min(1)
});

/**
 * Wero hat keine eigene Händler-API, sondern läuft über einen Acquirer/PSP.
 * Aktuell: Stripe (Zahlungsart `wero` in Stripe Checkout, muss im Stripe-Dashboard aktiv sein).
 */
export const WeroSettingsSchema = z.object({
	acquirer: z.enum(['stripe']).default('stripe')
});

export const AccountingCredentialsSchema = z.object({
	apiToken: z.string().min(1).describe('Bearer-Token für die EÜRwerk-API')
});

const ProviderCredentialFields = {
	stripe: StripeCredentialsSchema.optional(),
	paypal: PayPalCredentialsSchema.optional(),
	wero: WeroSettingsSchema.optional(),
	accounting: AccountingCredentialsSchema.optional()
};

type ProviderCredentialShape = Partial<
	Record<'stripe' | 'paypal', unknown> & { wero: z.infer<typeof WeroSettingsSchema> }
>;

/** Wero braucht die Credentials seines Acquirers. */
const hasWeroAcquirer = (credentials: ProviderCredentialShape): boolean =>
	!credentials.wero || credentials[credentials.wero.acquirer] !== undefined;

const weroAcquirerIssue = {
	message: 'Wero benötigt Credentials des gewählten Acquirers (z.B. stripe)',
	path: ['wero']
};

export const MerchantCredentialsSchema = z
	.object({ webhookSigningSecret: z.string().min(1), ...ProviderCredentialFields })
	.refine(hasWeroAcquirer, weroAcquirerIssue);
export type MerchantCredentials = z.infer<typeof MerchantCredentialsSchema>;
export type StripeCredentials = z.infer<typeof StripeCredentialsSchema>;
export type PayPalCredentials = z.infer<typeof PayPalCredentialsSchema>;

export const CreateMerchantInputSchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		shopWebhookUrl: z.url(),
		...ProviderCredentialFields
	})
	.refine(hasWeroAcquirer, weroAcquirerIssue);
export type CreateMerchantInput = z.infer<typeof CreateMerchantInputSchema>;

export interface Merchant {
	id: string;
	name: string;
	shopWebhookUrl: string;
	credentials: MerchantCredentials;
	createdAt: Date;
}
