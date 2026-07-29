import { getCatalog, getCatalogImportMetadata } from "@/lib/catalog-store";
import { getCatalogDecision } from "@/lib/products";
import { getSalesDashboardSnapshot } from "@/lib/sales-dashboard";
import { getAutomationConfiguration } from "@/lib/automation/runtime-auth";

export type DashboardAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
};

export async function getDashboardSnapshot() {
  const products = await getCatalog();
  const salesDashboard = await getSalesDashboardSnapshot();
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
  alerts.push({
    id: "supplier-sync",
    severity: automation.productDiscoveryConfigured ? "info" : "warning",
    title: "Sincronización CJ",
    detail: automation.productDiscoveryConfigured
      ? "Product List v2 e inventario oficial por SKU se consultan con límite conservador. GitHub Actions solo versiona cambios reales del catálogo."
      : "Falta CJ_DROPSHIPPING_API_KEY. No se consultará ni se inventará catálogo del proveedor.",
  });

  if (salesDashboard.priceReviewCount) {
    alerts.push({
      id: "catalog-contribution",
      severity: "warning",
      title: "Revisión de rentabilidad pendiente",
      detail: `${salesDashboard.priceReviewCount} productos no alcanzan el objetivo de contribución después de Wompi antes de flete y CAC. Revísalos en Ventas y postventa antes de escalar pauta o promociones.`,
    });
  }
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
