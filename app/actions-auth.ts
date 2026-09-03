"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ensureTables, getSql } from "@/lib/db";
import {
  hashearClave, verificarClave, generarId, validarClave, normalizarUsuario,
  LARGO_CLAVE_INGRESO, LARGO_CLAVE_GESTION,
} from "@/lib/auth";
import {
  firmarSesion, verificarSesion, COOKIE_SESION, HORAS_SESION,
  type PayloadSesion,
} from "@/lib/auth-token";

const CLAVE_GESTION = "clave_gestion";

// Valores iniciales pedidos. Conviene cambiarlos desde Maestros al poner en
// produccion: quedan en el repositorio y cualquiera que lo lea los conoce.
const USUARIOS_INICIALES = [
  { usuario: "guardiadia", descripcion: "Puesto de guardia — Turno día" },
  { usuario: "guardianoche", descripcion: "Puesto de guardia — Turno noche" },
];
const CLAVE_INGRESO_INICIAL = "12345678";
const CLAVE_GESTION_INICIAL = "1234";

// ========== BOOTSTRAP ==========

/**
 * Crea los usuarios y la clave de gestion la primera vez.
 * Es idempotente: si ya existen no toca nada, asi que se puede llamar siempre.
 */
async function asegurarDatosIniciales() {
  await ensureTables();
  const sql = getSql();

  const hay = (await sql`SELECT 1 FROM usuarios LIMIT 1`) as any[];
  if (hay.length === 0) {
    const hash = await hashearClave(CLAVE_INGRESO_INICIAL);
    for (const u of USUARIOS_INICIALES) {
      await sql`
        INSERT INTO usuarios (usuario, descripcion, clave_hash, activo)
        VALUES (${u.usuario}, ${u.descripcion}, ${hash}, TRUE)
        ON CONFLICT (usuario) DO NOTHING
      `;
    }
  }

  const gestion = (await sql`
    SELECT 1 FROM configuracion WHERE clave = ${CLAVE_GESTION} LIMIT 1
  `) as any[];
  if (gestion.length === 0) {
    await sql`
      INSERT INTO configuracion (clave, valor)
      VALUES (${CLAVE_GESTION}, ${await hashearClave(CLAVE_GESTION_INICIAL)})
      ON CONFLICT (clave) DO NOTHING
    `;
  }
}

// ========== SESION ==========

export type SesionActual = {
  sid: string;
  usuarioId: number;
  usuario: string;
  descripcion: string;
  gestionHabilitada: boolean;
  expiraEn: string;
};

/** Borra las sesiones vencidas. Barato y evita que una quede trabada para siempre. */
async function limpiarVencidas(sql: ReturnType<typeof getSql>) {
  await sql`DELETE FROM sesiones WHERE expira_en < NOW()`;
}

/**
 * Sesion vigente, validada contra la base.
 * La cookie firmada sola no alcanza: la tabla es lo que permite cerrar una
 * sesion a distancia y sostener la regla de un solo usuario a la vez.
 */
export async function getSesionActual(): Promise<SesionActual | null> {
  try {
    const token = (await cookies()).get(COOKIE_SESION)?.value;
    const payload = await verificarSesion(token);
    if (!payload) return null;

    await ensureTables();
    const sql = getSql();
    await limpiarVencidas(sql);

    const filas = (await sql`
      SELECT s.id, s.usuario_id, s.usuario, s.gestion_habilitada, s.expira_en,
             u.descripcion, u.activo
      FROM sesiones s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = ${payload.sid} AND s.expira_en > NOW()
      LIMIT 1
    `) as any[];

    const s = filas[0];
    if (!s || !s.activo) return null;

    await sql`UPDATE sesiones SET ultimo_uso = NOW() WHERE id = ${s.id}`;

    return {
      sid: s.id,
      usuarioId: Number(s.usuario_id),
      usuario: s.usuario,
      descripcion: s.descripcion || "",
      gestionHabilitada: Boolean(s.gestion_habilitada),
      expiraEn: s.expira_en,
    };
  } catch {
    return null;
  }
}

/** Sesion activa de otro usuario, para avisar en la pantalla de login. */
export async function getSesionOcupada(): Promise<{ usuario: string; desde: string } | null> {
  try {
    await asegurarDatosIniciales();
    const sql = getSql();
    await limpiarVencidas(sql);

    const filas = (await sql`
      SELECT usuario, creada_en FROM sesiones
      WHERE expira_en > NOW()
      ORDER BY creada_en DESC LIMIT 1
    `) as any[];

    if (filas.length === 0) return null;
    return { usuario: filas[0].usuario, desde: filas[0].creada_en };
  } catch {
    return null;
  }
}

async function guardarCookie(payload: PayloadSesion) {
  const token = await firmarSesion(payload);
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HORAS_SESION * 3600,
  });
}

// ========== LOGIN / LOGOUT ==========

