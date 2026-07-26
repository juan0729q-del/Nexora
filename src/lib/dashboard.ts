import { getCatalog } from "@/lib/catalog-store";
import { getCatalogDecision } from "@/lib/products";
import { getAutomationConfiguration } from "@/lib/automation/runtime-auth";

export type DashboardAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
};

export async function getDashboardSnapshot() {
  const products = await getCatalog();
  const alerts: DashboardAlert[] = products.filter((product) => product.stock < 5).map((product) => ({
    id: `stock-${product.sku}`,
    severity: "critical" as const,
    title: "Stock crítico",
    detail: `${product.name}: quedan ${product.stock} unidades reportadas por el proveedor.`,
  }));
  const paused = products.filter((product) => getCatalogDecision(product) === "pause");
  if (paused.length) alerts.push({
    id: "catalog-performance",
    severity: "warning",
    title: "Productos pausados",
    detail: `${paused.map((product) => product.name).join(", ")} no se muestra en la portada por stock o rendimiento.`,
  });
  const automation = getAutomationConfiguration();
  alerts.push(
    {
      id: "supplier-sync",
      severity: automation.supplierConfigured ? "info" : "warning",
      title: "Sincronización CJ",
      detail: automation.supplierConfigured ? "Las credenciales de CJ están configuradas; el cron actualizará stock y costos." : "Faltan variables seguras de CJ Dropshipping.",
    },
    {
      id: "automation-session",
      severity: automation.adminSessionConfigured && automation.cronConfigured ? "info" : "warning",
      title: "Automatización",
      detail: automation.adminSessionConfigured && automation.cronConfigured ? "Sesión administrativa y cron protegidos correctamente." : "Revisa ADMIN_PASSWORD, ADMIN_SESSION_SECRET y CRON_SECRET en Vercel.",
    },
  );
  return {
    revenue: 0,
    conversion: 0,
    orders: 0,
    inventory: products.reduce((total, product) => total + product.stock, 0),
    alerts,
    products,
  };
}
