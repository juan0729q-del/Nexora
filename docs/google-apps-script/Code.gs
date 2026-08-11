/*
 * Nexora — libro privado de ventas y postventa
 *
 * Configuración (Project Settings > Script properties):
 * - NEXORA_SHEETS_SPREADSHEET_ID: ID del libro privado de Google Sheets.
 * - NEXORA_SALES_WEBHOOK_SECRET: secreto HMAC compartido con Vercel (>= 32 caracteres).
 * - NEXORA_ADMIN_EMAIL: nexoraventas1@gmail.com
 *
 * Despliegue: Web app, ejecutar como propietario, acceso "Anyone". El acceso
 * público no concede lectura: cada POST se firma con HMAC dentro del cuerpo.
 */

const NEXORA = Object.freeze({
  CONTRACT_VERSION: "2026-08-01.3",
  ORDERS_SHEET: "Pedidos",
  EVENTS_SHEET: "Eventos",
  // Conserva la pestaña creada en la primera configuración de Nexora.
  DASHBOARD_SHEET: "Panel de control",
  INTELLIGENCE_EVENTS_SHEET: "Eventos IA",
  INTELLIGENCE_DECISIONS_SHEET: "Decisiones IA",
  TIME_ZONE: "America/Bogota",
  MAX_AGE_MS: 5 * 60 * 1000,
  ADMIN_EMAIL: "nexoraventas1@gmail.com",
});

const ORDER_HEADERS = [
  "ID pedido", "Referencia Wompi", "Creado (UTC)", "Actualizado (UTC)",
  "Estado pago", "Estado postventa", "SKU", "Producto", "Nicho", "Cantidad",
  "Moneda", "Total pedido COP", "Total pagado COP", "Costo proveedor COP",
  "Comisión Wompi COP", "Neto estimado COP", "Contribución COP", "Margen contribución",
  "Cliente", "Email cliente", "Teléfono cliente", "Destinatario envío",
  "Dirección envío 1", "Dirección envío 2", "Ciudad envío", "Departamento/estado",
  "País envío", "Código postal", "Método de pago", "ID transacción Wompi",
  "Pago actualizado (UTC)", "ID pedido CJ", "Transportadora", "Guía", "URL rastreo",
  "Actualizado postventa (UTC)", "Último aviso admin", "Último aviso cliente",
  "Origen", "Revisar", "Notas",
  // Se agregan al final para no desplazar las columnas que ya existen en el
  // libro privado. La migración de ensureSheet_ las crea de forma aditiva.
  "Subtotal productos COP", "Envío cobrado COP", "Costo envío CJ COP",
  "Cotización envío CJ USD", "Tasa USD/COP", "Método envío CJ",
  "Canal envío CJ", "Entrega estimada CJ", "Origen envío CJ",
  "ID opción logística CJ", "Cotizado envío (UTC)",
  "Número de casa envío",
  // Variante concreta elegida al cotizar. Se agrega al final para no mover
  // datos existentes ni confundir despachos ya registrados.
  "SKU variante CJ", "Variante elegida",
  // Detalle estructurado del carrito para preparar cada línea exacta en CJ.
  "Artículos JSON",
];

const EVENT_HEADERS = [
  "ID evento", "Tipo", "Fecha evento (UTC)", "Recibido (UTC)", "Referencia Wompi",
  "ID transacción Wompi", "Estado pago", "Estado postventa", "Monto COP", "Origen",
  "Huella SHA-256", "Aviso admin", "Aviso cliente", "Detalle",
];

const INTELLIGENCE_EVENT_HEADERS = [
  "ID evento", "ID sesión anónima", "Tipo", "Fecha evento (UTC)", "Recibido (UTC)",
  "Página", "Slug producto", "SKU producto", "SKU variante", "Nicho", "Cantidad",
  "Valor COP", "Origen",
];

const INTELLIGENCE_DECISION_HEADERS = [
  "ID propuesta", "Creada (UTC)", "Expira (UTC)", "Estado", "Acción", "SKU objetivo",
  "Slug objetivo", "Nicho", "Título", "Resumen", "Confianza %", "Razones JSON",
  "Beneficios JSON", "Riesgos JSON", "Implicaciones", "Reversión", "Evidencia JSON",
  "Tipo ejecución", "Decidida (UTC)", "Nota decisión",
];

/** Ejecutar una sola vez después de guardar las Script properties. */
function setupNexoraWorkbook() {
  const config = getConfig_();
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  spreadsheet.setSpreadsheetTimeZone(config.timeZone);
  const orders = ensureSheet_(spreadsheet, NEXORA.ORDERS_SHEET, ORDER_HEADERS);
  const events = ensureSheet_(spreadsheet, NEXORA.EVENTS_SHEET, EVENT_HEADERS);
  ensureSheet_(spreadsheet, NEXORA.INTELLIGENCE_EVENTS_SHEET, INTELLIGENCE_EVENT_HEADERS);
  ensureSheet_(spreadsheet, NEXORA.INTELLIGENCE_DECISIONS_SHEET, INTELLIGENCE_DECISION_HEADERS);
  formatOrderColumns_(orders);
  formatEventColumns_(events);
  setupDashboard_(spreadsheet);
  ensureNotificationRetryTrigger_();
  SpreadsheetApp.flush();
}

/** Alias conservado para ejecuciones creadas antes de la normalización del nombre. */
function configurarNexoraWorkbook() {
  return setupNexoraWorkbook();
}

/** Recibe sólo eventos ya verificados por Vercel/Wompi. */
function doPost(e) {
  try {
    const rawEnvelope = (((e || {}).postData || {}).contents || "");
    const input = signedPayload_(rawEnvelope);
    // La lectura administrativa también es POST firmado. No se transmite PII
    // ni una firma reutilizable en la URL pública del Web App.
    if (input && input.action === "admin.read") {
      return json_({ ok: true, data: readAdminSnapshot_() });
    }
    if (input && input.action === "intelligence.events.write") {
      return json_({ ok: true, data: writeIntelligenceEvents_(input.events) });
    }
    if (input && input.action === "intelligence.proposals.sync") {
      return json_({ ok: true, data: syncIntelligenceProposals_(input.proposals) });
    }
    if (input && input.action === "intelligence.decision") {
      return json_({ ok: true, data: decideIntelligenceProposal_(input) });
    }
    if (input && input.action === "intelligence.proposal.decide") {
      return json_({ ok: true, data: upsertAndDecideIntelligenceProposal_(input) });
    }
    if (input && input.action === "intelligence.read") {
      return json_({ ok: true, data: readIntelligenceSnapshot_() });
    }
    const event = normalizeEvent_(input);
    const raw = JSON.stringify(input);
    const data = processEvent_(event, raw, new Date());
    return json_({ ok: true, data: data });
  } catch (error) {
    // Nunca se incluyen datos de cliente o del payload en la respuesta pública.
    const message = error && error.message ? String(error.message) : "sales-ledger failure";
    console.error(message);
    // Los códigos NXI sólo contienen etapa y clase técnica; nunca payload ni PII.
    return json_({ ok: false, error: message.indexOf("NXI_") === 0 ? message : "invalid_or_unavailable" });
  }
}

/** Comprobación no sensible para monitorización; no entrega pedidos ni clientes. */
function doGet(e) {
  return json_({
    ok: true,
    service: "nexora-sales-ledger",
    contractVersion: NEXORA.CONTRACT_VERSION,
    workbookReady: workbookReady_(),
    at: isoNow_(),
  });
}

function workbookReady_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("nexora_workbook_ready");
  if (cached === "true" || cached === "false") return cached === "true";
  let ready = false;
  try {
    const config = getConfig_();
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    const requirements = [
      [NEXORA.ORDERS_SHEET, ORDER_HEADERS.length],
      [NEXORA.EVENTS_SHEET, EVENT_HEADERS.length],
      [NEXORA.DASHBOARD_SHEET, 2],
    ];
    ready = requirements.every(function (requirement) {
      const sheet = spreadsheet.getSheetByName(requirement[0]);
      return Boolean(sheet && sheet.getLastRow() >= 1 && sheet.getMaxColumns() >= requirement[1]);
    });
  } catch (error) {
    ready = false;
  }
  cache.put("nexora_workbook_ready", String(ready), ready ? 300 : 30);
  return ready;
}

