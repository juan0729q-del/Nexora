"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useNexy } from "./nexy-context";

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
  const { announcement } = useNexy();
  const [genericMessage, setGenericMessage] = useState(nexyMessages[0]);
  const shouldHide = pathname.startsWith("/admin") || pathname.startsWith("/checkout");
  const message = announcement?.message || genericMessage;
  const messageKey = announcement ? `product-${announcement.id}` : `generic-${genericMessage}`;

  useEffect(() => {
    if (shouldHide) return;

    const refreshMessage = () => setGenericMessage(getRandomMessage());
    refreshMessage();
    window.addEventListener("hashchange", refreshMessage);

    return () => window.removeEventListener("hashchange", refreshMessage);
  }, [pathname, shouldHide]);

  if (shouldHide) return null;

  return (
    <aside aria-label="Nexy, guía de compras de Nexora" className="pointer-events-none fixed right-3 bottom-3 z-40 sm:right-5 sm:bottom-5">
      <div className="flex max-w-[calc(100vw-1.5rem)] items-end gap-1.5 sm:gap-2">
        <p key={messageKey} aria-live="polite" className="nexy-message max-w-[11rem] rounded-2xl rounded-br-md border border-silver/20 bg-onyx/95 px-2.5 py-2 text-[11px] leading-4 text-white shadow-xl shadow-black/35 backdrop-blur-md sm:max-w-[13rem] sm:px-3 sm:text-xs sm:leading-5">
          {message}
        </p>
        <div className="nexy-mascot w-[4.5rem] shrink-0 sm:w-[5.25rem]">
          <Image src="/brand/nexy-mascot-vest.png" alt="Nexy, el zorro de Nexora con chaleco elegante y emblema Nexora" width={192} height={192} sizes="(min-width: 640px) 84px, 72px" className="h-auto w-full" />
        </div>
      </div>
    </aside>
  );
}
