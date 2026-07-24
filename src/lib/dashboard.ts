import { getCatalogDecision, products } from "@/lib/products";
import { getAutomationConfiguration } from "@/lib/automation/runtime-auth";

export type DashboardAlert = { id: string; severity: "critical" | "warning" | "info"; title: string; detail: string };

export async function getDashboardSnapshot() {
  // Sustituir por consulta a base de datos/analytics. Mantenerlo asincrono permite conectar un BI sin modificar la vista.
  const alerts: DashboardAlert[] = products.filter((product) => product.stock < 5).map((product) => ({ id: `stock-${product.sku}`, severity: "critical", title: "Stock critico", detail: `${product.name}: quedan ${product.stock} unidades.` }));
  const paused = products.filter((product) => getCatalogDecision(product) === "pause");
  if (paused.length) alerts.push({ id: "catalog-performance", severity: "warning", title: "Rendimiento bajo", detail: `${paused.map((product) => product.name).join(", ")} se retiro de la portada por sus metricas simuladas.` });
  const automation = getAutomationConfiguration();
  alerts.push(
    { id: "supplier-review", severity: automation.supplierConfigured ? "warning" : "info", title: "Sincronizacion de proveedor", detail: automation.supplierConfigured ? "La ultima variacion de costos de CJ Dropshipping esta pendiente de confirmacion." : "Conecta CJ_DROPSHIPPING_API_URL y CJ_DROPSHIPPING_API_TOKEN para activar la sincronizacion." },
    { id: "automation-session", severity: automation.adminSessionConfigured && automation.cronConfigured ? "info" : "warning", title: "Automatizacion", detail: automation.adminSessionConfigured && automation.cronConfigured ? "Sesion de administrador y cron protegidos correctamente." : "Revisa ADMIN_PASSWORD, ADMIN_SESSION_SECRET y CRON_SECRET en Vercel." },
  );
  return { revenue: 2849600, conversion: 3.8, orders: 19, inventory: products.reduce((total, product) => total + product.stock, 0), alerts, products };
}
