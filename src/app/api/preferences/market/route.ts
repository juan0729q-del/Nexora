import { NextResponse } from "next/server";
import { isMarket } from "@/lib/i18n/config";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { market?: unknown } | null;
  if (!body || typeof body.market !== "string" || !isMarket(body.market)) {
    return NextResponse.json({ message: "Invalid market preference." }, { status: 400 });
  }

  const response = NextResponse.json({ market: body.market });
  response.cookies.set("nexora_market", body.market, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}
