/** Basis-URLs aller externen Systeme – ausschließlich vom Mockserver bedient. */
export const STRIPE_API = 'https://api.stripe.com';
export const PAYPAL_API = 'https://api-m.sandbox.paypal.com';
export const EUERWERK_API = 'http://euerwerk.test/api/v1';

/** PayPal-Mock: dieser Signatur-Header führt zu verification_status=FAILURE. */
export const PAYPAL_INVALID_SIGNATURE = 'invalid-signature';
