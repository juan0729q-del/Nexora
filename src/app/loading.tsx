export default function Loading() {
  return <main id="page-content" tabIndex={-1} className="grid min-h-[70vh] place-items-center px-5 outline-none" aria-busy="true" aria-live="polite">
    <div className="text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-silver/20 border-t-emerald motion-reduce:animate-none" />
      <p className="mt-4 text-sm font-semibold text-silver/75">Preparando Nexora…</p>
    </div>
  </main>;
}
