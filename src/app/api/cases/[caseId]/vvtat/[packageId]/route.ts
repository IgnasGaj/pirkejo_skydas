import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { packageZip, preparationPdf, verifyPackageEvidenceMetadata, PackageExportError } from "@/features/vvtat/export";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message: string, status: number) => new NextResponse(message, { status, headers });
let activeExports = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ caseId: string; packageId: string }> }) {
  const { caseId, packageId } = await params;
  if (!z.uuid().safeParse(caseId).success || !z.uuid().safeParse(packageId).success) return fail("Paketas nerastas.", 404);
  const user = await getAuthenticatedUser();
  if (!user) return fail("Prisijunkite iš naujo.", 401);
  if (activeExports >= 2) return fail("Šiuo metu ruošiama per daug paketų. Bandykite vėliau.", 429);
  activeExports++;
  try {
    const client = await createClient();
    const { data: pkg, error } = await client.from("vvtat_packages").select("*")
      .eq("id", packageId).eq("case_id", caseId).eq("user_id", user.id).maybeSingle();
    if (error) return fail("Paketas laikinai nepasiekiamas.", 503);
    if (!pkg) return fail("Paketas nerastas.", 404);
    const { data: purchase } = await client.from("purchases").select("deletion_state").eq("id", pkg.purchase_id).eq("user_id", user.id).maybeSingle();
    if (!purchase || purchase.deletion_state !== "ACTIVE") return fail("Pirkinys nepasiekiamas.", 409);
    await verifyPackageEvidenceMetadata(client, pkg);
    const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "zip";
    const bytes = format === "pdf" ? await preparationPdf(pkg) : await packageZip(client, pkg);
    return new NextResponse(Buffer.from(bytes), { headers: { ...headers,
      "Content-Type": format === "pdf" ? "application/pdf" : "application/zip",
      "Content-Disposition": `attachment; filename="vvtat-paketas-v${pkg.version_no}.${format}"`
    } });
  } catch (error) {
    if (error instanceof PackageExportError) return fail(`Paketas parengtas, atsisiuntimas nepavyko. ${error.message}`, 409);
    console.error("Package export failed");
    return fail("Paketas parengtas, atsisiuntimas nepavyko. Bandykite dar kartą.", 503);
  } finally { activeExports--; }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ caseId: string; packageId: string }> }) {
  const { caseId, packageId } = await params;
  if (!z.uuid().safeParse(caseId).success || !z.uuid().safeParse(packageId).success) return fail("Paketas nerastas.", 404);
  const user = await getAuthenticatedUser();
  if (!user) return fail("Prisijunkite iš naujo.", 401);
  const client = await createClient();
  const { data: pkg } = await client.from("vvtat_packages").select("id").eq("id", packageId).eq("case_id", caseId).eq("user_id", user.id).maybeSingle();
  if (!pkg) return fail("Paketas nerastas.", 404);
  const { error } = await client.rpc("delete_vvtat_package", { p_package_id: packageId });
  if (error) return fail("Paketo nepavyko ištrinti.", 503);
  return NextResponse.json({ deleted: true }, { headers });
}