export async function iniciarSesion(prevState: any, formData: FormData) {
  const usuario = normalizarUsuario(String(formData.get("usuario") || ""));
  const clave = String(formData.get("clave") || "");
  const forzar = formData.get("forzar") === "true";
  const claveGestion = String(formData.get("clave_gestion") || "");

  if (!usuario || !clave) {
    return { error: "Ingresá usuario y contraseña." };
  }

  try {
    await asegurarDatosIniciales();
    const sql = getSql();
    await limpiarVencidas(sql);

    const filas = (await sql`
      SELECT id, usuario, descripcion, clave_hash, activo
      FROM usuarios WHERE usuario = ${usuario} LIMIT 1
    `) as any[];

    const u = filas[0];
    // Mismo mensaje exista o no el usuario: no conviene revelar cuales existen.
    if (!u || !u.activo || !(await verificarClave(clave, u.clave_hash))) {
      return { error: "Usuario o contraseña incorrectos." };
    }

    // ---- Un solo usuario a la vez ----
    const activas = (await sql`
      SELECT id, usuario, creada_en FROM sesiones WHERE expira_en > NOW()
    `) as any[];

    if (activas.length > 0) {
      const otra = activas[0];

      if (!forzar) {
        return {
          error:
            `Ya hay una sesión abierta de "${otra.usuario}" desde las ` +
            `${new Date(otra.creada_en).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}. ` +
            `Tiene que cerrar sesión para que entres.`,
          sesionOcupada: true,
          usuarioOcupa: otra.usuario,
        };
      }

      // El cierre forzado existe para cuando el turno anterior se fue sin
      // desloguear. Pide la clave de gestion para que no lo haga cualquiera.
      const cfg = (await sql`
        SELECT valor FROM configuracion WHERE clave = ${CLAVE_GESTION} LIMIT 1
      `) as any[];

      if (!cfg[0] || !(await verificarClave(claveGestion, cfg[0].valor))) {
        return {
          error: "Clave de gestión incorrecta. No se cerró la otra sesión.",
          sesionOcupada: true,
          usuarioOcupa: otra.usuario,
        };
      }

      await sql`DELETE FROM sesiones`;
    }

    const sid = generarId();
    const expira = new Date(Date.now() + HORAS_SESION * 3600 * 1000);

    await sql`
      INSERT INTO sesiones (id, usuario_id, usuario, expira_en, gestion_habilitada)
      VALUES (${sid}, ${u.id}, ${u.usuario}, ${expira.toISOString()}, FALSE)
    `;
    await sql`UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ${u.id}`;

    await guardarCookie({
      sid,
      uid: Number(u.id),
      usuario: u.usuario,
      gestion: false,
      exp: Math.floor(expira.getTime() / 1000),
    });

    return { success: true };
  } catch (error: any) {
    return { error: error.message || "No se pudo iniciar sesión." };
  }
}

export async function cerrarSesion() {
  try {
    const token = (await cookies()).get(COOKIE_SESION)?.value;
    const payload = await verificarSesion(token);

    if (payload) {
      await ensureTables();
      await getSql()`DELETE FROM sesiones WHERE id = ${payload.sid}`;
    }
  } catch {
    // Aunque falle el borrado, la cookie se limpia igual.
  }

  (await cookies()).delete(COOKIE_SESION);
  return { success: true };
}

// ========== GESTION (maestros, informes, importacion) ==========

