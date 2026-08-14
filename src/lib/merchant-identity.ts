import "server-only";

function approvedValue(name: string, maximum: number) {
  const value = process.env[name]?.trim().replace(/[\r\n\t]/g, " ").slice(0, maximum);
  return value || null;
}

/** Public identity is emitted only when the owner supplied both core fields. */
export function getMerchantIdentity() {
  const legalName = approvedValue("NEXT_PUBLIC_MERCHANT_LEGAL_NAME", 180);
  const address = approvedValue("NEXT_PUBLIC_MERCHANT_ADDRESS", 300);
  const taxId = approvedValue("NEXT_PUBLIC_MERCHANT_TAX_ID", 80);
  return {
    legalName,
    address,
    taxId,
    complete: Boolean(legalName && address),
  };
}
