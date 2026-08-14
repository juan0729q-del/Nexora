"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type NexyProductInterest = {
  category: string;
  market: "co" | "us";
};

type NexyIntent = "view" | "buy";
type NexyAnnouncement = { id: number; message: string };
type StoredNexyAnnouncement = NexyAnnouncement & { expiresAt: number };
type NexyContextValue = {
  announcement: NexyAnnouncement | null;
  announceProduct: (product: NexyProductInterest, intent?: NexyIntent) => void;
};

const ANNOUNCEMENT_DURATION_MS = 6800;
const ANNOUNCEMENT_STORAGE_KEY = "nexora:nexy-announcement";
let inMemoryAnnouncement: StoredNexyAnnouncement | null = null;

const giftMessages = {
  jewelry: [
    "Esto te quedaría genial, o sería un detalle precioso para quien quieras sorprender. 🎁",
    "Una pieza así dice mucho sin necesidad de palabras. ¿Para ti o para alguien especial? ✨",
    "Un toque de brillo puede convertir un momento normal en algo memorable. 💎",
  ],
  technologyHome: [
    "Una idea útil para regalar y acertar con estilo. 🎁",
    "Para esa persona que disfruta hacer su espacio un poco mejor.",
    "Un detalle práctico también puede sentirse muy personal. ✨",
  ],
  wellbeing: [
    "Regalar un momento para sí también es una gran idea. 🌿",
    "Una elección pensada para acompañar una pausa con intención.",
    "Un gesto sencillo para decir: hoy también te mereces cuidarte. 💎",
  ],
  general: [
    "Esto te quedaría genial, o sería un detalle precioso para quien quieras sorprender. 🎁",
    "¿Te imaginas la sonrisa de quien reciba este detalle? ✨",
    "Una buena elección empieza por algo que se siente personal.",
  ],
};

const giftMessagesEnglish = {
  jewelry: [
    "This could look wonderful on you—or become a thoughtful gift for someone special. 🎁",
    "A small piece can say a great deal. Is it for you or someone you care about? ✨",
    "A touch of character can turn an ordinary moment into a memorable one. 💎",
  ],
  technologyHome: [
    "A practical gift idea with a thoughtful point of view. 🎁",
    "For someone who enjoys making everyday spaces work a little better.",
    "A useful detail can still feel personal. ✨",
  ],
  wellbeing: [
    "Making room for a personal pause can be a thoughtful gift. 🌿",
    "A considered choice for a more intentional routine.",
    "A simple way to make an everyday routine feel more personal. 💎",
  ],
  general: [
    "This could suit you—or become a thoughtful gift for someone special. 🎁",
    "Can you imagine the smile behind this gift? ✨",
    "A good choice starts with something that feels personal.",
  ],
};

function chooseMessage(messages: readonly string[]) {
  return messages[Math.floor(Math.random() * messages.length)];
}

function getMessageCategory(category: string) {
  const normalized = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO");

  if (normalized.includes("joyeria")) return "jewelry";
  if (normalized.includes("tecnologia") || normalized.includes("hogar")) return "technologyHome";
  if (normalized.includes("bienestar")) return "wellbeing";
  return "general";
}

function getProductMessage(product: NexyProductInterest, intent: NexyIntent) {
  const groups = product.market === "us" ? giftMessagesEnglish : giftMessages;
  const message = chooseMessage(groups[getMessageCategory(product.category)]);
  if (intent !== "buy") return message;
  return product.market === "us" ? `Great choice! ${message}` : `¡Buena elección! ${message}`;
}

function readStoredAnnouncement(): StoredNexyAnnouncement | null {
  try {
    const stored = window.sessionStorage.getItem(ANNOUNCEMENT_STORAGE_KEY);
    if (!stored) return null;

    const announcement = JSON.parse(stored) as StoredNexyAnnouncement;
    if (!announcement.message || announcement.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(ANNOUNCEMENT_STORAGE_KEY);
      return null;
    }

    return announcement;
  } catch {
    return null;
  }
}

function getActiveAnnouncement(): StoredNexyAnnouncement | null {
  if (inMemoryAnnouncement?.expiresAt && inMemoryAnnouncement.expiresAt > Date.now()) {
    return inMemoryAnnouncement;
  }

  inMemoryAnnouncement = null;
  const storedAnnouncement = readStoredAnnouncement();
  if (storedAnnouncement) inMemoryAnnouncement = storedAnnouncement;
  return storedAnnouncement;
}

const NexyContext = createContext<NexyContextValue | null>(null);

export function NexyProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [announcement, setAnnouncement] = useState<NexyAnnouncement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearAnnouncement = useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    inMemoryAnnouncement = null;
    window.sessionStorage.removeItem(ANNOUNCEMENT_STORAGE_KEY);
    setAnnouncement(null);
  }, []);

  const scheduleAnnouncementExpiry = useCallback((expiresAt: number) => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);

    timeoutRef.current = window.setTimeout(clearAnnouncement, Math.max(expiresAt - Date.now(), 0));
  }, [clearAnnouncement]);

  const announceProduct = useCallback((product: NexyProductInterest, intent: NexyIntent = "view") => {
    const nextAnnouncement = {
      id: Date.now(),
      message: getProductMessage(product, intent),
    };
    const expiresAt = Date.now() + ANNOUNCEMENT_DURATION_MS;
    inMemoryAnnouncement = { ...nextAnnouncement, expiresAt };

    setAnnouncement(nextAnnouncement);
    window.sessionStorage.setItem(
      ANNOUNCEMENT_STORAGE_KEY,
      JSON.stringify({ ...nextAnnouncement, expiresAt } satisfies StoredNexyAnnouncement),
    );
    scheduleAnnouncementExpiry(expiresAt);
  }, [scheduleAnnouncementExpiry]);

  useEffect(() => {
    const storedAnnouncement = getActiveAnnouncement();
    if (!storedAnnouncement) return;

    const restoreHandle = window.setTimeout(() => {
      setAnnouncement({ id: storedAnnouncement.id, message: storedAnnouncement.message });
      scheduleAnnouncementExpiry(storedAnnouncement.expiresAt);
    }, 0);
    return () => window.clearTimeout(restoreHandle);
  }, [scheduleAnnouncementExpiry]);

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  return <NexyContext.Provider value={{ announcement, announceProduct }}>{children}</NexyContext.Provider>;
}

export function useNexy() {
  const context = useContext(NexyContext);
  if (!context) throw new Error("useNexy debe usarse dentro de NexyProvider.");
  return context;
}