export async function desbloquearGestion(prevState: any, formData: FormData) {
  const clave = String(formData.get("clave_gestion") || "");
  if (!clave) return { error: "Ingresá la clave de gestión." };

  try {
    const sesion = await getSesionActual();
    if (!sesion) return { error: "La sesión venció. Volvé a iniciar sesión." };

    const sql = getSql();
    const cfg = (await sql`
      SELECT valor FROM configuracion WHERE clave = ${CLAVE_GESTION} LIMIT 1
    `) as any[];

    if (!cfg[0] || !(await verificarClave(clave, cfg[0].valor))) {
      return { error: "Clave de gestión incorrecta." };
    }

    await sql`UPDATE sesiones SET gestion_habilitada = TRUE WHERE id = ${sesion.sid}`;

    await guardarCookie({
      sid: sesion.sid,
      uid: sesion.usuarioId,
      usuario: sesion.usuario,
      gestion: true,
      exp: Math.floor(new Date(sesion.expiraEn).getTime() / 1000),
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error: any) {
    return { error: error.message || "No se pudo desbloquear." };
  }
}

/** Vuelve a bloquear maestros e informes sin cerrar la sesion del puesto. */
export async function bloquearGestion() {
  try {
    const sesion = await getSesionActual();
    if (!sesion) return { success: true };

    await getSql()`UPDATE sesiones SET gestion_habilitada = FALSE WHERE id = ${sesion.sid}`;

    await guardarCookie({
      sid: sesion.sid,
      uid: sesion.usuarioId,
      usuario: sesion.usuario,
      gestion: false,
      exp: Math.floor(new Date(sesion.expiraEn).getTime() / 1000),
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch {
    return { success: true };
  }
}

/** Corta la ejecucion de una accion sensible si la gestion no esta desbloqueada. */
export async function exigirGestion(): Promise<string | null> {
  const sesion = await getSesionActual();
  if (!sesion) return "La sesión venció. Volvé a iniciar sesión.";
  if (!sesion.gestionHabilitada) return "Necesitás la clave de gestión para hacer esto.";
  return null;
}

// ========== ADMINISTRACION DE USUARIOS ==========

export type UsuarioApp = {
  id: number;
  usuario: string;
  descripcion: string;
  activo: boolean;
  ultimo_acceso: string | null;
};

export async function getUsuarios(): Promise<UsuarioApp[]> {
  try {
    if (await exigirGestion()) return [];
    await asegurarDatosIniciales();
    return (await getSql()`
      SELECT id, usuario, descripcion, activo, ultimo_acceso
      FROM usuarios ORDER BY usuario
    `) as unknown as UsuarioApp[];
  } catch {
    return [];
  }
}

export async function crearUsuario(prevState: any, formData: FormData) {
  const bloqueo = await exigirGestion();
  if (bloqueo) return { error: bloqueo };

  const usuario = normalizarUsuario(String(formData.get("usuario") || ""));
  const descripcion = String(formData.get("descripcion") || "").trim();
  const clave = String(formData.get("clave") || "");

  if (!usuario) return { error: "Indicá el nombre de usuario." };

  const problema = validarClave(clave, LARGO_CLAVE_INGRESO);
  if (problema) return { error: problema };

  try {
    const sql = getSql();
    const existe = (await sql`SELECT 1 FROM usuarios WHERE usuario = ${usuario} LIMIT 1`) as any[];
    if (existe.length > 0) return { error: `Ya existe el usuario "${usuario}".` };

    await sql`
      INSERT INTO usuarios (usuario, descripcion, clave_hash, activo)
      VALUES (${usuario}, ${descripcion || null}, ${await hashearClave(clave)}, TRUE)
    `;

    revalidatePath("/maestros");
    return { success: true, message: `Usuario "${usuario}" creado.` };
  } catch (error: any) {
    return { error: error.message || "No se pudo crear el usuario." };
  }
}

export async function cambiarClaveUsuario(prevState: any, formData: FormData) {
  const bloqueo = await exigirGestion();
  if (bloqueo) return { error: bloqueo };

  const id = Number(formData.get("id") || 0);
  const clave = String(formData.get("clave") || "");

  if (!id) return { error: "Falta el usuario." };

  const problema = validarClave(clave, LARGO_CLAVE_INGRESO);
  if (problema) return { error: problema };

  try {
    await getSql()`
      UPDATE usuarios SET clave_hash = ${await hashearClave(clave)} WHERE id = ${id}
    `;
    revalidatePath("/maestros");
    return { success: true, message: "Contraseña actualizada." };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function activarUsuario(id: number, activo: boolean) {
  const bloqueo = await exigirGestion();
  if (bloqueo) return { error: bloqueo };

  try {
    const sql = getSql();
    await sql`UPDATE usuarios SET activo = ${activo} WHERE id = ${id}`;
    // Un usuario desactivado no puede seguir con la sesion abierta.
    if (!activo) await sql`DELETE FROM sesiones WHERE usuario_id = ${id}`;

    revalidatePath("/maestros");
    return { success: true, message: activo ? "Usuario activado." : "Usuario desactivado." };
  } catch (error: any) {
    return { error: error.message };
  }
}

/** Blanqueo de la clave de gestion, unica y compartida. */
export async function cambiarClaveGestion(prevState: any, formData: FormData) {
  const bloqueo = await exigirGestion();
  if (bloqueo) return { error: bloqueo };

  const actual = String(formData.get("clave_actual") || "");
  const nueva = String(formData.get("clave_nueva") || "");
  const repetir = String(formData.get("clave_repetir") || "");

  const problema = validarClave(nueva, LARGO_CLAVE_GESTION);
  if (problema) return { error: problema };
  if (nueva !== repetir) return { error: "Las contraseñas nuevas no coinciden." };

  try {
    const sql = getSql();
    const cfg = (await sql`
      SELECT valor FROM configuracion WHERE clave = ${CLAVE_GESTION} LIMIT 1
    `) as any[];

    if (!cfg[0] || !(await verificarClave(actual, cfg[0].valor))) {
      return { error: "La clave de gestión actual es incorrecta." };
    }

    await sql`
      UPDATE configuracion SET valor = ${await hashearClave(nueva)}, actualizado_en = NOW()
      WHERE clave = ${CLAVE_GESTION}
    `;

    revalidatePath("/maestros");
    return { success: true, message: "Clave de gestión actualizada." };
  } catch (error: any) {
    return { error: error.message };
  }
}
