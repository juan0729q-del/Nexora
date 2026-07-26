import { getCatalog, getCatalogImportMetadata } from "@/lib/catalog-store";
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
  const catalogMetadata = getCatalogImportMetadata();
  const alerts: DashboardAlert[] = [];

  if (!products.length) {
    alerts.push({
      id: "catalog-empty",
      severity: "critical",
      title: "Catálogo sin productos publicados",
      detail: "No hay datos CJ verificados en catalog.json. Nexora no mostrará productos ni imágenes de relleno.",
    });
  }

  alerts.push(...products.filter((product) => product.stock < 5).map((product) => ({
    id: `stock-${product.sku}`,
    severity: "critical" as const,
    title: "Stock crítico",
    detail: `${product.name}: quedan ${product.stock} unidades reportadas por el proveedor.`,
  })));

  const paused = products.filter((product) => getCatalogDecision(product) === "pause");
  if (paused.length) {
    alerts.push({
      id: "catalog-performance",
      severity: "warning",
      title: "Productos pausados",
      detail: `${paused.map((product) => product.name).join(", ")} no se muestra en la portada por stock o rendimiento.`,
    });
  }

  const automation = getAutomationConfiguration();
  if (automation.supplierUsingLegacyCredentialName) {
    alerts.push({
      id: "cj-legacy-credential-name",
      severity: "warning",
      title: "Migración de credencial CJ pendiente",
      detail: "CJ_DROPSHIPPING_API_TOKEN se usa únicamente como alias temporal de API Key. Renómbrala a CJ_DROPSHIPPING_API_KEY en Vercel tras validar la importación.",
    });
  }
  alerts.push({
    id: "supplier-sync",
    severity: automation.productDiscoveryConfigured ? "info" : "warning",
    title: "Sincronización CJ",
    detail: automation.productDiscoveryConfigured
      ? automation.productSyncConfigured
        ? "Product List v2 y la sincronización por SKU están configurados; el cron generará propuestas versionables."
        : "Product List v2 puede descubrir productos trending con inventario verificado. La sincronización adicional por SKU permanece opcional."
      : "Falta CJ_DROPSHIPPING_API_KEY. No se consultará ni se inventará catálogo del proveedor.",
  });
  alerts.push({
    id: "automation-session",
    severity: automation.adminSessionConfigured && automation.cronConfigured ? "info" : "warning",
    title: "Automatización",
    detail: automation.adminSessionConfigured && automation.cronConfigured
      ? "La sesión administrativa y el cron están protegidos; los cambios se deben versionar para persistir."
      : "Revisa ADMIN_PASSWORD, ADMIN_SESSION_SECRET y CRON_SECRET en Vercel.",
  });

  return {
    revenue: null as number | null,
    conversion: null as number | null,
    orders: null as number | null,
    inventory: products.reduce((total, product) => total + product.stock, 0),
    catalogMetadata,
    alerts,
    products,
  };
}
