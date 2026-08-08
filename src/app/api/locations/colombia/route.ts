import { NextResponse } from "next/server";
import { getColombiaDepartment } from "@/lib/colombia-locations";

export const runtime = "nodejs";

type ArcGisMunicipality = { attributes?: { Municipio?: unknown; Codigo_DANE?: unknown } };

export async function GET(request: Request) {
  const departmentId = new URL(request.url).searchParams.get("department")?.trim() || "";
  if (!getColombiaDepartment(departmentId)) {
    return NextResponse.json({ message: "Selecciona un departamento válido." }, { status: 400 });
  }

  const endpoint = new URL("https://visor.codigopostal.gov.co/arcgis/rest/services/DivisionAdministrativa/MapServer/3/query");
  endpoint.searchParams.set("where", `DepartamentoID='${departmentId}'`);
  endpoint.searchParams.set("outFields", "Municipio,Codigo_DANE");
  endpoint.searchParams.set("returnGeometry", "false");
  endpoint.searchParams.set("orderByFields", "Municipio");
  endpoint.searchParams.set("f", "json");

  try {
    const response = await fetch(endpoint, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`4-72 respondió ${response.status}`);
    const payload = await response.json() as { features?: ArcGisMunicipality[] };
    const municipalities = (payload.features || []).flatMap((feature) => {
      const name = typeof feature.attributes?.Municipio === "string" ? feature.attributes.Municipio.trim() : "";
      const daneCode = String(feature.attributes?.Codigo_DANE || "").trim();
      return name && /^\d{5}$/.test(daneCode) ? [{ name, daneCode }] : [];
    });
    if (!municipalities.length) throw new Error("4-72 no devolvió municipios");
    return NextResponse.json({ municipalities }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return NextResponse.json({ message: "No fue posible consultar los municipios oficiales de 4-72." }, { status: 503 });
  }
}
