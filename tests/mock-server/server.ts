import { setupServer } from 'msw/node';
import { euerwerkHandlers, euerwerkMock } from './handlers/euerwerk.handlers.ts';
import { paypalHandlers, paypalMock } from './handlers/paypal.handlers.ts';
import { stripeHandlers, stripeMock } from './handlers/stripe.handlers.ts';

/**
 * Zentraler Mockserver für ALLE ausgehenden REST-Calls (EÜRwerk, Stripe, PayPal).
 * Die Mocks halten Zustand (Mandanten, Sessions, Orders, Rechnungen) – wie die echten Systeme,
 * denn das Gateway selbst speichert nichts. Einzelne Tests überschreiben Verhalten mit
 * `mockServer.use(...)`.
 */
export const mockServer = setupServer(...euerwerkHandlers, ...stripeHandlers, ...paypalHandlers);

export const resetMockState = (): void => {
	euerwerkMock.reset();
	stripeMock.reset();
	paypalMock.reset();
};
