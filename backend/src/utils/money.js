// Prices are stored as integer grosze (cents) and exposed in the API as decimal numbers.
export const toCents = (amount) => Math.round(amount * 100);

export const fromCents = (cents) => cents / 100;
