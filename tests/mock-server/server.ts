import { setupServer } from 'msw/node';
import { euerwerkHandlers } from './handlers/euerwerk.handlers.ts';
import { paypalHandlers } from './handlers/paypal.handlers.ts';
import { shopHandlers } from './handlers/shop.handlers.ts';
import { stripeHandlers } from './handlers/stripe.handlers.ts';

/**
 * Zentraler Mockserver für ALLE ausgehenden REST-Calls (Stripe, PayPal, EÜRwerk, Shop).
 * Einzelne Tests überschreiben Verhalten mit `mockServer.use(...)`.
 */
export const mockServer = setupServer(
	...stripeHandlers,
	...paypalHandlers,
	...euerwerkHandlers,
	...shopHandlers
);