function intelligenceSheets_() {
  const config = getConfig_();
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  return {
    events: ensureSheet_(spreadsheet, NEXORA.INTELLIGENCE_EVENTS_SHEET, INTELLIGENCE_EVENT_HEADERS),
    decisions: ensureSheet_(spreadsheet, NEXORA.INTELLIGENCE_DECISIONS_SHEET, INTELLIGENCE_DECISION_HEADERS),
  };
}

function safeIntelligenceText_(value, maxLength) {
  return String(value === undefined || value === null ? "" : value).trim().slice(0, maxLength || 500);
}

function writeIntelligenceEvents_(incoming) {
  if (!Array.isArray(incoming) || incoming.length < 1 || incoming.length > 50) throw new Error("invalid intelligence event batch");
  const allowed = {
    page_viewed: true, product_viewed: true, variant_selected: true, cart_added: true,
    cart_removed: true, shipping_quote_requested: true, shipping_quote_succeeded: true,
    shipping_quote_failed: true, shipping_method_selected: true, checkout_started: true,
    checkout_created: true, checkout_failed: true,
  };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error("intelligence ledger busy");
  try {
    const sheet = intelligenceSheets_().events;
    let accepted = 0;
    let duplicates = 0;
    incoming.forEach(function (event) {
      const eventId = safeIntelligenceText_(event && event.eventId, 100);
      const sessionId = safeIntelligenceText_(event && event.sessionId, 100);
      const type = safeIntelligenceText_(event && event.type, 60);
      const occurredAt = safeIntelligenceText_(event && event.occurredAt, 40);
      if (!eventId || !sessionId || !allowed[type] || !occurredAt) throw new Error("invalid intelligence event");
      if (findRowByValue_(sheet, INTELLIGENCE_EVENT_HEADERS, "ID evento", eventId)) {
        duplicates += 1;
        return;
      }
      const row = {
        "ID evento": eventId,
        "ID sesión anónima": sessionId,
        "Tipo": type,
        "Fecha evento (UTC)": occurredAt,
        "Recibido (UTC)": isoNow_(),
        "Página": safeIntelligenceText_(event.page, 220),
        "Slug producto": safeIntelligenceText_(event.productSlug, 140),
        "SKU producto": safeIntelligenceText_(event.productSku, 100),
        "SKU variante": safeIntelligenceText_(event.variantSku, 120),
        "Nicho": safeIntelligenceText_(event.niche, 40),
        "Cantidad": Math.max(0, Number(event.quantity) || 0),
        "Valor COP": Math.max(0, Number(event.valueCop) || 0),
        "Origen": safeIntelligenceText_(event.source || "storefront", 60),
      };
      sheet.appendRow(INTELLIGENCE_EVENT_HEADERS.map(function (header) { return row[header]; }));
      accepted += 1;
    });
    return { accepted: accepted, duplicates: duplicates };
  } finally {
    lock.releaseLock();
  }
}

function syncIntelligenceProposals_(incoming) {
  if (!Array.isArray(incoming) || incoming.length > 40) throw new Error("invalid proposal batch");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error("intelligence ledger busy");
  try {
    const sheet = intelligenceSheets_().decisions;
    let inserted = 0;
    let preserved = 0;
    incoming.forEach(function (proposal) {
      const id = safeIntelligenceText_(proposal && proposal.id, 120);
      if (!id) throw new Error("invalid proposal");
      const existingRow = findRowByValue_(sheet, INTELLIGENCE_DECISION_HEADERS, "ID propuesta", id);
      if (existingRow) {
        preserved += 1;
        return;
      }
      const row = {
        "ID propuesta": id,
        "Creada (UTC)": safeIntelligenceText_(proposal.createdAt, 40),
        "Expira (UTC)": safeIntelligenceText_(proposal.expiresAt, 40),
        "Estado": "proposed",
        "Acción": safeIntelligenceText_(proposal.action, 60),
        "SKU objetivo": safeIntelligenceText_(proposal.targetSku, 100),
        "Slug objetivo": safeIntelligenceText_(proposal.targetSlug, 140),
        "Nicho": safeIntelligenceText_(proposal.niche, 40),
        "Título": safeIntelligenceText_(proposal.title, 240),
        "Resumen": safeIntelligenceText_(proposal.summary, 700),
        "Confianza %": Math.max(0, Math.min(100, Number(proposal.confidencePercent) || 0)),
        "Razones JSON": JSON.stringify(proposal.rationale || []).slice(0, 5000),
        "Beneficios JSON": JSON.stringify(proposal.benefits || []).slice(0, 5000),
        "Riesgos JSON": JSON.stringify(proposal.risks || []).slice(0, 5000),
        "Implicaciones": safeIntelligenceText_(proposal.implications, 1500),
        "Reversión": safeIntelligenceText_(proposal.rollback, 1000),
        "Evidencia JSON": JSON.stringify(proposal.evidence || []).slice(0, 8000),
        "Tipo ejecución": safeIntelligenceText_(proposal.execution, 60),
        "Decidida (UTC)": "",
        "Nota decisión": "",
      };
      sheet.appendRow(INTELLIGENCE_DECISION_HEADERS.map(function (header) { return row[header]; }));
      inserted += 1;
    });
    return { inserted: inserted, preserved: preserved };
  } finally {
    lock.releaseLock();
  }
}

