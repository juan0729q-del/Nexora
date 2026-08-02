"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateAdmin } from "@/lib/admin-auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") || "");
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-vercel-forwarded-for")
    || requestHeaders.get("x-forwarded-for")
    || "unknown";
  const fingerprint = `${forwarded.split(",")[0]}|${requestHeaders.get("user-agent") || ""}`;
  if (await authenticateAdmin(password, fingerprint)) redirect("/admin");
  redirect("/admin/login?error=1");
}
