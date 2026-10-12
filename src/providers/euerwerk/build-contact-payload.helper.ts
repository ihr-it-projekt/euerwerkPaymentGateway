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

/** Shop-Kunde → EÜRwerk `CreateContactInput`. */
export const buildContactPayload = (customer: Customer): Record<string, string> => ({
	type: 'CUSTOMER',
	kind: customer.companyName ? 'ORGANIZATION' : 'PERSON',
	name: displayName(customer),
	email: customer.email,
	...(customer.firstName ? { firstName: customer.firstName } : {}),
	...(customer.lastName ? { lastName: customer.lastName } : {}),
	...(customer.companyName ? { organizationName: customer.companyName } : {}),
	...addressFields(customer)
});
