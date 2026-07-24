import { NextResponse } from "next/server";
import { syncSupplierCatalog } from "@/lib/automation/supplier-sync";
export async function POST(request: Request) { const authorization = request.headers.get("authorization"); if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ message: "No autorizado" }, { status: 401 }); try { return NextResponse.json(await syncSupplierCatalog()); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Falló la sincronización" }, { status: 502 }); } }
