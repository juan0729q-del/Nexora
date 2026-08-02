"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "./cart-context";

type VerifiedStatus = "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "REVIEW";
const maximumVerificationAttempts = 60;
const transientStatusCodes = new Set([404, 429, 502, 503, 504]);

function retryDelay(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) return 5000;
  const seconds = Number(header);
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - Date.now();
  return Math.min(60_000, Math.max(1000, Number.isFinite(milliseconds) ? milliseconds : 5000));
}

function copyFor(status: VerifiedStatus | "CHECKING" | "UNAVAILABLE") {
  if (status === "APPROVED") return { title: "Pago aprobado", detail: "Wompi confirmó el pago. Tu pedido seguirá el proceso de preparación y recibirás las novedades en el correo registrado.", tone: "text-emerald" };
  if (status === "DECLINED") return { title: "Pago rechazado", detail: "Wompi no aprobó la transacción. Tu carrito se conserva para que revises el medio de pago e intentes de nuevo.", tone: "text-red-200" };
  if (status === "VOIDED") return { title: "Pago anulado", detail: "Wompi confirmó que la transacción fue anulada. No procesaremos el pedido como pagado.", tone: "text-amber-100" };
  if (status === "ERROR") return { title: "Pago no completado", detail: "Wompi reportó un error en la transacción. Tu carrito permanece disponible para un nuevo intento.", tone: "text-red-200" };
  if (status === "REVIEW") return { title: "Pago recibido, en conciliación", detail: "Wompi reportó el pago, pero Nexora debe terminar de conciliar el monto con tu pedido. No vuelvas a pagar; recibirás la confirmación en el correo registrado.", tone: "text-amber-100" };
  if (status === "PENDING") return { title: "Pago en proceso", detail: "Wompi aún está procesando la transacción. No repitas el pago; te avisaremos al correo cuando exista un resultado final.", tone: "text-amber-100" };
  if (status === "UNAVAILABLE") return { title: "Confirmación pendiente", detail: "No pudimos consultar el resultado oficial ahora. Conserva el comprobante y revisa el correo antes de intentar pagar otra vez.", tone: "text-amber-100" };
  return { title: "Verificando tu pago", detail: "Consultamos directamente a Wompi; esta página no confía en estados recibidos sólo desde la URL.", tone: "text-white" };
}

export function CheckoutResultStatus({ provider, transactionId, reference }: { provider?: string; transactionId?: string; reference?: string }) {
  const { clearCart } = useCart();
  const canVerify = provider === "wompi" && Boolean(transactionId && reference);
  const [status, setStatus] = useState<VerifiedStatus | "CHECKING" | "UNAVAILABLE">(canVerify ? "CHECKING" : "UNAVAILABLE");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canVerify || !transactionId || !reference) return;
    const verifiedTransactionId = transactionId;
    const verifiedReference = reference;
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const scheduleRetry = (delay: number, nextMessage?: string) => {
      if (cancelled) return;
      if (attempts >= maximumVerificationAttempts) {
        setStatus("UNAVAILABLE");
        setMessage(nextMessage || "Wompi aún no entregó un resultado verificable. Revisa tu correo antes de volver a pagar.");
        return;
      }
      setStatus("PENDING");
      setMessage(nextMessage || null);
      timer = window.setTimeout(verify, delay);
    };

    async function verify() {
      attempts += 1;
      try {
        const params = new URLSearchParams({ id: verifiedTransactionId, reference: verifiedReference });
        const response = await fetch(`/api/payments/wompi/status?${params}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null) as { status?: VerifiedStatus; message?: string } | null;
        if (!response.ok) {
          if (transientStatusCodes.has(response.status)) {
            scheduleRetry(retryDelay(response), payload?.message || "Wompi aún está preparando la confirmación oficial.");
            return;
          }
          setStatus("UNAVAILABLE");
          setMessage(payload?.message || "La respuesta de Wompi no coincide con este pedido.");
          return;
        }
        if (!payload?.status) {
          scheduleRetry(5000, "Wompi aún no devolvió un estado verificable.");
          return;
        }
        if (cancelled) return;
        setStatus(payload.status);
        setMessage(null);
        if (payload.status === "APPROVED") clearCart();
        if (payload.status === "PENDING") scheduleRetry(5000);
      } catch (error) {
        if (cancelled) return;
        const nextMessage = error instanceof Error ? error.message : "No fue posible consultar el pago.";
        scheduleRetry(5000, nextMessage);
      }
    }

    void verify();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [canVerify, clearCart, reference, transactionId]);

  const content = copyFor(status);
  return <section className="w-full max-w-md rounded-2xl border border-silver/20 bg-white/[.025] p-7 text-center" aria-live="polite">
    <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">Nexora</p>
    <h1 className={`mt-3 text-3xl font-semibold ${content.tone}`}>{content.title}</h1>
    <p className="mt-4 text-sm leading-6 text-silver/75">{content.detail}</p>
    {message && <p className="mt-3 text-xs leading-5 text-amber-100">{message}</p>}
    {(reference || transactionId) && <p className="mt-4 break-all rounded-xl border border-silver/15 bg-black/20 px-3 py-2 font-mono text-xs text-silver/70">Referencia: {reference || transactionId}</p>}
    <p className="mt-4 text-xs leading-5 text-silver/60">El pedido sólo avanza cuando Wompi confirma el pago y el evento seguro queda conciliado con el total registrado.</p>
    <Link href="/" className="mt-7 inline-flex rounded-full bg-emerald px-5 py-3 text-sm font-bold text-onyx">Volver a la tienda</Link>
  </section>;
}
