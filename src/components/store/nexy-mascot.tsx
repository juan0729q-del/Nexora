"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nexyMessages = [
  "¡Este collar sería un regalo hermoso para alguien especial! 💖",
  "¡Te verías increíble con esto puesto! ¿Te lo pruebas? ✨",
  "Un toque de magia para tu estilo diario. ¡No te lo pierdas! 🌿",
  "¡Regálate un momento de bienestar, te lo mereces! 💎",
  "La pieza perfecta para complementar tu look hoy. 🎁",
];

function getRandomMessage() {
  return nexyMessages[Math.floor(Math.random() * nexyMessages.length)];
}

export function NexyMascot() {
  const pathname = usePathname();
  const [message, setMessage] = useState(nexyMessages[0]);
  const shouldHide = pathname.startsWith("/admin") || pathname.startsWith("/checkout");

  useEffect(() => {
    if (shouldHide) return;

    const refreshMessage = () => setMessage(getRandomMessage());
    refreshMessage();
    window.addEventListener("hashchange", refreshMessage);

    return () => window.removeEventListener("hashchange", refreshMessage);
  }, [pathname, shouldHide]);

  if (shouldHide) return null;

  return (
    <aside aria-label="Nexy, guía de compras de Nexora" className="pointer-events-none fixed right-3 bottom-3 z-40 sm:right-5 sm:bottom-5">
      <div className="flex max-w-[calc(100vw-1.5rem)] items-end gap-1.5 sm:gap-2.5">
        <p aria-live="polite" className="nexy-message max-w-48 rounded-2xl rounded-br-md border border-silver/20 bg-onyx/95 px-3 py-2.5 text-xs leading-5 text-white shadow-xl shadow-black/35 backdrop-blur-md sm:max-w-60 sm:text-sm">
          {message}
        </p>
        <div className="nexy-mascot w-20 shrink-0 sm:w-24">
          <Image src="/brand/nexy-mascot.png" alt="Nexy, el zorro de Nexora" width={192} height={192} sizes="(min-width: 640px) 96px, 80px" className="h-auto w-full" />
        </div>
      </div>
    </aside>
  );
}
