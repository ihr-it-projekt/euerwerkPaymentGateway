import type {
	AccountingStatus,
	Checkout,
	CheckoutStatus,
	ProviderName
} from './checkout.schema.ts';

export interface ProviderLink {
	providerReference: string;
	redirectUrl: string;
}

export interface StatusUpdate {
	status: CheckoutStatus;
	providerPaymentId?: string | null;
}

export interface AccountingUpdate {
	accountingStatus: AccountingStatus;
	accountingInvoiceId?: string | null;
}

export interface CheckoutRepository {
	insert: (checkout: Checkout) => Promise<Checkout>;
	findById: (merchantId: string, id: string) => Promise<Checkout | null>;
	/** Sucht unter allen Providern, die über denselben Webhook-Kanal laufen (z.B. stripe + wero). */
	findByProviderReference: (
		merchantId: string,
		providers: readonly ProviderName[],
		providerReference: string
	) => Promise<Checkout | null>;
	linkProvider: (id: string, link: ProviderLink) => Promise<Checkout>;
	updateStatus: (id: string, update: StatusUpdate) => Promise<Checkout>;
	updateAccounting: (id: string, update: AccountingUpdate) => Promise<Checkout>;
}
