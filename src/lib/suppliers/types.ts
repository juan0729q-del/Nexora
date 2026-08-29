export type SupplierSource = "cj" | "dropi";

export type SupplierConfig = {
  name: string;
  source: SupplierSource;
  apiBaseUrl: string;
  originCountry: string;
  estimatedDeliveryDays: { min: number; max: number };
};
