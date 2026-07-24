import { products } from "@/lib/products";
import { getAutomationConfiguration } from "@/lib/automation/runtime-auth";

export type DashboardAlert = { id: string; severity: "critical" | "warning" | "info"; title: string; detail: string };
export async function getDashboardSnapshot() {
  // Sustituir por consulta a base de datos/analytics. Mantenerlo asíncrono permite
  // conectar Prisma, Supabase o un endpoint de BI sin modificar la vista.
  const alerts: DashboardAlert[] = products.filter((product) => product.stock < 5).map((product) => ({ id: `stock-${product.sku}`, severity: "critical", title: "Stock crítico", detail: `${product.name}: quedan ${product.stock} unidades.` }));
  const automation = getAutomationConfiguration();
  alerts.push({ id: "supplier-review", severity: automation.supplierConfigured ? "warning" : "info", title: "Sincronización de proveedor", detail: automation.supplierConfigured ? "La última variación de costos de CJ Dropshipping está pendiente de confirmación." : "Conecta CJ_DROPSHIPPING_API_URL y CJ_DROPSHIPPING_API_TOKEN para activar la sincronización." }, { id: "automation-session", severity: automation.adminSessionConfigured && automation.cronConfigured ? "info" : "warning", title: "Automatización", detail: automation.adminSessionConfigured && automation.cronConfigured ? "Sesión de administrador y cron protegidos correctamente." : "Revisa ADMIN_PASSWORD, ADMIN_SESSION_SECRET y CRON_SECRET en Vercel." });
  return { revenue: 2849600, conversion: 3.8, orders: 19, inventory: products.reduce((total, product) => total + product.stock, 0), alerts, products };
}
