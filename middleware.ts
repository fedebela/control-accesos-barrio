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
 * Tres niveles:
 *   1. Sesion iniciada            -> segun el rol, pantalla del puesto o del residente.
 *   2. Gestion desbloqueada       -> maestros, informes, importar.
 *   3. Restriccion por IP         -> opcional, solo para las rutas del puesto.
 */

const RUTAS_GESTION = ["/maestros", "/informes", "/importar"];
const RUTAS_RESIDENTE = ["/residente"];
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

/**
 * IP de origen. En Vercel el primer valor de x-forwarded-for es el cliente.
 * Si IPS_PUESTO no esta definida no se restringe nada, que es lo razonable
 * mientras la conexion del puesto no tenga IP fija.
 */
function ipPermitida(req: NextRequest): boolean {
  const lista = (process.env.IPS_PUESTO || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (lista.length === 0) return true;

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || "";

  return lista.includes(ip);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (RUTAS_PUBLICAS.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const payload = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value);
  if (!payload) return redirigirALogin(req);

  const esRutaResidente = RUTAS_RESIDENTE.some((r) => pathname.startsWith(r));
  const esResidente = payload.rol === "residente";

  // Cada rol se queda en lo suyo.
  if (esResidente && !esRutaResidente) {
    return redirigir(req, "/residente");
  }
  if (!esResidente && esRutaResidente) {
    return redirigir(req, "/");
  }

  // La restriccion por IP protege el puesto, no a los residentes: ellos entran
  // desde el celular, desde cualquier lado.
  if (!esResidente && !ipPermitida(req)) {
    return new NextResponse(
      "Acceso restringido: esta aplicación solo puede usarse desde la red del puesto de guardia.",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  // La cookie esta firmada, pero la autoridad es la tabla `sesiones`: es lo
  // que permite cerrar una sesion a distancia y sostener la regla de un solo
  // usuario del puesto a la vez. Si la base no responde, se deja pasar con la
  // cookie firmada antes que dejar la guardia sin sistema.
  const sql = conexion();
  if (sql) {
    try {
      const filas = (await sql`
        SELECT gestion_habilitada FROM sesiones
        WHERE id = ${payload.sid} AND expira_en > NOW()
        LIMIT 1
      `) as any[];

      if (filas.length === 0) return redirigirALogin(req, "vencida");

      if (RUTAS_GESTION.some((r) => pathname.startsWith(r)) && !filas[0].gestion_habilitada) {
        return pedirGestion(req, pathname);
      }

      return NextResponse.next();
    } catch {
      // Cae al control por cookie de abajo.
    }
  }

  if (RUTAS_GESTION.some((r) => pathname.startsWith(r)) && !payload.gestion) {
    return pedirGestion(req, pathname);
  }

  return NextResponse.next();
}

function redirigir(req: NextRequest, destino: string) {
  const url = req.nextUrl.clone();
  url.pathname = destino;
  url.search = "";
  return NextResponse.redirect(url);
}

function pedirGestion(req: NextRequest, destino: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = `?gestion=1&destino=${encodeURIComponent(destino)}`;
  return NextResponse.redirect(url);
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
