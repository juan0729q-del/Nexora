import { isMarket } from "@/lib/i18n/config";
import { buildGoogleMerchantFeed, MerchantFeedNotConfiguredError } from "@/lib/merchant-feed";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ feed: string }> }) {
  const { feed } = await params;
  const market = feed.replace(/\.xml$/i, "");
  if (!isMarket(market) || feed !== `${market}.xml`) {
    return new Response("Feed not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
  try {
    const body = await buildGoogleMerchantFeed(market);
    return new Response(body, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    if (error instanceof MerchantFeedNotConfiguredError) {
      return new Response("Merchant feed not configured for this market.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
      });
    }
    return new Response("Merchant feed unavailable.", { status: 500, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  }
}
