import { scrypt, randomBytes, timingSafeEqual } from "crypto";

/**
 * Hash de contraseñas con scrypt, que viene en Node y evita sumar dependencias.
 *
 * Este archivo NO puede importarse desde el middleware: node:crypto no existe
 * en el runtime Edge. La firma del token de sesion, que si se usa alli, esta
 * en lib/auth-token.ts.
 */

const LARGO_CLAVE = 64;

function derivar(clave: string, sal: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(clave.normalize("NFKC"), sal, LARGO_CLAVE, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}

/** Devuelve "sal:hash" listo para guardar. */
export async function hashearClave(clave: string): Promise<string> {
  const sal = randomBytes(16).toString("hex");
  const hash = await derivar(clave, sal);
  return `${sal}:${hash.toString("hex")}`;
}

/** Comparacion en tiempo constante para no filtrar informacion por el tiempo. */
export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  if (!clave || !guardado || !guardado.includes(":")) return false;

  const [sal, hex] = guardado.split(":");
  if (!sal || !hex) return false;

  try {
    const esperado = Buffer.from(hex, "hex");
    const calculado = await derivar(clave, sal);
    if (esperado.length !== calculado.length) return false;
    return timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

export function generarId(): string {
  return randomBytes(24).toString("hex");
}

// ---------------------------------------------------------------- Validacion

export const LARGO_CLAVE_INGRESO = 8;
export const LARGO_CLAVE_GESTION = 4;

/** Solo letras y numeros, del largo exacto pedido. */
export function validarClave(clave: string, largo: number): string | null {
  const c = String(clave || "");
  if (c.length !== largo) return `La contraseña debe tener exactamente ${largo} caracteres.`;
  if (!/^[a-zA-Z0-9]+$/.test(c)) return "La contraseña solo puede tener letras y números.";
  return null;
}

/**
 * Normaliza el nombre de usuario: minusculas y sin acentos.
 * Asi "GuardiaDía" y "guardiadia" son el mismo usuario y no se pierde tiempo
 * en la guardia peleando con el teclado.
 */
export function normalizarUsuario(usuario: string): string {
  return String(usuario || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}