function decideIntelligenceProposal_(input) {
  const proposalId = safeIntelligenceText_(input && input.proposalId, 120);
  const decision = safeIntelligenceText_(input && input.decision, 30);
  const note = safeIntelligenceText_(input && input.note, 800);
  if (!proposalId || (decision !== "authorized" && decision !== "rejected")) throw new Error("invalid decision");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error("intelligence ledger busy");
  try {
    const sheet = intelligenceSheets_().decisions;
    const rowNumber = findRowByValue_(sheet, INTELLIGENCE_DECISION_HEADERS, "ID propuesta", proposalId);
    if (!rowNumber) throw new Error("unknown proposal");
    const row = readRow_(sheet, rowNumber, INTELLIGENCE_DECISION_HEADERS);
    const current = safeIntelligenceText_(row["Estado"], 30);
    if (current !== "proposed" && current !== decision) throw new Error("proposal already decided");
    row["Estado"] = decision;
    row["Decidida (UTC)"] = isoNow_();
    row["Nota decisión"] = note;
    sheet.getRange(rowNumber, 1, 1, INTELLIGENCE_DECISION_HEADERS.length).setValues([
      INTELLIGENCE_DECISION_HEADERS.map(function (header) { return row[header] === undefined ? "" : row[header]; }),
    ]);
    return { proposalId: proposalId, status: decision, decidedAt: row["Decidida (UTC)"] };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Persiste la propuesta y la decisión bajo un único bloqueo. Esta es la ruta
 * preferida por Nexora para evitar carreras entre dos solicitudes HTTP.
 */
function upsertAndDecideIntelligenceProposal_(input) {
  const proposal = input && input.proposal;
  const proposalId = safeIntelligenceText_(proposal && proposal.id, 120);
  const decision = safeIntelligenceText_(input && input.decision, 30);
  const note = safeIntelligenceText_(input && input.note, 800);
  if (!proposalId || (decision !== "authorized" && decision !== "rejected")) throw new Error("invalid atomic intelligence decision");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error("intelligence ledger busy");
  let stage = "open_config";
  try {
    const config = getConfig_();
    stage = "open_spreadsheet";
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    stage = "ensure_sheet";
    const sheet = ensureSheet_(spreadsheet, NEXORA.INTELLIGENCE_DECISIONS_SHEET, INTELLIGENCE_DECISION_HEADERS);
    stage = "find_proposal";
    let rowNumber = findRowByValue_(sheet, INTELLIGENCE_DECISION_HEADERS, "ID propuesta", proposalId);
    let row;

    if (rowNumber) {
      row = readRow_(sheet, rowNumber, INTELLIGENCE_DECISION_HEADERS);
      const current = safeIntelligenceText_(row["Estado"], 30);
      if (current !== "proposed" && current !== decision) throw new Error("proposal already decided");
    } else {
      rowNumber = sheet.getLastRow() + 1;
      row = intelligenceProposalRow_(proposal);
    }

    row["Estado"] = decision;
    row["Decidida (UTC)"] = isoNow_();
    row["Nota decisión"] = note;
    stage = "write_decision";
    sheet.getRange(rowNumber, 1, 1, INTELLIGENCE_DECISION_HEADERS.length).setValues([
      INTELLIGENCE_DECISION_HEADERS.map(function (header) {
        const value = row[header];
        return value === undefined || value === null ? "" : value;
      }),
    ]);
    stage = "flush";
    SpreadsheetApp.flush();
    return { proposalId: proposalId, status: decision, decidedAt: row["Decidida (UTC)"] };
  } catch (error) {
    const detail = String(error && error.message ? error.message : "unknown").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 70);
    throw new Error("NXI_" + stage + "_" + detail);
  } finally {
    lock.releaseLock();
  }
}

function intelligenceProposalRow_(proposal) {
  return {
    "ID propuesta": safeIntelligenceText_(proposal && proposal.id, 120),
    "Creada (UTC)": safeIntelligenceText_(proposal && proposal.createdAt, 40),
    "Expira (UTC)": safeIntelligenceText_(proposal && proposal.expiresAt, 40),
    "Estado": "proposed",
    "Acción": safeIntelligenceText_(proposal && proposal.action, 60),
    "SKU objetivo": safeIntelligenceText_(proposal && proposal.targetSku, 100),
    "Slug objetivo": safeIntelligenceText_(proposal && proposal.targetSlug, 140),
    "Nicho": safeIntelligenceText_(proposal && proposal.niche, 40),
    "Título": safeIntelligenceText_(proposal && proposal.title, 240),
    "Resumen": safeIntelligenceText_(proposal && proposal.summary, 700),
    "Confianza %": Math.max(0, Math.min(100, Number(proposal && proposal.confidencePercent) || 0)),
    "Razones JSON": JSON.stringify((proposal && proposal.rationale) || []).slice(0, 5000),
    "Beneficios JSON": JSON.stringify((proposal && proposal.benefits) || []).slice(0, 5000),
    "Riesgos JSON": JSON.stringify((proposal && proposal.risks) || []).slice(0, 5000),
    "Implicaciones": safeIntelligenceText_(proposal && proposal.implications, 1500),
    "Reversión": safeIntelligenceText_(proposal && proposal.rollback, 1000),
    "Evidencia JSON": JSON.stringify((proposal && proposal.evidence) || []).slice(0, 8000),
    "Tipo ejecución": safeIntelligenceText_(proposal && proposal.execution, 60),
    "Decidida (UTC)": "",
    "Nota decisión": "",
  };
}

function parseJsonArray_(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function readIntelligenceSnapshot_() {
  const sheets = intelligenceSheets_();
  const eventRows = sheets.events.getLastRow() > 1
    ? sheets.events.getRange(2, 1, sheets.events.getLastRow() - 1, INTELLIGENCE_EVENT_HEADERS.length).getValues()
    : [];
  const decisionRows = sheets.decisions.getLastRow() > 1
    ? sheets.decisions.getRange(2, 1, sheets.decisions.getLastRow() - 1, INTELLIGENCE_DECISION_HEADERS.length).getValues()
    : [];
  const events = eventRows.map(function (values) {
    const row = {};
    INTELLIGENCE_EVENT_HEADERS.forEach(function (header, index) { row[header] = values[index]; });
    return row;
  });
  const sessions = {};
  const counts = {};
  let firstEventAt = null;
  let lastEventAt = null;
  events.forEach(function (event) {
    const type = String(event["Tipo"] || "");
    counts[type] = (counts[type] || 0) + 1;
    sessions[String(event["ID sesión anónima"] || "")] = true;
    const occurredAt = new Date(event["Fecha evento (UTC)"]).toISOString();
    if (!firstEventAt || occurredAt < firstEventAt) firstEventAt = occurredAt;
    if (!lastEventAt || occurredAt > lastEventAt) lastEventAt = occurredAt;
  });
  const quoteRequests = counts.shipping_quote_requested || 0;
  const checkoutStarts = counts.checkout_started || 0;
  const coverageParts = [];
  if (quoteRequests) coverageParts.push(Math.min(1, ((counts.shipping_quote_succeeded || 0) + (counts.shipping_quote_failed || 0)) / quoteRequests));
  if (checkoutStarts) coverageParts.push(Math.min(1, ((counts.checkout_created || 0) + (counts.checkout_failed || 0)) / checkoutStarts));
  const proposals = decisionRows.slice(-60).reverse().map(function (values) {
    const row = {};
    INTELLIGENCE_DECISION_HEADERS.forEach(function (header, index) { row[header] = values[index]; });
    return {
      id: String(row["ID propuesta"] || ""), createdAt: String(row["Creada (UTC)"] || ""), expiresAt: String(row["Expira (UTC)"] || ""),
      status: String(row["Estado"] || "proposed"), action: String(row["Acción"] || "monitor_product"),
      targetSku: String(row["SKU objetivo"] || "") || undefined, targetSlug: String(row["Slug objetivo"] || "") || undefined,
      niche: String(row["Nicho"] || "technologyHome"), title: String(row["Título"] || ""), summary: String(row["Resumen"] || ""),
      confidencePercent: Number(row["Confianza %"] || 0), rationale: parseJsonArray_(row["Razones JSON"]), benefits: parseJsonArray_(row["Beneficios JSON"]),
      risks: parseJsonArray_(row["Riesgos JSON"]), implications: String(row["Implicaciones"] || ""), rollback: String(row["Reversión"] || ""),
      evidence: parseJsonArray_(row["Evidencia JSON"]), execution: String(row["Tipo ejecución"] || "advisory"),
      decidedAt: String(row["Decidida (UTC)"] || "") || undefined, decisionNote: String(row["Nota decisión"] || "") || undefined,
    };
  });
  return {
    events: {
      firstEventAt: firstEventAt, lastEventAt: lastEventAt, trackedEvents: events.length,
      trackedSessions: Math.max(0, Object.keys(sessions).filter(Boolean).length), productViews: counts.product_viewed || 0,
      cartAdds: counts.cart_added || 0, shippingQuotes: counts.shipping_quote_succeeded || 0,
      checkoutStarts: checkoutStarts, checkoutCreated: counts.checkout_created || 0,
      eventCoveragePercent: coverageParts.length ? Math.round(coverageParts.reduce(function (sum, value) { return sum + value; }, 0) / coverageParts.length * 100) : 0,
    },
    proposals: proposals,
  };
}

function processEvent_(event, raw, receivedAt) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error("ledger busy");
  try {
    const config = getConfig_();
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    // La primera solicitud posterior a una actualización también puede añadir
    // columnas nuevas, por lo que no depende de que el administrador ejecute
    // manualmente una migración antes de recibir un pago.
    const orders = ensureSheet_(spreadsheet, NEXORA.ORDERS_SHEET, ORDER_HEADERS);
    const events = ensureSheet_(spreadsheet, NEXORA.EVENTS_SHEET, EVENT_HEADERS);

    const duplicateRow = findRowByValue_(events, EVENT_HEADERS, "ID evento", event.eventId);
    const existingOrderRow = findRowByValue_(orders, ORDER_HEADERS, "Referencia Wompi", event.order.reference);
    if (event.type === "fulfillment.updated") {
      if (!existingOrderRow) throw new Error("fulfillment for unknown order");
      const existingOrder = readRow_(orders, existingOrderRow, ORDER_HEADERS);
      if (String(existingOrder["Estado pago"]).toUpperCase() !== "APPROVED" || String(existingOrder["Revisar"]).toUpperCase() === "SÍ") {
        throw new Error("fulfillment requires reconciled approved payment");
      }
    }
    const upserted = upsertOrder_(orders, event, receivedAt, existingOrderRow);
    const eventRow = duplicateRow || appendEvent_(events, event, raw, receivedAt);
    retryNotifications_(config, orders, upserted.row, upserted.order, events, eventRow, event);

    return {
      reference: event.order.reference,
      paymentStatus: String(upserted.order["Estado pago"] || "PENDING"),
      fulfillmentStatus: String(upserted.order["Estado postventa"] || "PENDIENTE"),
      needsReview: String(upserted.order["Revisar"] || "").toUpperCase() === "SÍ",
      duplicate: Boolean(duplicateRow),
    };
  } finally {
    lock.releaseLock();
  }
}

function upsertOrder_(sheet, event, receivedAt, existingRow) {
  existingRow = existingRow || findRowByValue_(sheet, ORDER_HEADERS, "Referencia Wompi", event.order.reference);
  const row = existingRow || sheet.getLastRow() + 1;
  const current = existingRow ? readRow_(sheet, row, ORDER_HEADERS) : {};
  const order = mergeOrder_(current, event, receivedAt, !existingRow);
  sheet.getRange(row, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS.map(function (header) {
    return order[header] === undefined || order[header] === null ? "" : order[header];
  })]);
  return { row: row, order: order };
}

