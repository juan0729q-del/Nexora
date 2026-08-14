import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { paypalCaptureEventId, type VerifiedPayPalCapture } from "../src/lib/payments/paypal-core";

const baseCapture = {
  orderId: "5O190127TN364715T",
  captureId: "3C679366HH908993F",
  reference: "NXR-CART-ABCDEF123456",
  status: "APPROVED",
  amount: 31.25,
  currency: "USD",
} as const;

function simulatePrivateLedgerDelivery(deliveries: VerifiedPayPalCapture[]) {
  const eventIds = new Set<string>();
  let reconciliations = 0;
  let notificationDispatches = 0;
  let adminNotifications = 0;
  let customerNotifications = 0;
  for (const delivery of deliveries) {
    const eventId = paypalCaptureEventId(delivery.captureId, delivery.status);
    if (eventIds.has(eventId)) continue;
    eventIds.add(eventId);
    reconciliations += 1;
    if (delivery.status === "APPROVED") {
      notificationDispatches += 1;
      adminNotifications += 1;
      customerNotifications += 1;
    }
  }
  return { eventIds, reconciliations, notificationDispatches, adminNotifications, customerNotifications };
}

test("retorno y webhook de la misma captura concilian y notifican una sola vez por destinatario", async () => {
  const fromReturn: VerifiedPayPalCapture = {
    ...baseCapture,
    updatedAt: "2026-08-13T20:00:01Z",
    verificationSource: "capture",
  };
  const fromWebhook: VerifiedPayPalCapture = {
    ...baseCapture,
    updatedAt: "2026-08-13T20:00:05Z",
    verificationSource: "webhook",
  };

  assert.equal(
    paypalCaptureEventId(fromReturn.captureId, fromReturn.status),
    paypalCaptureEventId(fromWebhook.captureId, fromWebhook.status),
  );
  const result = simulatePrivateLedgerDelivery([fromReturn, fromWebhook]);
  assert.equal(result.eventIds.size, 1);
  assert.equal(result.reconciliations, 1);
  assert.equal(result.notificationDispatches, 1);
  assert.equal(result.adminNotifications, 1);
  assert.equal(result.customerNotifications, 1);

  const appsScript = await readFile(new URL("../docs/google-apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(appsScript, /const lock = LockService\.getScriptLock\(\)/);
  assert.match(appsScript, /const duplicateRow = findRowByValue_\(events, EVENT_HEADERS, "ID evento", event\.eventId\)/);
  assert.match(appsScript, /if \(duplicateRow\) \{/);
  assert.match(appsScript, /!value\.startsWith\("ENVIADO"\)/);
  const duplicateGuard = appsScript.indexOf("if (duplicateRow) {");
  const orderReconciliation = appsScript.indexOf("const upserted = upsertOrder_");
  assert.ok(duplicateGuard >= 0 && orderReconciliation >= 0);
  assert.ok(duplicateGuard < orderReconciliation, "el duplicado debe salir antes de volver a conciliar");
});

test("el estado forma parte de la identidad, pero verificationSource no", () => {
  const approved = paypalCaptureEventId(baseCapture.captureId, "APPROVED");
  const voided = paypalCaptureEventId(baseCapture.captureId, "VOIDED");
  assert.notEqual(approved, voided);
  assert.equal(approved, "paypal:3C679366HH908993F:APPROVED");
});
