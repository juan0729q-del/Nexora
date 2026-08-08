export type ShippingDestinationInput = {
  recipientName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  district?: string;
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

export type CartShippingQuoteLine = ShippingQuoteResponse & {
  productSlug: string;
  productName: string;
  variantSku: string;
  variantLabel: string;
  quantity: number;
};

export type CartShippingQuoteResponse = {
  expiresAt: string;
  productSubtotalCop: number;
  currency: "COP";
  items: CartShippingQuoteLine[];
};

export type SelectedShippingQuote = CjShippingQuoteOption & {
  selectedAt: string;
  variantSku: string;
  quantity: number;
};

export type CheckoutShipping = ShippingDestinationInput & {
  selected: SelectedShippingQuote;
  /** Vencimiento firmado de la tarifa CJ; la pasarela no debe cobrar después. */
  quoteExpiresAt: string;
};