function mergeOrder_(current, event, receivedAt, isNew) {
  const out = {};
  ORDER_HEADERS.forEach(function (header) { out[header] = current[header] === undefined ? "" : current[header]; });
  const order = event.order;
  const payment = event.payment || {};
  const fulfillment = event.fulfillment || {};
  const finance = order.finance || {};
  const customer = order.customer || {};
  const shipping = order.shipping || {};

  setIfBlank_(out, "ID pedido", order.id || event.eventId);
  setIfBlank_(out, "Referencia Wompi", order.reference);
  setIfBlank_(out, "Creado (UTC)", event.occurredAt);
  setIfBlank_(out, "Estado pago", "CHECKOUT_PREPARADO");
  setIfBlank_(out, "Estado postventa", "PENDIENTE DE PAGO");
  setIfBlank_(out, "Moneda", order.currency || "COP");

  setIfPresent_(out, "SKU", order.sku);
  // La variante llega en checkout.created desde la cotización firmada. El
  // webhook de Wompi no debe reemplazarla por el SKU padre del producto.
  setIfBlank_(out, "SKU variante CJ", order.variantSku);
  setIfBlank_(out, "Variante elegida", order.variantLabel);
  setIfPresent_(out, "Producto", order.productName);
  setIfPresent_(out, "Nicho", order.niche);
  setIfPresent_(out, "Cantidad", order.quantity);
  if (event.type === "checkout.created" && order.items && order.items.length) {
    setIfBlank_(out, "Artículos JSON", JSON.stringify(order.items));
  }
  // El checkout es la fuente de verdad para contacto y entrega porque esos
  // datos fueron usados para cotizar CJ. Wompi puede complementar un pedido
  // antiguo/incompleto, pero nunca reemplazar el correo o la dirección ya
  // guardados por Nexora.
  const setCustomerAndAddress = event.type === "checkout.created" ? setIfPresent_ : setIfBlank_;
  setCustomerAndAddress(out, "Cliente", customer.name);
  setCustomerAndAddress(out, "Email cliente", customer.email);
  setCustomerAndAddress(out, "Teléfono cliente", customer.phone);
  setCustomerAndAddress(out, "Destinatario envío", shipping.recipient);
  setCustomerAndAddress(out, "Dirección envío 1", shipping.address1);
  setCustomerAndAddress(out, "Dirección envío 2", shipping.address2);
  setCustomerAndAddress(out, "Número de casa envío", shipping.houseNumber);
  setCustomerAndAddress(out, "Ciudad envío", shipping.city);
  setCustomerAndAddress(out, "Departamento/estado", shipping.region);
  setCustomerAndAddress(out, "País envío", shipping.country);
  setCustomerAndAddress(out, "Código postal", shipping.postalCode);
  setIfPresent_(out, "Origen", event.source);

  [
    ["Total pedido COP", finance.orderTotalCop],
    ["Subtotal productos COP", finance.productSubtotalCop],
    ["Envío cobrado COP", finance.shippingChargedCop],
    ["Costo envío CJ COP", finance.supplierShippingCostCop],
    ["Cotización envío CJ USD", finance.shippingQuoteUsd],
    ["Tasa USD/COP", finance.exchangeRateCopPerUsd],
    ["Costo proveedor COP", finance.supplierCostCop],
    ["Comisión Wompi COP", finance.wompiFeeCop],
    ["Neto estimado COP", finance.netPayoutCop],
    ["Contribución COP", finance.contributionCop],
    ["Margen contribución", finance.contributionMargin],
  ].forEach(function (entry) { isNew ? setIfPresent_(out, entry[0], entry[1]) : setIfBlank_(out, entry[0], entry[1]); });

  // La cotización corresponde al checkout, no al webhook del medio de pago.
  // Se conserva el primer valor guardado para que una notificación tardía no
  // pueda reemplazar la selección que vio y aceptó la persona compradora.
  [
    ["Método envío CJ", shipping.method],
    ["Canal envío CJ", shipping.carrier],
    ["Entrega estimada CJ", shipping.estimatedDelivery],
    ["Origen envío CJ", shipping.originCountryCode],
    ["ID opción logística CJ", shipping.optionId],
    ["Cotizado envío (UTC)", shipping.quotedAt],
  ].forEach(function (entry) {
    if (event.type === "checkout.created") setIfBlank_(out, entry[0], entry[1]);
    else setIfBlank_(out, entry[0], entry[1]);
  });

  if (event.type === "payment.updated" && isNewer_(payment.updatedAt || event.occurredAt, out["Pago actualizado (UTC)"])) {
    setIfPresent_(out, "Estado pago", payment.status);
    setIfPresent_(out, "ID transacción Wompi", payment.id);
    setIfPresent_(out, "Método de pago", payment.method);
    setIfPresent_(out, "Total pagado COP", payment.amountCop);
    setIfPresent_(out, "Pago actualizado (UTC)", payment.updatedAt || event.occurredAt);
    [
      ["Comisión Wompi COP", finance.wompiFeeCop],
      ["Neto estimado COP", finance.netPayoutCop],
      ["Contribución COP", finance.contributionCop],
      ["Margen contribución", finance.contributionMargin],
    ].forEach(function (entry) { setIfPresent_(out, entry[0], entry[1]); });

    // Wompi comunica el monto realmente cobrado. Sólo se confirma la venta si
    // coincide exactamente con el total firmado al preparar el checkout
    // (subtotal de productos + envío seleccionado). Si falta ese total o hay
    // diferencia, se conserva la evidencia y se bloquea la postventa hasta la
    // revisión manual; jamás se trata como una venta conciliada.
    const expectedTotal = numberOrNull_(out["Total pedido COP"]);
    const paidTotal = payment.amountCop;
    const mustReconcile = payment.status === "APPROVED" || paidTotal !== null;
    const amountMismatch = mustReconcile && (expectedTotal === null || paidTotal === null || !sameMoney_(expectedTotal, paidTotal));
    const requiresReview = Boolean(event.needsReview) || amountMismatch || String(out["Revisar"] || "").toUpperCase() === "SÍ";
    if (requiresReview) {
      out["Revisar"] = "SÍ";
      out["Estado postventa"] = "REVISIÓN DE PAGO";
      if (amountMismatch) appendNote_(out, "Conciliación pendiente: total esperado " + cop_(expectedTotal) + ", total reportado " + cop_(paidTotal) + ".");
    } else if (payment.status === "APPROVED" && ["PENDIENTE DE PAGO", "CHECKOUT_PREPARADO"].indexOf(String(out["Estado postventa"])) !== -1) {
      out["Estado postventa"] = "PAGO CONFIRMADO";
    } else if (payment.status === "VOIDED") {
      // Una anulación oficial es terminal incluso si Wompi la comunica después
      // de una aprobación. Nunca debe permanecer como pago confirmado.
      out["Estado postventa"] = "CANCELADO";
    } else if (["DECLINED", "ERROR"].indexOf(payment.status) !== -1 && ["PENDIENTE DE PAGO", "CHECKOUT_PREPARADO"].indexOf(String(out["Estado postventa"])) !== -1) {
      out["Estado postventa"] = "PAGO NO COMPLETADO";
    }
  }

  if (event.type === "fulfillment.updated" && isNewer_(fulfillment.updatedAt || event.occurredAt, out["Actualizado postventa (UTC)"])) {
    setIfPresent_(out, "Estado postventa", fulfillment.status);
    setIfPresent_(out, "ID pedido CJ", fulfillment.cjOrderId);
    setIfPresent_(out, "Transportadora", fulfillment.carrier);
    setIfPresent_(out, "Guía", fulfillment.trackingNumber);
    setIfPresent_(out, "URL rastreo", fulfillment.trackingUrl);
    setIfPresent_(out, "Notas", fulfillment.notes);
    setIfPresent_(out, "Actualizado postventa (UTC)", fulfillment.updatedAt || event.occurredAt);
  }

  if (event.needsReview) out["Revisar"] = "SÍ";
  out["Actualizado (UTC)"] = receivedAt;
  return out;
}

