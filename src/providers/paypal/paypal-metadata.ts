import { z } from 'zod';
import {
	type TaxInfo,
	type TaxRate,
	TaxRateSchema,
	TaxRegimeSchema
} from '../../domain/checkout/models/checkout.schema.ts';

/**
 * Das Gateway speichert nichts – Kennzeichnung und Buchungsdaten stecken in der PayPal-Order:
 * `custom_id = pgw:<EÜRwerk-Kontakt-ID>|<Steuerland>|<Steuerregime>|<Netto in Cent>` (≤ 127 Zeichen),
 * Steuersatz je Position in `sku = pgw-tax-<rate>`.
 */
const CUSTOM_ID = /^pgw:([0-9a-f-]{1,64})\|([A-Z]{2})\|([A-Z_]{1,20})\|(\d{1,12})$/;
const TAX_SKU = /^pgw-tax-(\d{1,2}(?:\.\d{1,2})?)$/;

export interface GatewayOrderMeta {
	contactId: string;
	tax: TaxInfo;
	amountNet: number;
}

export const toCustomId = (meta: GatewayOrderMeta): string =>
	`pgw:${meta.contactId}|${meta.tax.country}|${meta.tax.regime}|${meta.amountNet}`;

const MetaSchema = z.tuple([
	z.string(),
	z.string(),
	z.string(),
	TaxRegimeSchema,
	z.coerce.number()
]);

/** `null`, wenn die Order nicht vom Gateway stammt. */
export const readCustomId = (customId: string | undefined): GatewayOrderMeta | null => {
	const parsed = MetaSchema.safeParse(CUSTOM_ID.exec(customId ?? '')?.slice(0, 5));
	if (!parsed.success) {
		return null;
	}
	const [, contactId, country, regime, amountNet] = parsed.data;
	return { contactId, tax: { country, regime }, amountNet };
};

export const toTaxSku = (taxRate: TaxRate): string => `pgw-tax-${taxRate}`;

export const taxRateFromSku = (sku: string | undefined): TaxRate =>
	TaxRateSchema.parse(Number(TAX_SKU.exec(sku ?? '')?.[1]));
