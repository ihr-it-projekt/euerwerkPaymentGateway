import { randomBytes, randomUUID } from 'node:crypto';
import { http, HttpResponse } from 'msw';
import type { PaymentConfig } from '#src/domain/config/models/payment-config.schema.ts';
import { EUERWERK_API } from '../constants.ts';
import { recorded } from '../request-log.ts';

interface MockInvoice {
	id: string;
	status: 'DRAFT' | 'OPEN' | 'PAID';
	externalReference: string;
	grossAmount: number;
	body: Record<string, unknown>;
}

interface Tenant {
	config: PaymentConfig;
	contacts: Map<string, string>;
	invoices: Map<string, MockInvoice>;
}

const tenants = new Map<string, Tenant>();

const tenantOf = (request: Request): Tenant | undefined =>
	tenants.get(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '');

const unauthorized = (): Response =>
	HttpResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

const grossOf = (items: { quantity: number; unitPrice: number }[]): number =>
	Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;

const findInvoice = (tenant: Tenant, id: string): MockInvoice | undefined =>
	[...tenant.invoices.values()].find((invoice) => invoice.id === id);

/** Test-API des EÜRwerk-Mocks (Mandanten anlegen, Zustand prüfen). */
export const euerwerkMock = {
	registerTenant: (config: PaymentConfig): string => {
		const apiKey = `ewk_live_${randomBytes(24).toString('hex')}`;
		tenants.set(apiKey, { config, contacts: new Map(), invoices: new Map() });
		return apiKey;
	},
	revoke: (apiKey: string): void => {
		tenants.delete(apiKey);
	},
	invoices: (apiKey: string): MockInvoice[] => [...(tenants.get(apiKey)?.invoices.values() ?? [])],
	reset: (): void => {
		tenants.clear();
	}
};

export const euerwerkHandlers = [
	http.get(
		`${EUERWERK_API}/payment-gateway/config`,
		recorded(({ request }) => {
			const tenant = tenantOf(request);
			return tenant ? HttpResponse.json(tenant.config) : unauthorized();
		})
	),
	http.post(
		`${EUERWERK_API}/contacts`,
		recorded(async ({ request }) => {
			const tenant = tenantOf(request);
			if (!tenant) return unauthorized();
			const body = (await request.json()) as { externalSource: string; externalId: string };
			const key = `${body.externalSource}:${body.externalId}`;
			const existing = tenant.contacts.get(key);
			if (existing) return HttpResponse.json({ id: existing, ...body }, { status: 200 });
			const id = randomUUID();
			tenant.contacts.set(key, id);
			return HttpResponse.json({ id, ...body }, { status: 201 });
		})
	),
	http.post(
		`${EUERWERK_API}/invoices`,
		recorded(async ({ request }) => {
			const tenant = tenantOf(request);
			if (!tenant) return unauthorized();
			const body = (await request.json()) as MockInvoice['body'] & {
				externalReference: string;
				items: { quantity: number; unitPrice: number }[];
			};
			const existing = tenant.invoices.get(body.externalReference);
			if (existing) return HttpResponse.json(existing, { status: 200 });
			const invoice: MockInvoice = {
				id: randomUUID(),
				status: 'DRAFT',
				externalReference: body.externalReference,
				grossAmount: grossOf(body.items),
				body
			};
			tenant.invoices.set(body.externalReference, invoice);
			return HttpResponse.json(invoice, { status: 201 });
		})
	),
	http.post(
		`${EUERWERK_API}/invoices/:id/enshrine`,
		recorded(({ request, params }) => {
			const invoice = findInvoice(
				tenantOf(request) ?? ({ invoices: new Map() } as Tenant),
				String(params.id)
			);
			if (invoice?.status !== 'DRAFT') {
				return HttpResponse.json({ error: 'Nicht festschreibbar' }, { status: 400 });
			}
			invoice.status = 'OPEN';
			return HttpResponse.json(invoice);
		})
	),
	http.post(
		`${EUERWERK_API}/invoices/:id/book-amount`,
		recorded(({ request, params }) => {
			const invoice = findInvoice(
				tenantOf(request) ?? ({ invoices: new Map() } as Tenant),
				String(params.id)
			);
			if (invoice?.status !== 'OPEN') {
				return HttpResponse.json({ error: 'Nicht buchbar' }, { status: 400 });
			}
			invoice.status = 'PAID';
			return HttpResponse.json(invoice);
		})
	)
];

export const euerwerkFailingInvoiceHandler = () =>
	http.post(
		`${EUERWERK_API}/invoices`,
		recorded(() => HttpResponse.json({ error: 'Mocked EÜRwerk failure' }, { status: 500 }))
	);
