import { NextResponse, type NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verificarSesion, COOKIE_SESION } from "@/lib/auth-token";

/**
 * Control de acceso a nivel de ruta.
 *
 * Corre en el runtime Edge, asi que solo puede usar Web Crypto y el driver
 * HTTP de Neon. Nada de node:crypto: por eso el hash de contraseñas vive en
 * lib/auth.ts, que nunca se importa desde aca.
 *
 * Dos niveles:
 *   1. Sesion iniciada  -> pantalla de accesos.
 *   2. Gestion desbloqueada (clave adicional) -> maestros, informes, importar.
 */

const RUTAS_GESTION = ["/maestros", "/informes", "/importar"];
const RUTAS_PUBLICAS = ["/login"];

function conexion() {
  const url =
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL;
  return url ? neon(url) : null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (RUTAS_PUBLICAS.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const payload = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value);

  if (!payload) return redirigirALogin(req);

  // La cookie esta firmada, pero la autoridad es la tabla `sesiones`: es lo
  // que permite cerrar una sesion a distancia y sostener la regla de un solo
  // usuario a la vez. Si la base no responde, se deja pasar con la cookie
  // firmada antes que dejar la guardia sin sistema.
  const sql = conexion();
  if (sql) {
    try {
      const filas = (await sql`
        SELECT gestion_habilitada FROM sesiones
        WHERE id = ${payload.sid} AND expira_en > NOW()
        LIMIT 1
      `) as any[];

      if (filas.length === 0) return redirigirALogin(req, "vencida");

      if (
        RUTAS_GESTION.some((r) => pathname.startsWith(r)) &&
        !filas[0].gestion_habilitada
      ) {
        const url = req.nextUrl.clone();
        url.pathname = "/";
        url.search = `?gestion=1&destino=${encodeURIComponent(pathname)}`;
        return NextResponse.redirect(url);
      }

      return NextResponse.next();
    } catch {
      // Cae al control por cookie de abajo.
    }
  }

  if (RUTAS_GESTION.some((r) => pathname.startsWith(r)) && !payload.gestion) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = `?gestion=1&destino=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

function redirigirALogin(req: NextRequest, motivo?: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = motivo ? `?motivo=${motivo}` : "";
  const res = NextResponse.redirect(url);
  if (motivo === "vencida") res.cookies.delete(COOKIE_SESION);
  return res;
}

export const config = {
  // Se excluyen estaticos y la propia API de Next para no pagar el control
  // en cada archivo servido.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
