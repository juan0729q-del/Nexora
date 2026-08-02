"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="es">
    <body style={{ margin: 0, background: "#0F0F0F", color: "#FFFFFF", fontFamily: "system-ui, sans-serif" }}>
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <section style={{ maxWidth: 520, textAlign: "center" }}>
          <p style={{ color: "#009473", fontWeight: 700 }}>NEXORA</p>
          <h1>No pudimos mostrar la tienda</h1>
          <p>La operación se detuvo de forma segura. Intenta cargar Nexora nuevamente.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, border: 0, borderRadius: 999, background: "#009473", padding: "12px 20px", fontWeight: 700 }}>Reintentar</button>
        </section>
      </main>
    </body>
  </html>;
}