function appendEvent_(sheet, event, raw, receivedAt) {
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, EVENT_HEADERS.length).setValues([[
    event.eventId, event.type, event.occurredAt, receivedAt, event.order.reference,
    (event.payment || {}).id || "", (event.payment || {}).status || "", (event.fulfillment || {}).status || "",
    (event.payment || {}).amountCop || "", event.source, sha256Hex_(raw), "", "", event.detail || "",
  ]]);
  return row;
}

function retryNotifications_(config, orders, orderRow, order, events, eventRow, event) {
  const row = readRow_(events, eventRow, EVENT_HEADERS);
  if (shouldNotifyAdmin_(event) && notificationCanRetry_(row["Aviso admin"])) {
    const state = sendAdminEmail_(config, order, event);
    setCellByHeader_(events, eventRow, EVENT_HEADERS, "Aviso admin", state);
    if (state.startsWith("ENVIADO")) setCellByHeader_(orders, orderRow, ORDER_HEADERS, "Último aviso admin", new Date());
  }
  if (shouldNotifyCustomer_(event, order) && notificationCanRetry_(row["Aviso cliente"])) {
    const state = sendCustomerEmail_(config, order, event);
    setCellByHeader_(events, eventRow, EVENT_HEADERS, "Aviso cliente", state);
    if (state.startsWith("ENVIADO")) setCellByHeader_(orders, orderRow, ORDER_HEADERS, "Último aviso cliente", new Date());
  }
}

function shouldNotifyAdmin_(event) {
  if (event.type === "fulfillment.updated") return true;
  return event.type === "payment.updated" && ["APPROVED", "DECLINED", "VOIDED", "ERROR"].indexOf(String((event.payment || {}).status)) !== -1;
}

function shouldNotifyCustomer_(event, order) {
  if (event.needsReview || String((order || {})["Revisar"] || "").toUpperCase() === "SÍ") return false;
  if (event.type === "payment.updated") return String((event.payment || {}).status) === "APPROVED";
  return event.type === "fulfillment.updated" && ["ENVIADO", "EN TRÁNSITO", "ENTREGADO"].indexOf(String((event.fulfillment || {}).status)) !== -1;
}

function notificationCanRetry_(state) {
  const value = String(state || "");
  return !value.startsWith("ENVIADO") && !value.startsWith("OMITIDO");
}

/** Reintenta únicamente avisos que no pudieron enviarse por cuota o fallo temporal. */
function retryPendingNotifications() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    const config = getConfig_();
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    const orders = ensureSheet_(spreadsheet, NEXORA.ORDERS_SHEET, ORDER_HEADERS);
    const events = ensureSheet_(spreadsheet, NEXORA.EVENTS_SHEET, EVENT_HEADERS);
    if (events.getLastRow() < 2) return;
    const rows = events.getRange(2, 1, events.getLastRow() - 1, EVENT_HEADERS.length).getValues();
    let attempts = 0;
    for (let index = rows.length - 1; index >= 0 && attempts < 20; index -= 1) {
      const eventRow = index + 2;
      const stored = rowToObject_(rows[index], EVENT_HEADERS);
      const adminRetry = /^(ERROR|BLOQUEADO)/.test(String(stored["Aviso admin"] || ""));
      const customerRetry = /^(ERROR|BLOQUEADO)/.test(String(stored["Aviso cliente"] || ""));
      if (!adminRetry && !customerRetry) continue;
      const orderRow = findRowByValue_(orders, ORDER_HEADERS, "Referencia Wompi", stored["Referencia Wompi"]);
      if (!orderRow) continue;
      const order = readRow_(orders, orderRow, ORDER_HEADERS);
      const event = {
        type: String(stored["Tipo"] || ""),
        needsReview: String(order["Revisar"] || "").toUpperCase() === "SÍ",
        payment: { status: String(stored["Estado pago"] || "") },
        fulfillment: { status: String(stored["Estado postventa"] || "") },
      };
      retryNotifications_(config, orders, orderRow, order, events, eventRow, event);
      attempts += 1;
    }
  } finally {
    lock.releaseLock();
  }
}

function ensureNotificationRetryTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === "retryPendingNotifications";
  });
  if (!exists) ScriptApp.newTrigger("retryPendingNotifications").timeBased().everyMinutes(15).create();
}

function sendAdminEmail_(config, order, event) {
  if (MailApp.getRemainingDailyQuota() < 1) return "BLOQUEADO: cuota diaria de correo";
  const text = [
    "Referencia: " + value_(order["Referencia Wompi"]),
    "Producto: " + value_(order["Producto"]),
    "Artículos del carrito:\n" + orderItemsText_(order),
    "SKU: " + value_(order["SKU"]),
    "SKU variante CJ: " + value_(order["SKU variante CJ"]),
    "Variante elegida: " + value_(order["Variante elegida"]),
    "Cliente: " + value_(order["Cliente"]),
    "Email: " + value_(order["Email cliente"]),
    "Teléfono: " + value_(order["Teléfono cliente"]),
    "Estado de pago: " + value_(order["Estado pago"]),
    "Estado postventa: " + value_(order["Estado postventa"]),
    "Subtotal de productos: " + cop_(order["Subtotal productos COP"]),
    "Envío cobrado al cliente: " + cop_(order["Envío cobrado COP"]),
    "Total esperado: " + cop_(order["Total pedido COP"]),
    "Total pagado: " + cop_(order["Total pagado COP"]),
    "Costo proveedor: " + cop_(order["Costo proveedor COP"]),
    "Costo de envío CJ: " + cop_(order["Costo envío CJ COP"]),
    "Cotización CJ: " + usd_(order["Cotización envío CJ USD"]) + " (tasa " + value_(order["Tasa USD/COP"]) + " COP/USD)",
    "Comisión Wompi: " + cop_(order["Comisión Wompi COP"]),
    "Contribución: " + cop_(order["Contribución COP"]),
    "Método de envío CJ: " + value_(order["Método envío CJ"]),
    "Canal/transportadora CJ: " + value_(order["Canal envío CJ"]),
    "Entrega estimada CJ: " + value_(order["Entrega estimada CJ"]),
    "Origen de envío CJ: " + value_(order["Origen envío CJ"]),
    "Envío: " + shippingText_(order),
    "Libro privado: " + SpreadsheetApp.openById(config.spreadsheetId).getUrl(),
  ].join("\n");
  try {
    MailApp.sendEmail({ to: config.adminEmail, replyTo: config.adminEmail, name: "Nexora", subject: "Nexora — " + eventSubject_(event) + " #" + order["Referencia Wompi"], body: text, htmlBody: "<pre style=\"font-family:Arial,sans-serif;white-space:pre-wrap\">" + escapeHtml_(text) + "</pre>" });
    return "ENVIADO " + isoNow_();
  } catch (error) {
    console.error("admin email failure");
    return "ERROR: correo de administración";
  }
}

function sendCustomerEmail_(config, order, event) {
  const email = String(order["Email cliente"] || "").trim();
  if (!looksLikeEmail_(email)) return "OMITIDO: email de cliente no disponible";
  if (MailApp.getRemainingDailyQuota() < 1) return "BLOQUEADO: cuota diaria de correo";
  const approved = event.type === "payment.updated" && (event.payment || {}).status === "APPROVED";
  const text = approved ? [
    "Hola " + value_(order["Cliente"] || "cliente") + ",", "",
    "Confirmamos la recepción de tu pago para los siguientes artículos:",
    orderItemsText_(order),
    "Referencia: " + value_(order["Referencia Wompi"]),
    order["Variante elegida"] ? "Variante: " + value_(order["Variante elegida"]) : "",
    "Productos: " + cop_(order["Subtotal productos COP"]),
    "Envío: " + cop_(order["Envío cobrado COP"]),
    order["Método envío CJ"] ? "Método de envío: " + value_(order["Método envío CJ"]) : "",
    order["Entrega estimada CJ"] ? "Tiempo estimado de entrega: " + value_(order["Entrega estimada CJ"]) : "",
    "Total: " + cop_(order["Total pagado COP"] || order["Total pedido COP"]), "",
    "Te avisaremos por este mismo correo cuando tu pedido avance al envío.",
    "Soporte Nexora: " + config.adminEmail,
  ].join("\n") : [
    "Hola " + value_(order["Cliente"] || "cliente") + ",", "",
    "Tu pedido " + value_(order["Referencia Wompi"]) + " ahora está: " + value_(order["Estado postventa"]) + ".",
    order["Guía"] ? "Guía: " + value_(order["Guía"]) : "",
    order["URL rastreo"] ? "Seguimiento: " + value_(order["URL rastreo"]) : "", "",
    "Soporte Nexora: " + config.adminEmail,
  ].filter(Boolean).join("\n");
  try {
    MailApp.sendEmail({ to: email, replyTo: config.adminEmail, name: "Nexora", subject: approved ? "Nexora — confirmación de tu pedido #" + order["Referencia Wompi"] : "Nexora — actualización de tu pedido #" + order["Referencia Wompi"], body: text, htmlBody: "<pre style=\"font-family:Arial,sans-serif;white-space:pre-wrap\">" + escapeHtml_(text) + "</pre>" });
    return "ENVIADO " + isoNow_();
  } catch (error) {
    console.error("customer email failure");
    return "ERROR: correo de cliente";
  }
}

