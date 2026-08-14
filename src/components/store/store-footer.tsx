import Link from "next/link";
import { PrivacySettingsButton } from "@/components/analytics/analytics-consent";
import { getDictionary, markets, type Market } from "@/lib/i18n/config";
import { getPublicContact } from "@/lib/public-contact";

type SocialIconName = "facebook" | "instagram" | "tiktok" | "whatsapp";

function SocialIcon({ name }: { name: SocialIconName }) {
  if (name === "facebook") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current"><path d="M13.7 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V4a23 23 0 0 0-2.4-.1c-2.4 0-4.1 1.5-4.1 4.2V10H8v3h2.5v8h3.2Z" /></svg>;
  }
  if (name === "instagram") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.7" r="1" className="fill-current stroke-none" /></svg>;
  }
  if (name === "tiktok") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current"><path d="M14.2 3h3.1c.2 1.5 1.1 2.8 2.7 3.5v3.1a8 8 0 0 1-2.9-.9v6.2a6.1 6.1 0 1 1-5.3-6V12a3 3 0 1 0 2.4 2.9V3Z" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current"><path fillRule="evenodd" d="M12 2a9.7 9.7 0 0 0-8.3 14.7L2.4 21.6l5-1.3A9.8 9.8 0 1 0 12 2Zm0 2a7.8 7.8 0 0 1 0 15.6 7.7 7.7 0 0 1-4-1.1l-.4-.2-2.3.6.6-2.2-.2-.4A7.8 7.8 0 0 1 12 4Zm-3.4 3.8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.2.2 2 3.2 5 4.3 2.5.9 3 .7 3.6.7.5-.1 1.8-.8 2-1.5.3-.7.3-1.3.2-1.5-.1-.2-.3-.3-.7-.5l-2-1c-.3-.1-.5-.2-.7.2l-1 1.2c-.2.3-.4.3-.7.1a8 8 0 0 1-2.4-1.5A9 9 0 0 1 9.8 12c-.2-.3 0-.5.1-.7l.5-.6.2-.6c.1-.2 0-.5 0-.6l-.9-2.1c-.2-.6-.5-.5-1.1-.5Z" clipRule="evenodd" /></svg>;
}

export function StoreFooter({ market = "co" }: { market?: Market }) {
  const dictionary = getDictionary(market);
  const contact = getPublicContact();
  const socialLinks: Array<{ label: string; href: string; icon: SocialIconName }> = [
    { label: "Facebook", href: contact.facebookUrl, icon: "facebook" },
    { label: "Instagram", href: contact.instagramUrl, icon: "instagram" },
    { label: "TikTok", href: contact.tiktokUrl, icon: "tiktok" },
    { label: "WhatsApp", href: contact.whatsappUrl, icon: "whatsapp" },
  ];
  const policyLinks = market === "co"
    ? [["contacto", dictionary.contact], ["envios", dictionary.shipping], ["devoluciones", dictionary.returns], ["privacidad", dictionary.privacy], ["terminos", dictionary.terms], ["pagos", dictionary.payments], ["preguntas-frecuentes", dictionary.faq]]
    : [["contact", dictionary.contact], ["shipping", dictionary.shipping], ["returns", dictionary.returns], ["privacy", dictionary.privacy], ["terms", dictionary.terms], ["payments", dictionary.payments], ["faq", dictionary.faq]];
  return (
    <footer className="px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 border-t border-silver/15 pt-6 text-sm text-silver/60 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <p>© {new Date().getFullYear()} Nexora. {dictionary.footerTagline}</p>
          <nav aria-label={market === "co" ? "Redes sociales de Nexora" : "Nexora social media"} className="flex items-center gap-2">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={market === "co" ? `Abrir ${social.label} de Nexora` : `Open Nexora on ${social.label}`}
                title={social.label}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-silver/20 text-silver/80 transition hover:border-emerald hover:bg-emerald/10 hover:text-emerald focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald"
              >
                <SocialIcon name={social.icon} />
              </a>
            ))}
          </nav>
        </div>
        <nav aria-label={market === "co" ? "Información comercial" : "Store information"} className="flex max-w-2xl flex-wrap justify-end gap-x-4 gap-y-2">
          <Link href={markets[market].homePath} className="font-medium text-silver/80 transition hover:text-white">{dictionary.products}</Link>
          {policyLinks.map(([slug, label]) => <Link key={slug} href={`${markets[market].homePath}/${slug}`} className="font-medium text-silver/80 transition hover:text-white">{label}</Link>)}
          <PrivacySettingsButton label={market === "co" ? "Preferencias de privacidad" : "Privacy choices"} />
        </nav>
      </div>
    </footer>
  );
}
