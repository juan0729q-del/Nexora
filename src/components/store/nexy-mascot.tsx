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

const nexyMessagesEnglish = [
  "This necklace could be a thoughtful gift for someone special. 💖",
  "This style might look wonderful on you. Want to explore it? ✨",
  "A touch of character for your everyday style. 🌿",
  "A practical detail for a more intentional routine. 💎",
  "A thoughtful finishing touch for today's look. 🎁",
];

function getRandomMessage(messages: string[]) {
  return messages[Math.floor(Math.random() * messages.length)];
}

export function NexyMascot() {
  const pathname = usePathname();
  const { announcement } = useNexy();
  const [genericMessage, setGenericMessage] = useState(nexyMessages[0]);
  const english = pathname === "/us" || pathname.startsWith("/us/");
  const messages = english ? nexyMessagesEnglish : nexyMessages;
  const shouldHide = pathname.startsWith("/admin") || pathname.startsWith("/checkout") || pathname.includes("/checkout/");
  const message = announcement?.message || genericMessage;
  const messageKey = announcement ? `product-${announcement.id}` : `generic-${genericMessage}`;

  useEffect(() => {
    if (shouldHide) return;

    const refreshMessage = () => setGenericMessage(getRandomMessage(messages));
    refreshMessage();
    window.addEventListener("hashchange", refreshMessage);

    return () => window.removeEventListener("hashchange", refreshMessage);
  }, [messages, pathname, shouldHide]);

  if (shouldHide) return null;

  return (
    <aside aria-label={english ? "Nexy, Nexora shopping guide" : "Nexy, guía de compras de Nexora"} className="pointer-events-none fixed right-3 bottom-3 z-40 sm:right-5 sm:bottom-5">
      <div className="flex max-w-[calc(100vw-1.5rem)] items-end gap-1.5 sm:gap-2">
        <p key={messageKey} aria-live="polite" className="nexy-message max-w-[11rem] rounded-2xl rounded-br-md border border-silver/20 bg-onyx/95 px-2.5 py-2 text-[11px] leading-4 text-white shadow-xl shadow-black/35 backdrop-blur-md sm:max-w-[13rem] sm:px-3 sm:text-xs sm:leading-5">
          {message}
        </p>
        <div className="nexy-mascot w-[4.5rem] shrink-0 sm:w-[5.25rem]">
          <Image src="/brand/nexy-mascot-vest.png" alt={english ? "Nexy, Nexora's fox mascot wearing a branded vest" : "Nexy, el zorro de Nexora con chaleco elegante y emblema Nexora"} width={192} height={192} sizes="(min-width: 640px) 84px, 72px" className="h-auto w-full" />
        </div>
      </div>
    </aside>
  );
}
