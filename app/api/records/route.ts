import { NextResponse } from "next/server";
import { getRegistrosHoy } from "@/app/actions";

export async function GET() {
  const records = await getRegistrosHoy();
  return NextResponse.json(records);
}
