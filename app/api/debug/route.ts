import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    DATABASE_URL_UNPOOLED: Boolean(process.env.DATABASE_URL_UNPOOLED),
    POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
    POSTGRES_URL_NON_POOLING: Boolean(process.env.POSTGRES_URL_NON_POOLING),
    POSTGRES_PRISMA_URL: Boolean(process.env.POSTGRES_PRISMA_URL),
    NEON_DATABASE_URL: Boolean(process.env.NEON_DATABASE_URL),
  });
}
