import Link from "next/link";

export function StoreFooter() { return <footer className="px-5 py-10 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 border-t border-silver/15 pt-6 text-sm text-silver/60 sm:flex-row"><p>© {new Date().getFullYear()} Nexora. Diseño que eleva tu rutina.</p><div className="flex gap-4"><Link href="/#joyeria">Productos</Link><Link href="/admin/login">Administración</Link></div></div></footer>; }
