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

  alerts.push(...products.filter((product) => product.stock < 5).map((product) => {
    const decision = getCatalogDecision(product);
    const paused = decision === "pause";
    return {
      id: `stock-${product.sku}`,
      severity: "critical" as const,
      title: paused ? "Venta pausada por stock crítico" : "Stock crítico",
      detail: paused
        ? `${product.name}: CJ reporta ${product.stock} unidades. El producto quedó fuera de la tienda y del checkout hasta una próxima importación verificada.`
        : `${product.name}: quedan ${product.stock} unidades reportadas por el proveedor. El checkout consultará CJ antes de cobrar.`,
    };
  }));

  const paused = products.filter((product) => getCatalogDecision(product) === "pause");
  if (paused.length) {
    alerts.push({
      id: "catalog-performance",
      severity: "warning",
      title: "Productos pausados",
      detail: `${paused.map((product) => product.name).join(", ")} no se muestran ni se venden por stock o rendimiento.`,
    });
  }

  const automation = getAutomationConfiguration();
  if (automation.supplierUsingLegacyCredentialName) {
    alerts.push({
      id: "cj-legacy-credential-name",
      severity: "warning",
      title: "Migración de credencial CJ pendiente",
      detail: "La variable CJ_DROPSHIPPING_API_TOKEN funciona solo como alias temporal. Copia su valor a CJ_DROPSHIPPING_API_KEY en Vercel, valida una importación y luego elimina el alias heredado.",
    });
  }
  alerts.push({
    id: "supplier-sync",
    severity: automation.productDiscoveryConfigured ? "info" : "warning",
    title: "Sincronización CJ",
    detail: automation.productDiscoveryConfigured
      ? "Product List v2 e inventario oficial por SKU se consultan con límite conservador. GitHub Actions solo versiona cambios reales del catálogo."
      : "Falta CJ_DROPSHIPPING_API_KEY. No se consultará ni se inventará catálogo del proveedor.",
  });
  alerts.push({
    id: "automation-session",
    severity: automation.adminSessionConfigured && automation.cronConfigured ? "info" : "warning",
    title: "Automatización",
    detail: automation.adminSessionConfigured && automation.cronConfigured
      ? "La sesión, el cron y la actualización manual están protegidos. El botón del panel solo recarga la versión ya publicada y no consume cuota de CJ."
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
