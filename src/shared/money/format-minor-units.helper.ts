/** 1234 → "12.34" (für APIs, die Dezimal-Strings erwarten, z.B. PayPal). */
export const formatMinorUnits = (amountMinor: number): string => (amountMinor / 100).toFixed(2);
