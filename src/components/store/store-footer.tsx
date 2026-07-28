import Link from "next/link";

const socialLinks = [
  { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61592349341501" },
  { label: "Instagram", href: "https://www.instagram.com/nexoraventas1/" },
  { label: "TikTok", href: "https://tiktok.com/@nexora.diseo.con" },
];

export function StoreFooter() {
  return (
    <footer className="px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 border-t border-silver/15 pt-6 text-sm text-silver/60 sm:flex-row sm:items-center">
        <p>© {new Date().getFullYear()} Nexora. Diseño que eleva tu rutina.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/#joyeria" className="transition hover:text-white">Productos</Link>
          <Link href="/admin/login" className="transition hover:text-white">Administración</Link>
          <span aria-hidden="true" className="hidden h-4 w-px bg-silver/25 sm:block" />
          <span className="text-silver/45">Síguenos</span>
          {socialLinks.map((social) => (
            <a key={social.label} href={social.href} target="_blank" rel="noreferrer" className="font-medium text-silver/80 transition hover:text-emerald">
              {social.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
