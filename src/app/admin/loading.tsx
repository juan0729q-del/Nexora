export default function AdminLoading() {
  return <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12" role="status" aria-label="Abriendo administración">
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="h-24 animate-pulse rounded-2xl border border-silver/15 bg-white/[.025]" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-silver/15 bg-white/[.025]" />)}</div>
      <p className="text-sm text-silver/65">Abriendo el panel de Nexora…</p>
    </div>
  </main>;
}
