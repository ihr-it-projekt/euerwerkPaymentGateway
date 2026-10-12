import {
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';
import type {
	AccountingStatus,
	CheckoutStatus,
	Customer,
	LineItem,
	ProviderName
} from '../../domain/checkout/models/checkout.schema.ts';

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
};

export const merchants = pgTable('merchants', {
	id: uuid('id').primaryKey(),
	name: text('name').notNull(),
	apiKeyHash: text('api_key_hash').notNull().unique(),
	shopWebhookUrl: text('shop_webhook_url').notNull(),
	/** AES-256-GCM verschlüsseltes JSON (MerchantCredentials) */
	encryptedCredentials: text('encrypted_credentials').notNull(),
	...timestamps
});

export const checkouts = pgTable(
	'checkouts',
	{
		id: uuid('id').primaryKey(),
		merchantId: uuid('merchant_id')
			.notNull()
			.references(() => merchants.id),
		reference: text('reference').notNull(),
		provider: text('provider').$type<ProviderName>().notNull(),
		status: text('status').$type<CheckoutStatus>().notNull(),
		currency: text('currency').notNull(),
		amountTotal: integer('amount_total').notNull(),
		customer: jsonb('customer').$type<Customer>().notNull(),
		items: jsonb('items').$type<LineItem[]>().notNull(),
		successUrl: text('success_url').notNull(),
		cancelUrl: text('cancel_url').notNull(),
		metadata: jsonb('metadata').$type<Record<string, string>>().notNull(),
		providerReference: text('provider_reference'),
		providerPaymentId: text('provider_payment_id'),
		redirectUrl: text('redirect_url'),
		accountingStatus: text('accounting_status').$type<AccountingStatus>().notNull(),
		accountingInvoiceId: text('accounting_invoice_id'),
		...timestamps
	},
	(table) => [
		index('checkouts_provider_reference_idx').on(
			table.merchantId,
			table.provider,
			table.providerReference
		),
		index('checkouts_reference_idx').on(table.merchantId, table.reference)
	]
);

export const accountingContacts = pgTable(
	'accounting_contacts',
	{
		merchantId: uuid('merchant_id')
			.notNull()
			.references(() => merchants.id),
		customerId: text('customer_id').notNull(),
		contactId: text('contact_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [primaryKey({ columns: [table.merchantId, table.customerId] })]
);
