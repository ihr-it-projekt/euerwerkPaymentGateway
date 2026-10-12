import type { LineItem } from '../models/checkout.schema.ts';

/** Summe aller Positionen (brutto, in Cent). */
export const calculateAmountTotal = (items: readonly LineItem[]): number =>
	items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
