import type { PayPalCaptureResponse } from './paypal.schemas.ts';

export interface CaptureSummary {
	id: string | null;
	status: string;
}

/** Erstes Capture der Order; fehlt es, gilt der Order-Status. */
export const extractCapture = (response: PayPalCaptureResponse): CaptureSummary =>
	response.purchase_units[0]?.payments?.captures[0] ?? { id: null, status: response.status };
