import { products } from "@/lib/products";

export type DashboardAlert = { id: string; severity: "critical" | "warning" | "info"; title: string; detail: string };
export async function getDashboardSnapshot() {
  // Sustituir por consulta a base de datos/analytics. Mantenerlo asíncrono permite
  // conectar Prisma, Supabase o un endpoint de BI sin modificar la vista.
  const alerts: DashboardAlert[] = products.filter((product) => product.stock < 5).map((product) => ({ id: `stock-${product.sku}`, severity: "critical", title: "Stock crítico", detail: `${product.name}: quedan ${product.stock} unidades.` }));
  alerts.push({ id: "supplier-review", severity: "warning", title: "Revisión de proveedor", detail: "La última variación de costos de CJ Dropshipping está pendiente de confirmación." }, { id: "payments-ok", severity: "info", title: "Pagos", detail: "Sin errores de transacción registrados en esta demostración." });
  return { revenue: 2849600, conversion: 3.8, orders: 19, inventory: products.reduce((total, product) => total + product.stock, 0), alerts, products };
}
