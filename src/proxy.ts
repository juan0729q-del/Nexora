import { NextResponse, type NextRequest } from "next/server";
import { isMarket, marketFromCountry, markets } from "@/lib/i18n/config";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const pathMarket = firstSegment && isMarket(firstSegment) ? firstSegment : null;
  const preferredMarket = request.cookies.get("nexora_market")?.value;
  const detectedMarket = isMarket(preferredMarket || "")
    ? preferredMarket as "co" | "us"
    : marketFromCountry(request.headers.get("x-vercel-ip-country"));

  if (pathname === "/") {
    return NextResponse.redirect(new URL(markets[detectedMarket].homePath, request.url));
  }

  const locale = pathMarket ? markets[pathMarket].locale : "es-CO";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nexora-locale", locale);
  requestHeaders.set("x-nexora-market", pathMarket || "co");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico)$).*)"],
};
