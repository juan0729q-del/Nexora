"use server";
import { redirect } from "next/navigation";
import { authenticateAdmin } from "@/lib/admin-auth";
export async function login(formData: FormData) { const password = String(formData.get("password") || ""); if (await authenticateAdmin(password)) redirect("/admin"); redirect("/admin/login?error=1"); }
