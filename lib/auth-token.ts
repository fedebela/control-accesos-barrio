/**
 * Firma y verificacion del token de sesion.
 *
 * Usa Web Crypto (globalThis.crypto.subtle), que existe tanto en el runtime de
 * Node como en el Edge. Esto importa porque el middleware corre en Edge y no
 * puede usar node:crypto; el hash de contraseñas, que si lo usa, vive aparte
 * en lib/auth.ts y nunca se importa desde el middleware.
 *
 * El token no guarda secretos: solo el id de sesion y datos para decidir
 * ruteo sin consultar la base. La autoridad final sigue siendo la tabla
 * `sesiones`, que es lo que permite cerrar una sesion a distancia.
 */

export type PayloadSesion = {
  sid: string;
  uid: number;
  usuario: string;
  /** true si en esta sesion ya se ingreso la clave de gestion */
  gestion: boolean;
  /** vencimiento en segundos desde epoch */
  exp: number;
};

export const COOKIE_SESION = "sesion";

function secreto(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    // Alternativa para que la app no quede inutilizable si falta la variable.
    // No es ideal: si cambia la URL del despliegue, las sesiones se invalidan.
    `fallback-${process.env.VERCEL_URL || "local"}-control-accesos`
  );
}

function b64urlEncode(datos: Uint8Array | string): string {
  const bytes = typeof datos === "string" ? new TextEncoder().encode(datos) : datos;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(texto: string): string {
  const base = texto.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = base + "=".repeat((4 - (base.length % 4)) % 4);
  const bin = atob(relleno);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function clave(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function firmarSesion(payload: PayloadSesion): Promise<string> {
  const cuerpo = b64urlEncode(JSON.stringify(payload));
  const firma = await crypto.subtle.sign("HMAC", await clave(), new TextEncoder().encode(cuerpo));
  return `${cuerpo}.${b64urlEncode(new Uint8Array(firma))}`;
}

export async function verificarSesion(token: string | undefined | null): Promise<PayloadSesion | null> {
  if (!token || !token.includes(".")) return null;

  const [cuerpo, firma] = token.split(".");
  if (!cuerpo || !firma) return null;

  try {
    const esperada = await crypto.subtle.sign("HMAC", await clave(), new TextEncoder().encode(cuerpo));
    if (b64urlEncode(new Uint8Array(esperada)) !== firma) return null;

    const payload = JSON.parse(b64urlDecode(cuerpo)) as PayloadSesion;
    if (!payload?.sid || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

/** Duracion de la sesion: alcanza para cubrir un turno completo. */
export const HORAS_SESION = 14;
