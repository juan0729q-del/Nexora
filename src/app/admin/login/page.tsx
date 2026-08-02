import Link from "next/link";
import { login } from "./actions";

export const metadata = { title: "Acceso de administración", robots: { index: false, follow: false } };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const showError = (await searchParams).error === "1";
  return <main id="page-content" tabIndex={-1} className="grid min-h-screen place-items-center px-5 outline-none">
    <section className="w-full max-w-md rounded-2xl border border-silver/20 bg-white/[.025] p-7 shadow-2xl">
      <Link href="/" className="text-sm font-bold tracking-[.18em] text-white">NEXORA</Link>
      <p className="mt-8 text-xs font-bold tracking-[.16em] text-emerald uppercase">Área privada</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Panel de control</h1>
      <p className="mt-3 text-sm leading-6 text-silver/70">Accede con la contraseña definida en las variables de entorno. Nunca la incluyas en el repositorio.</p>
      {showError && <p role="alert" className="mt-4 rounded-xl border border-red-300/30 bg-red-300/[.08] px-4 py-3 text-sm text-red-100">No fue posible iniciar sesión. Verifica la contraseña o espera unos minutos antes de intentarlo otra vez.</p>}
      <form action={login} className="mt-7 space-y-4">
        <label className="block text-sm text-silver/80" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="w-full rounded-xl border border-silver/25 bg-onyx px-4 py-3 text-white outline-none focus:border-emerald" />
        <button className="w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-onyx hover:bg-emerald/85">Entrar de forma segura</button>
      </form>
    </section>
  </main>;
}
