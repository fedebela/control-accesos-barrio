import { cookies, headers } from "next/headers";
import { getSql } from "@/lib/db";
import { verificarSesion, COOKIE_SESION } from "@/lib/auth-token";
import type { AccionAuditoria } from "@/lib/auditoria-constantes";

/**
 * Registro de auditoria. SOLO SERVIDOR: usa next/headers.
 * Las etiquetas y los tipos viven en lib/auditoria-constantes.ts, que si se
 * puede importar desde las pantallas.
 *
 * Deja rastro de las acciones de autenticacion y administracion. Los
 * movimientos de entrada y salida NO se registran aca: ya viven en la
 * bitacora, con su operador, y duplicarlos solo agregaria ruido.
 *
 * Nunca se guardan contraseñas, ni siquiera las fallidas. En un intento
 * fallido se registra el usuario que se probo, jamas lo que se tipeo.
 *
 * La sesion se lee de la cookie firmada en lugar de consultar la base: no
 * tiene sentido pagar una consulta extra para poder anotar un evento.
 */
export async function auditar(
  accion: AccionAuditoria,
  detalle: string,
  contexto?: { usuario?: string; rol?: string }
) {
  try {
    const galletas = await cookies();

    let usuario = contexto?.usuario?.trim() || "";
    let rol = contexto?.rol?.trim() || "";

    if (!usuario) {
      const payload = await verificarSesion(galletas.get(COOKIE_SESION)?.value);
      if (payload) {
        usuario = payload.usuario;
        rol = payload.rol;
      }
    }

    const dispositivo = galletas.get("equipo")?.value || null;

    let ip: string | null = null;
    try {
      const h = await headers();
      ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || null;
    } catch {
      // Fuera de un request no hay cabeceras; no importa.
    }

    await getSql()`
      INSERT INTO auditoria (accion, detalle, usuario, rol, dispositivo_id, ip)
      VALUES (${accion}, ${detalle || null}, ${usuario || null}, ${rol || null},
              ${dispositivo}, ${ip})
    `;
  } catch (error) {
    // La auditoria nunca puede romper la accion que la origino.
    console.error("No se pudo registrar la auditoría:", error);
  }
}