function readAdminSnapshot_() {
  const config = getConfig_();
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  const sheet = ensureSheet_(spreadsheet, NEXORA.ORDERS_SHEET, ORDER_HEADERS);
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1).filter(function (row) { return row[0] !== ""; }).map(function (row) { return rowToObject_(row, ORDER_HEADERS); });
  // Un pago en revisión se conserva para auditoría, pero no entra a recaudo,
  // rentabilidad ni avisos hasta que se concilie manualmente.
  const approved = rows.filter(function (row) {
    return String(row["Estado pago"]).toUpperCase() === "APPROVED" && String(row["Revisar"] || "").toUpperCase() !== "SÍ";
  });
  const pending = rows.filter(function (row) { return String(row["Estado pago"]).toUpperCase() === "PENDING"; });
  const declined = rows.filter(function (row) { return ["DECLINED", "VOIDED", "ERROR"].indexOf(String(row["Estado pago"]).toUpperCase()) !== -1; });
  const total = function (items, field) { return items.reduce(function (sum, row) { const value = Number(row[field]); return sum + (Number.isFinite(value) ? value : 0); }, 0); };
  const grossRevenueCop = total(approved, "Total pagado COP");
  const shippingRevenueCop = total(approved, "Envío cobrado COP");
  const supplierShippingCostCop = total(approved, "Costo envío CJ COP");
  const paymentAttempts = approved.length + declined.length;
  const recentOrders = rows.sort(function (a, b) { return dateTime_(b["Actualizado (UTC)"]) - dateTime_(a["Actualizado (UTC)"]); }).slice(0, 100).map(function (row) {
    return {
      reference: string_(row["Referencia Wompi"]),
      createdAt: isoValue_(row["Creado (UTC)"]),
      updatedAt: isoValue_(row["Actualizado (UTC)"]),
      paymentStatus: string_(row["Estado pago"]),
      fulfillmentStatus: string_(row["Estado postventa"]),
      productName: string_(row["Producto"]),
      productSku: string_(row["SKU"]),
      variantSku: string_(row["SKU variante CJ"]),
      variantLabel: string_(row["Variante elegida"]) || null,
      customerEmail: string_(row["Email cliente"]) || null,
      shippingSummary: shippingText_(row) || null,
      grossAmountCop: numberOrNull_(row["Total pagado COP"]),
      wompiFeeCop: numberOrNull_(row["Comisión Wompi COP"]),
      estimatedContributionCop: numberOrNull_(row["Contribución COP"]),
      productSubtotalCop: numberOrNull_(row["Subtotal productos COP"]),
      shippingChargedCop: numberOrNull_(row["Envío cobrado COP"]),
      supplierShippingCostCop: numberOrNull_(row["Costo envío CJ COP"]),
      shippingMethod: string_(row["Método envío CJ"]) || null,
      shippingEstimatedDelivery: string_(row["Entrega estimada CJ"]) || null,
      shippingOriginCountryCode: string_(row["Origen envío CJ"]) || null,
      shippingQuotedAt: isoValue_(row["Cotizado envío (UTC)"]) || null,
      cjOrderId: string_(row["ID pedido CJ"]) || null,
      carrier: string_(row["Transportadora"]) || null,
      trackingNumber: string_(row["Guía"]) || null,
      trackingUrl: string_(row["URL rastreo"]) || null,
      fulfillmentNote: string_(row["Notas"]) || null,
      needsReview: String(row["Revisar"] || "").toUpperCase() === "SÍ",
    };
  });
  return {
    summary: {
      approvedOrders: approved.length,
      grossRevenueCop: grossRevenueCop,
      netPayoutCop: total(approved, "Neto estimado COP"),
      averageTicketCop: approved.length ? Math.round(grossRevenueCop / approved.length) : 0,
      approvalRatePercent: paymentAttempts ? (approved.length / paymentAttempts) * 100 : 0,
      pendingOrders: pending.length,
      declinedOrders: declined.length,
      fulfillmentPending: rows.filter(function (row) { return ["PAGO CONFIRMADO", "PEDIDO EN CJ", "EN PREPARACIÓN"].indexOf(String(row["Estado postventa"])) !== -1; }).length,
      fulfillmentInTransit: rows.filter(function (row) { return ["ENVIADO", "EN TRÁNSITO"].indexOf(String(row["Estado postventa"])) !== -1; }).length,
      shippingRevenueCop: shippingRevenueCop,
      supplierShippingCostCop: supplierShippingCostCop,
      shippingMarginCop: shippingRevenueCop - supplierShippingCostCop,
      contributionCop: total(approved, "Contribución COP"),
    },
    recentOrders: recentOrders,
    dailySales: dailySales_(approved),
  };
}

function dailySales_(approved) {
  const keys = [];
  const today = new Date();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    keys.push(Utilities.formatDate(day, NEXORA.TIME_ZONE, "yyyy-MM-dd"));
  }
  const totals = {};
  keys.forEach(function (key) { totals[key] = { date: key, approvedOrders: 0, grossRevenueCop: 0 }; });
  approved.forEach(function (row) {
    const rawDate = row["Pago actualizado (UTC)"] || row["Actualizado (UTC)"];
    const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (Number.isNaN(date.getTime())) return;
    const key = Utilities.formatDate(date, NEXORA.TIME_ZONE, "yyyy-MM-dd");
    if (!totals[key]) return;
    totals[key].approvedOrders += 1;
    totals[key].grossRevenueCop += Number(row["Total pagado COP"]) || 0;
  });
  return keys.map(function (key) { return totals[key]; });
}

function signedPayload_(rawEnvelope) {
  const envelope = JSON.parse(rawEnvelope);
  const timestamp = String(envelope && envelope.ts || "");
  const signature = String(envelope && envelope.sig || "").toLowerCase();
  const payload = envelope && typeof envelope.payload === "string" ? envelope.payload : "";
  if (!/^[a-f0-9]{64}$/.test(signature) || !payload || payload.length > 50000) throw new Error("invalid signed envelope");
  verifyTimestamp_(timestamp);
  if (!timingSafeEqual_(hmacHex_(timestamp + "." + payload, getWebhookSecret_()), signature)) throw new Error("invalid signature");
  return JSON.parse(payload);
}

function verifyTimestamp_(timestamp) {
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp) * 1000) > NEXORA.MAX_AGE_MS) throw new Error("expired request");
}

