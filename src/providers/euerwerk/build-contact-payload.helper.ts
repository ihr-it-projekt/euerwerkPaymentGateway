import type { Customer } from '../../domain/checkout/models/checkout.schema.ts';

const displayName = (customer: Customer): string => {
	const personName = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
	return customer.companyName ?? (personName || customer.email);
};

const addressFields = (customer: Customer): Record<string, string> => {
	const { address } = customer;
	if (!address) {
		return {};
	}
	return {
		addressStreet: [address.line1, address.line2].filter(Boolean).join(', '),
		addressZip: address.postalCode,
		addressCity: address.city,
		addressCountry: address.country
	};
};

/** Quelle der externen Kunden-ID in EÜRwerk (Kontakt eindeutig pro Mandant + Quelle + ID). */
export const CONTACT_EXTERNAL_SOURCE = 'payment-gateway';

/** Shop-Kunde → EÜRwerk `CreateContactInput` (idempotent über `externalSource`/`externalId`). */
export const buildContactPayload = (customer: Customer): Record<string, string> => ({
	externalSource: CONTACT_EXTERNAL_SOURCE,
	externalId: customer.id,
	type: 'CUSTOMER',
	kind: customer.companyName ? 'ORGANIZATION' : 'PERSON',
	name: displayName(customer),
	email: customer.email,
	...(customer.firstName ? { firstName: customer.firstName } : {}),
	...(customer.lastName ? { lastName: customer.lastName } : {}),
	...(customer.companyName ? { organizationName: customer.companyName } : {}),
	...addressFields(customer)
});
