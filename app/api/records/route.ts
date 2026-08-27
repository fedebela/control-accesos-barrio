import { NextResponse } from "next/server";
import { getRegistrosHoy } from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const records = await getRegistrosHoy();
    return NextResponse.json(records, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
