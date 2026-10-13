import { type TaxRate, TaxRateSchema } from '../../domain/checkout/models/checkout.schema.ts';

/**
 * Das Gateway speichert nichts – Kennzeichnung und Buchungsdaten stecken in der PayPal-Order:
 * `custom_id = pgw:<EÜRwerk-Kontakt-ID>`, Steuersatz je Position in `sku = pgw-tax-<rate>`.
 */
const CUSTOM_ID_PREFIX = 'pgw:';
const TAX_SKU = /^pgw-tax-(\d{1,2})$/;

export const toCustomId = (contactId: string): string => `${CUSTOM_ID_PREFIX}${contactId}`;

/** `null`, wenn die Order nicht vom Gateway stammt. */
export const contactIdFromCustomId = (customId: string | undefined): string | null =>
	customId?.startsWith(CUSTOM_ID_PREFIX) ? customId.slice(CUSTOM_ID_PREFIX.length) : null;

export const toTaxSku = (taxRate: TaxRate): string => `pgw-tax-${taxRate}`;

export const taxRateFromSku = (sku: string | undefined): TaxRate =>
	TaxRateSchema.parse(Number(TAX_SKU.exec(sku ?? '')?.[1]));