function normalizeEvent_(input) {
  if (!input || Number(input.schemaVersion) !== 1) throw new Error("unsupported schema");
  const type = requiredText_(input.type, 40);
  if (["checkout.created", "payment.updated", "fulfillment.updated"].indexOf(type) === -1) throw new Error("unsupported event type");
  const order = input.order || {};
  const customer = order.customer || {};
  const shipping = order.shipping || {};
  const finance = order.finance || {};
  const payment = input.payment || {};
  const fulfillment = input.fulfillment || {};
  return {
    eventId: requiredText_(input.eventId, 140), type: type, occurredAt: requiredDate_(input.occurredAt), source: cellText_(input.source || "nexora", 80), detail: cellText_(input.detail || "", 1000), needsReview: Boolean(input.needsReview),
    order: {
      variantSku: cellText_(order.variantSku, 180), variantLabel: cellText_(order.variantLabel, 300),
      id: cellText_(order.id || input.eventId, 140), reference: requiredText_(order.reference, 140), sku: cellText_(order.sku, 140), productName: cellText_(order.productName, 300), niche: cellText_(order.niche, 80), quantity: integerOrNull_(order.quantity), currency: cellText_(order.currency || "COP", 8), items: normalizeItems_(order.items),
      customer: { name: cellText_(customer.name, 180), email: cellText_(customer.email, 254), phone: cellText_(customer.phone, 60) },
      shipping: {
        recipient: cellText_(shipping.recipient, 180), address1: cellText_(shipping.address1, 300), address2: cellText_(shipping.address2, 300), houseNumber: cellText_(shipping.houseNumber, 80), city: cellText_(shipping.city, 120), region: cellText_(shipping.region, 120), country: cellText_(shipping.country, 80), postalCode: cellText_(shipping.postalCode, 40),
        method: cellText_(shipping.method, 160), carrier: cellText_(shipping.carrier, 160), estimatedDelivery: cellText_(shipping.estimatedDelivery, 180), originCountryCode: cellText_(shipping.originCountryCode, 12), optionId: cellText_(shipping.optionId, 180), quotedAt: dateOrNull_(shipping.quotedAt),
      },
      finance: {
        orderTotalCop: moneyOrNull_(finance.orderTotalCop), productSubtotalCop: moneyOrNull_(finance.productSubtotalCop), shippingChargedCop: moneyOrNull_(finance.shippingChargedCop), supplierShippingCostCop: moneyOrNull_(finance.supplierShippingCostCop), shippingQuoteUsd: decimalOrNull_(finance.shippingQuoteUsd), exchangeRateCopPerUsd: decimalOrNull_(finance.exchangeRateCopPerUsd), supplierCostCop: moneyOrNull_(finance.supplierCostCop), wompiFeeCop: moneyOrNull_(finance.wompiFeeCop), netPayoutCop: moneyOrNull_(finance.netPayoutCop), contributionCop: moneyOrNull_(finance.contributionCop), contributionMargin: ratioOrNull_(finance.contributionMargin),
      },
    },
    payment: { id: cellText_(payment.id, 140), status: payment.status ? String(payment.status).toUpperCase() : "", amountCop: moneyOrNull_(payment.amountCop), method: cellText_(payment.method, 120), updatedAt: dateOrNull_(payment.updatedAt) },
    fulfillment: { status: cellText_(fulfillment.status, 100), cjOrderId: cellText_(fulfillment.cjOrderId, 140), carrier: cellText_(fulfillment.carrier, 120), trackingNumber: cellText_(fulfillment.trackingNumber, 160), trackingUrl: cellText_(fulfillment.trackingUrl, 500), notes: cellText_(fulfillment.notes, 1000), updatedAt: dateOrNull_(fulfillment.updatedAt) },
  };
}

function getConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty("NEXORA_SHEETS_SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("NEXORA_SHEETS_SPREADSHEET_ID missing");
  return { spreadsheetId: spreadsheetId, adminEmail: properties.getProperty("NEXORA_ADMIN_EMAIL") || NEXORA.ADMIN_EMAIL, timeZone: properties.getProperty("NEXORA_TIME_ZONE") || NEXORA.TIME_ZONE };
}

function getWebhookSecret_() {
  const secret = PropertiesService.getScriptProperties().getProperty("NEXORA_SALES_WEBHOOK_SECRET");
  if (!secret || secret.length < 32) throw new Error("webhook secret missing");
  return secret;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    // Migración segura para libros que ya estaban operando: sólo completa
    // cabeceras nuevas/vacías al final y conserva valores, filtros y datos
    // históricos. Las posiciones anteriores se siguen interpretando con el
    // contrato de ORDER_HEADERS, incluso si el administrador renombró la
    // etiqueta visual de una columna.
    const actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    const missing = [];
    headers.forEach(function (header, index) { if (!actual[index]) missing.push({ column: index + 1, value: header }); });
    missing.forEach(function (entry) { sheet.getRange(1, entry.column).setValue(entry.value); });
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#0F0F0F").setFontColor("#FFFFFF").setFontWeight("bold");
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).createFilter();
  return sheet;
}

function setupDashboard_(spreadsheet) {
  let dashboard = spreadsheet.getSheetByName(NEXORA.DASHBOARD_SHEET);
  if (!dashboard) dashboard = spreadsheet.insertSheet(NEXORA.DASHBOARD_SHEET);
  dashboard.getRange("A1:F1").breakApart();
  dashboard.getRange("A1:F28").clearContent().setBackground("#FFFFFF");
  dashboard.getRange("A1:F1").merge().setValue("Nexora — ventas y postventa").setBackground("#0F0F0F").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(16);
  dashboard.getRange("A3:B18").setValues([["Indicador", "Valor"], ["Pedidos registrados", ""], ["Pagos aprobados", ""], ["Pendientes de pago", ""], ["Pagos no completados", ""], ["Tasa de aprobación", ""], ["GMV cobrado COP", ""], ["Envío cobrado al cliente", ""], ["Costo de envío CJ", ""], ["Margen de envío", ""], ["Comisión Wompi estimada", ""], ["Neto estimado", ""], ["Contribución", ""], ["Margen contribución", ""], ["Ticket promedio", ""], ["Avisos por reintentar", ""]]);
  const statusColumn = orderColumnLetter_("Estado pago");
  const reviewColumn = orderColumnLetter_("Revisar");
  const paidColumn = orderColumnLetter_("Total pagado COP");
  const shippingChargedColumn = orderColumnLetter_("Envío cobrado COP");
  const supplierShippingColumn = orderColumnLetter_("Costo envío CJ COP");
  const feeColumn = orderColumnLetter_("Comisión Wompi COP");
  const netColumn = orderColumnLetter_("Neto estimado COP");
  const contributionColumn = orderColumnLetter_("Contribución COP");
  const approved = "'Pedidos'!" + statusColumn + "2:" + statusColumn + ",\"APPROVED\",'Pedidos'!" + reviewColumn + "2:" + reviewColumn + ",\"<>SÍ\"";
  [["B4", "=COUNTA('Pedidos'!A2:A)"], ["B5", "=COUNTIFS(" + approved + ")"], ["B6", "=COUNTIF('Pedidos'!" + statusColumn + "2:" + statusColumn + ",\"PENDING\")"], ["B7", "=COUNTIF('Pedidos'!" + statusColumn + "2:" + statusColumn + ",\"DECLINED\")+COUNTIF('Pedidos'!" + statusColumn + "2:" + statusColumn + ",\"VOIDED\")+COUNTIF('Pedidos'!" + statusColumn + "2:" + statusColumn + ",\"ERROR\")"], ["B8", "=IFERROR(B5/(B5+B7),0)"], ["B9", "=SUMIFS('Pedidos'!" + paidColumn + "2:" + paidColumn + "," + approved + ")"], ["B10", "=SUMIFS('Pedidos'!" + shippingChargedColumn + "2:" + shippingChargedColumn + "," + approved + ")"], ["B11", "=SUMIFS('Pedidos'!" + supplierShippingColumn + "2:" + supplierShippingColumn + "," + approved + ")"], ["B12", "=B10-B11"], ["B13", "=SUMIFS('Pedidos'!" + feeColumn + "2:" + feeColumn + "," + approved + ")"], ["B14", "=SUMIFS('Pedidos'!" + netColumn + "2:" + netColumn + "," + approved + ")"], ["B15", "=SUMIFS('Pedidos'!" + contributionColumn + "2:" + contributionColumn + "," + approved + ")"], ["B16", "=IFERROR(B15/B9,0)"], ["B17", "=IFERROR(B9/B5,0)"], ["B18", "=COUNTIF('Eventos'!L2:L,\"ERROR*\")+COUNTIF('Eventos'!L2:L,\"BLOQUEADO*\")+COUNTIF('Eventos'!M2:M,\"ERROR*\")+COUNTIF('Eventos'!M2:M,\"BLOQUEADO*\")"]].forEach(function (formula) { dashboard.getRange(formula[0]).setFormula(formula[1]); });
  dashboard.getRange("A3:B3").setFontWeight("bold").setBackground("#C0C0C0");
  dashboard.getRange("B8").setNumberFormat("0.0%"); dashboard.getRange("B16").setNumberFormat("0.0%"); dashboard.getRange("B9:B15").setNumberFormat("#,##0"); dashboard.getRange("B17").setNumberFormat("#,##0");
  dashboard.autoResizeColumns(1, 5);
}

