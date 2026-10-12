/** Basis-URLs aller externen Systeme – ausschließlich vom Mockserver bedient. */
export const STRIPE_API = 'https://api.stripe.com';
export const PAYPAL_API = 'https://api-m.sandbox.paypal.com';
export const EUERWERK_API = 'http://euerwerk.test/api/v1';
export const SHOP_WEBHOOK_URL = 'http://shop.test/api/payment-gateway/webhook';

/** PayPal-Mock: dieser Signatur-Header führt zu verification_status=FAILURE. */
export const PAYPAL_INVALID_SIGNATURE = 'invalid-signature';
