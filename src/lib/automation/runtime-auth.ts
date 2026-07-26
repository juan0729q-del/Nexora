import "server-only";

import { getCjCredentialConfiguration } from "./cj-client";

/** Centraliza la protección de procesos iniciados por Vercel Cron o un agente de IA. */
export function hasValidCronAuthorization(authorization: string | null) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && authorization === `Bearer ${secret}`);
}

/** Protección independiente para una importación manual de catálogo desde Vercel. */
export function hasValidCatalogImportAuthorization(authorization: string | null) {
  const seedSecret = process.env.CATALOG_IMPORT_SECRET;
  return hasValidCronAuthorization(authorization) || Boolean(seedSecret && authorization === `Bearer ${seedSecret}`);
}

export function getAutomationConfiguration() {
  const cjCredential = getCjCredentialConfiguration();
  return {
    cronConfigured: Boolean(process.env.CRON_SECRET),
    supplierConfigured: cjCredential.configured,
    supplierUsingLegacyCredentialName: cjCredential.usingLegacyName,
    topSellingConfigured: Boolean(process.env.CJ_DROPSHIPPING_TOP_SELLING_URL && cjCredential.configured),
    productSyncConfigured: Boolean(process.env.CJ_DROPSHIPPING_PRODUCT_SYNC_URL && cjCredential.configured),
    adminSessionConfigured: Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET),
    catalogAutomationEnabled: process.env.CATALOG_AUTOMATION_ENABLED !== "false",
  };
}