function formatOrderColumns_(sheet) {
  const rows = Math.max(1, sheet.getMaxRows() - 1);
  ["Creado (UTC)", "Actualizado (UTC)", "Pago actualizado (UTC)", "Actualizado postventa (UTC)", "Cotizado envío (UTC)"].forEach(function (header) {
    sheet.getRange(2, headerIndex_(header, ORDER_HEADERS) + 1, rows, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  });
  ["Total pedido COP", "Total pagado COP", "Costo proveedor COP", "Comisión Wompi COP", "Neto estimado COP", "Contribución COP", "Subtotal productos COP", "Envío cobrado COP", "Costo envío CJ COP"].forEach(function (header) {
    sheet.getRange(2, headerIndex_(header, ORDER_HEADERS) + 1, rows, 1).setNumberFormat("#,##0");
  });
  sheet.getRange(2, headerIndex_("Margen contribución", ORDER_HEADERS) + 1, rows, 1).setNumberFormat("0.0%");
  sheet.getRange(2, headerIndex_("Cotización envío CJ USD", ORDER_HEADERS) + 1, rows, 1).setNumberFormat("0.00");
  sheet.getRange(2, headerIndex_("Tasa USD/COP", ORDER_HEADERS) + 1, rows, 1).setNumberFormat("#,##0.00");
}
function formatEventColumns_(sheet) { const rows = Math.max(1, sheet.getMaxRows() - 1); sheet.getRange(2, 3, rows, 2).setNumberFormat("yyyy-mm-dd hh:mm:ss"); sheet.getRange(2, 9, rows, 1).setNumberFormat("#,##0"); }

function findRowByValue_(sheet, headers, header, value) { if (!value || sheet.getLastRow() < 2) return 0; const column = headerIndex_(header, headers) + 1; const match = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findNext(); return match ? match.getRow() : 0; }
function readRow_(sheet, row, headers) { return rowToObject_(sheet.getRange(row, 1, 1, headers.length).getValues()[0], headers); }
function rowToObject_(values, headers) { const out = {}; headers.forEach(function (header, index) { out[header] = values[index]; }); return out; }
function setCellByHeader_(sheet, row, headers, header, value) { sheet.getRange(row, headerIndex_(header, headers) + 1).setValue(value); }
function headerIndex_(header, headers) { const index = headers.indexOf(header); if (index < 0) throw new Error("header missing"); return index; }
function orderColumnLetter_(header) { return columnLetter_(headerIndex_(header, ORDER_HEADERS) + 1); }
function columnLetter_(column) { let value = ""; let current = column; while (current > 0) { const remainder = (current - 1) % 26; value = String.fromCharCode(65 + remainder) + value; current = Math.floor((current - 1) / 26); } return value; }
function setIfBlank_(object, key, value) { if ((object[key] === "" || object[key] === null || object[key] === undefined) && value !== "" && value !== null && value !== undefined) object[key] = value; }
function setIfPresent_(object, key, value) { if (value !== "" && value !== null && value !== undefined) object[key] = value; }
function sameMoney_(left, right) { return Math.round(Number(left)) === Math.round(Number(right)); }
function appendNote_(object, note) { const existing = String(object["Notas"] || ""); if (existing.indexOf(note) === -1) object["Notas"] = [existing, note].filter(Boolean).join(" | ").slice(0, 1000); }
function isNewer_(candidate, stored) { const left = dateOrNull_(candidate); const right = dateOrNull_(stored); return !right || !left || left.getTime() >= right.getTime(); }
function hmacHex_(value, secret) { return bytesToHex_(Utilities.computeHmacSha256Signature(value, secret)); }
function sha256Hex_(value) { return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)); }
function bytesToHex_(bytes) { let output = ""; for (let index = 0; index < bytes.length; index += 1) output += ("0" + (bytes[index] & 0xff).toString(16)).slice(-2); return output; }
function timingSafeEqual_(left, right) { if (!left || !right || left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }
function requiredText_(value, maximum) { const result = rawText_(value, maximum); if (!result) throw new Error("required value missing"); return result; }
function cellText_(value, maximum) { const result = rawText_(value, maximum); return /^[=+\-@]/.test(result) ? "'" + result : result; }
function rawText_(value, maximum) { return String(value === undefined || value === null ? "" : value).replace(/\u0000/g, "").trim().slice(0, maximum || 1000); }
function requiredDate_(value) { const date = dateOrNull_(value); if (!date) throw new Error("invalid date"); return date; }
function dateOrNull_(value) { if (!value) return null; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function integerOrNull_(value) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); if (!Number.isInteger(number) || number < 1) throw new Error("invalid quantity"); return number; }
function normalizeItems_(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) throw new Error("invalid items");
  return value.map(function (item) {
    if (!item || typeof item !== "object") throw new Error("invalid item");
    return {
      sku: cellText_(item.sku, 140), variantSku: cellText_(item.variantSku, 180), variantLabel: cellText_(item.variantLabel, 300),
      productName: requiredText_(item.productName, 300), niche: cellText_(item.niche, 80), quantity: integerOrNull_(item.quantity),
      unitPriceCop: moneyOrNull_(item.unitPriceCop), subtotalCop: moneyOrNull_(item.subtotalCop), supplierCostUsd: decimalOrNull_(item.supplierCostUsd),
      shippingMethod: cellText_(item.shippingMethod, 160), shippingCarrier: cellText_(item.shippingCarrier, 160), shippingEstimatedDelivery: cellText_(item.shippingEstimatedDelivery, 180),
      shippingOriginCountryCode: cellText_(item.shippingOriginCountryCode, 12), shippingOptionId: cellText_(item.shippingOptionId, 180), shippingCostCop: moneyOrNull_(item.shippingCostCop),
    };
  });
}
function moneyOrNull_(value) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); if (!Number.isFinite(number)) throw new Error("invalid amount"); return Math.round(number); }
function decimalOrNull_(value) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); if (!Number.isFinite(number)) throw new Error("invalid decimal"); return Math.round(number * 1000000) / 1000000; }
function ratioOrNull_(value) { if (value === "" || value === null || value === undefined) return null; let number = Number(value); if (!Number.isFinite(number)) throw new Error("invalid ratio"); if (Math.abs(number) > 1) number = number / 100; return number; }
function looksLikeEmail_(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function eventSubject_(event) { if (event.type === "fulfillment.updated") return "actualización de postventa"; return (event.payment || {}).status === "APPROVED" ? "pago aprobado" : "actualización de pago"; }
function shippingText_(order) { return [value_(order["Destinatario envío"]), [value_(order["Dirección envío 1"]), value_(order["Número de casa envío"])].filter(Boolean).join(" #"), value_(order["Dirección envío 2"]), value_(order["Ciudad envío"]), value_(order["Departamento/estado"]), value_(order["País envío"]), value_(order["Código postal"])].filter(Boolean).join(", "); }
function orderItemsText_(order) {
  try {
    const items = JSON.parse(String(order["Artículos JSON"] || "[]"));
    if (Array.isArray(items) && items.length) return items.map(function (item) {
      return "- " + value_(item.quantity) + " x " + value_(item.productName) + " | variante " + value_(item.variantLabel || item.variantSku) + " | " + cop_(item.subtotalCop) + " | envío " + value_(item.shippingMethod) + " " + cop_(item.shippingCostCop);
    }).join("\n");
  } catch (error) {
    console.error("items text failure");
  }
  return "- " + value_(order["Cantidad"] || 1) + " x " + value_(order["Producto"]);
}
function value_(value) { return value === null || value === undefined ? "" : String(value); }
function string_(value) { return value_(value).trim(); }
function numberOrNull_(value) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function dateTime_(value) { const date = dateOrNull_(value); return date ? date.getTime() : 0; }
function isoValue_(value) { const date = dateOrNull_(value); return date ? date.toISOString() : ""; }
function cop_(value) { const number = Number(value); return Number.isFinite(number) ? "COP $" + Math.round(number).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "No disponible"; }
function usd_(value) { const number = Number(value); return Number.isFinite(number) ? "USD $" + number.toFixed(2) : "No disponible"; }
function escapeHtml_(value) { return String(value).replace(/[&<>"']/g, function (character) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character]; }); }
function isoNow_() { return Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'"); }
function json_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
