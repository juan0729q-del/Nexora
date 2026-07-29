export type ShippingDestinationInput = {
  recipientName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  region: string;
  countryCode: string;
  postalCode: string;
  houseNumber?: string;
};

export type CjShippingQuoteOption = {
  id: string;
  method: string;
  carrier: string | null;
  estimatedDelivery: string | null;
  amountUsd: number;
  amountCop: number;
  taxesUsd: number | null;
  clearanceUsd: number | null;
  tariffUsd: number | null;
  remoteFeeUsd: number | null;
  /** Recargo remoto de CJ incluido explícitamente en amountUsd/amountCop. */
  remoteFeeCop: number | null;
  sourceCountryCode: string;
  recommended: boolean;
  recommendation: "cheapest" | "fastest" | "none";
  notices: string[];
};

export type ShippingQuoteResponse = {
  quoteToken: string;
  expiresAt: string;
  productSubtotalCop: number;
  currency: "COP";
  exchangeRateCopPerUsd: number;
  options: CjShippingQuoteOption[];
};

export type SelectedShippingQuote = CjShippingQuoteOption & {
  selectedAt: string;
  variantSku: string;
};

export type CheckoutShipping = ShippingDestinationInput & {
  selected: SelectedShippingQuote;
  /** Vencimiento firmado de la tarifa CJ; la pasarela no debe cobrar después. */
  quoteExpiresAt: string;
};
