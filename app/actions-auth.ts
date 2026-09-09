"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ensureTables, getSql } from "@/lib/db";
import {
  hashearClave, verificarClave, generarId, validarClave, normalizarUsuario,
  LARGO_CLAVE_INGRESO, LARGO_CLAVE_GESTION,
} from "@/lib/auth";
import {
  firmarSesion, verificarSesion, COOKIE_SESION, HORAS_SESION, HORAS_SESION_RESIDENTE,
  type PayloadSesion, type RolUsuario,
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

  const equipos = (await sql`
    SELECT 1 FROM configuracion WHERE clave = ${CLAVE_EQUIPOS} LIMIT 1
  `) as any[];
  if (equipos.length === 0) {
    await sql`
      INSERT INTO configuracion (clave, valor)
      VALUES (${CLAVE_EQUIPOS}, ${await hashearClave(CLAVE_EQUIPOS_INICIAL)})
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
  rol: RolUsuario;
  /** Lote del residente. Vacio para los usuarios del puesto. */
  lote: string;
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
             u.descripcion, u.activo, u.rol, COALESCE(r.lote, '') AS lote
      FROM sesiones s
      JOIN usuarios u ON u.id = s.usuario_id
      LEFT JOIN residentes r ON r.id = u.residente_id
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
      rol: (s.rol || "puesto") as RolUsuario,
      lote: s.lote || "",
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

async function guardarCookie(payload: PayloadSesion, horas = HORAS_SESION) {
  const token = await firmarSesion(payload);
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: horas * 3600,
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
      SELECT id, usuario, descripcion, clave_hash, activo, rol
      FROM usuarios WHERE usuario = ${usuario} LIMIT 1
    `) as any[];

    const u = filas[0];
    // Mismo mensaje exista o no el usuario: no conviene revelar cuales existen.
    if (!u || !u.activo || !(await verificarClave(clave, u.clave_hash))) {
      return { error: "Usuario o contraseña incorrectos." };
    }

    const rol: RolUsuario = u.rol === "residente" ? "residente" : "puesto";

    // ---- Un solo usuario del PUESTO a la vez ----
    // No aplica a los residentes: entran desde su celular, son muchos y a la
    // vez. La restriccion existe para que no haya dos guardias operando la
    // misma pantalla con sesiones distintas.
    if (rol === "puesto") {
      const activas = (await sql`
        SELECT s.id, s.usuario, s.creada_en
        FROM sesiones s
        JOIN usuarios us ON us.id = s.usuario_id
        WHERE s.expira_en > NOW() AND us.rol = 'puesto'
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

        await sql`DELETE FROM sesiones WHERE id = ANY(${activas.map((a) => a.id)})`;
      }
    }

    const sid = generarId();
    const horas = rol === "residente" ? HORAS_SESION_RESIDENTE : HORAS_SESION;
    const expira = new Date(Date.now() + horas * 3600 * 1000);

    await sql`
      INSERT INTO sesiones (id, usuario_id, usuario, expira_en, gestion_habilitada)
      VALUES (${sid}, ${u.id}, ${u.usuario}, ${expira.toISOString()}, FALSE)
    `;
    await sql`UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ${u.id}`;

    await guardarCookie(
      {
        sid,
        uid: Number(u.id),
        usuario: u.usuario,
        rol,
        gestion: false,
        exp: Math.floor(expira.getTime() / 1000),
      },
      horas
    );

    return { success: true, rol };
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
      rol: sesion.rol,
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
      rol: sesion.rol,
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
  // Un residente nunca accede a la gestion del barrio, tenga o no la clave.
  if (sesion.rol !== "puesto") return "No tenés permiso para hacer esto.";
  if (!sesion.gestionHabilitada) return "Necesitás la clave de gestión para hacer esto.";
  return null;
}

/** Sesion de residente con su lote. Null si no es residente o no hay sesion. */
export async function getSesionResidente(): Promise<SesionActual | null> {
  const sesion = await getSesionActual();
  if (!sesion || sesion.rol !== "residente" || !sesion.lote) return null;
  return sesion;
}

// ========== ACCESO DE RESIDENTES ==========

/**
 * Crea el acceso de un residente. Devuelve la contraseña inicial UNA sola vez,
 * para pasarsela por WhatsApp; despues queda hasheada y no se puede recuperar.
 */
export async function crearAccesoResidente(residenteId: number) {
  const bloqueo = await exigirGestion();
  if (bloqueo) return { error: bloqueo };

  try {
    const sql = getSql();

    const filas = (await sql`
      SELECT id, nombre, apellido, dni, lote FROM residentes WHERE id = ${residenteId} LIMIT 1
    `) as any[];
    const r = filas[0];
    if (!r) return { error: "No se encontró el residente." };

    const yaTiene = (await sql`
      SELECT usuario FROM usuarios WHERE residente_id = ${residenteId} LIMIT 1
    `) as any[];
    if (yaTiene.length > 0) {
      return { error: `Ya tiene acceso con el usuario "${yaTiene[0].usuario}".` };
    }

    // Usuario a partir del apellido y el lote: corto y facil de dictar.
    const base = normalizarUsuario(`${r.apellido}${r.lote}`) || `lote${r.lote}`;
    let usuario = base;
    let n = 1;
    while (((await sql`SELECT 1 FROM usuarios WHERE usuario = ${usuario} LIMIT 1`) as any[]).length > 0) {
      usuario = `${base}${++n}`;
    }

    // 8 caracteres, sin los que se confunden al dictarlos (0/O, 1/l/I).
    const abc = "abcdefghjkmnpqrstuvwxyz23456789";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const clave = Array.from(bytes, (b) => abc[b % abc.length]).join("");

    await sql`
      INSERT INTO usuarios (usuario, descripcion, clave_hash, rol, residente_id, activo)
      VALUES (${usuario}, ${`${r.apellido}, ${r.nombre} — Lote ${r.lote}`},
              ${await hashearClave(clave)}, 'residente', ${residenteId}, TRUE)
    `;

    revalidatePath("/maestros");
    return {
      success: true,
      usuario,
      clave,
      message: `Acceso creado para ${r.nombre} ${r.apellido}.`,
    };
  } catch (error: any) {
    return { error: error.message || "No se pudo crear el acceso." };
  }
}

/** Genera una contraseña nueva para un residente que la perdio. */
export async function blanquearAccesoResidente(residenteId: number) {
  const bloqueo = await exigirGestion();
  if (bloqueo) return { error: bloqueo };

  try {
    const sql = getSql();
    const filas = (await sql`
      SELECT id, usuario FROM usuarios WHERE residente_id = ${residenteId} LIMIT 1
    `) as any[];
    if (filas.length === 0) return { error: "Ese residente no tiene acceso creado." };

    const abc = "abcdefghjkmnpqrstuvwxyz23456789";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const clave = Array.from(bytes, (b) => abc[b % abc.length]).join("");

    await sql`UPDATE usuarios SET clave_hash = ${await hashearClave(clave)} WHERE id = ${filas[0].id}`;
    // Se cierran las sesiones abiertas con la clave anterior.
    await sql`DELETE FROM sesiones WHERE usuario_id = ${filas[0].id}`;

    revalidatePath("/maestros");
    return { success: true, usuario: filas[0].usuario, clave, message: "Contraseña regenerada." };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function quitarAccesoResidente(residenteId: number) {
  const bloqueo = await exigirGestion();
  if (bloqueo) return { error: bloqueo };

  try {
    const sql = getSql();
    await sql`DELETE FROM usuarios WHERE residente_id = ${residenteId}`;
    revalidatePath("/maestros");
    return { success: true, message: "Acceso eliminado." };
  } catch (error: any) {
    return { error: error.message };
  }
}

/** Accesos existentes, indexados por residente, para pintar el maestro. */
export async function getAccesosResidentes(): Promise<Record<number, string>> {
  try {
    if (await exigirGestion()) return {};
    const filas = (await getSql()`
      SELECT residente_id, usuario FROM usuarios
      WHERE rol = 'residente' AND residente_id IS NOT NULL
    `) as any[];

    const mapa: Record<number, string> = {};
    for (const f of filas) mapa[Number(f.residente_id)] = f.usuario;
    return mapa;
  } catch {
    return {};
  }
}

/** El residente cambia su propia contraseña. */
export async function cambiarMiClave(prevState: any, formData: FormData) {
  const sesion = await getSesionResidente();
  if (!sesion) return { error: "Sesión no válida." };

  const actual = String(formData.get("clave_actual") || "");
  const nueva = String(formData.get("clave_nueva") || "");
  const repetir = String(formData.get("clave_repetir") || "");

  const problema = validarClave(nueva, LARGO_CLAVE_INGRESO);
  if (problema) return { error: problema };
  if (nueva !== repetir) return { error: "Las contraseñas nuevas no coinciden." };

  try {
    const sql = getSql();
    const filas = (await sql`
      SELECT clave_hash FROM usuarios WHERE id = ${sesion.usuarioId} LIMIT 1
    `) as any[];

    if (!filas[0] || !(await verificarClave(actual, filas[0].clave_hash))) {
      return { error: "La contraseña actual es incorrecta." };
    }

    await sql`
      UPDATE usuarios SET clave_hash = ${await hashearClave(nueva)} WHERE id = ${sesion.usuarioId}
    `;
    return { success: true, message: "Contraseña actualizada." };
  } catch (error: any) {
    return { error: error.message };
  }
}

// ========== EQUIPOS AUTORIZADOS ==========
//
// Ata la aplicacion a las maquinas del puesto. No se maneja desde Maestros a
// proposito: si el supervisor pudiera dar de alta equipos con la clave de
// gestion, el control se diluye. Tiene su propia clave, separada de todo lo
// demas, que administra quien mantiene el sistema.

const COOKIE_EQUIPO = "equipo";
const CLAVE_EQUIPOS = "clave_equipos";
const CLAVE_INTENTOS = "intentos_equipos";
const CLAVE_EQUIPOS_INICIAL = "12345678";
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

export type Dispositivo = {
  id: string;
  nombre: string;
  creado_en: string;
  ultimo_uso: string | null;
  activo: boolean;
  /** true si es el equipo desde el que se esta mirando */
  esteEquipo: boolean;
};

async function idEquipoActual(): Promise<string> {
  return (await cookies()).get(COOKIE_EQUIPO)?.value || "";
}

/**
 * Valida la clave de equipos con limite de intentos.
 * Es una pantalla publica protegida solo por contraseña, asi que sin el limite
 * seria facil de probar por fuerza bruta.
 */
async function validarClaveEquipos(clave: string): Promise<string | null> {
  await asegurarDatosIniciales();
  const sql = getSql();

  const estado = (await sql`
    SELECT valor FROM configuracion WHERE clave = ${CLAVE_INTENTOS} LIMIT 1
  `) as any[];

  let intentos = 0;
  let bloqueadoHasta = 0;
  if (estado[0]?.valor) {
    try {
      const d = JSON.parse(estado[0].valor);
      intentos = Number(d.intentos) || 0;
      bloqueadoHasta = Number(d.hasta) || 0;
    } catch { /* valor corrupto: se reinicia */ }
  }

  if (bloqueadoHasta > Date.now()) {
    const min = Math.ceil((bloqueadoHasta - Date.now()) / 60000);
    return `Demasiados intentos fallidos. Esperá ${min} minuto${min > 1 ? "s" : ""}.`;
  }

  const cfg = (await sql`
    SELECT valor FROM configuracion WHERE clave = ${CLAVE_EQUIPOS} LIMIT 1
  `) as any[];

  const guardarIntentos = (n: number, hasta: number) => sql`
    INSERT INTO configuracion (clave, valor)
    VALUES (${CLAVE_INTENTOS}, ${JSON.stringify({ intentos: n, hasta })})
    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = NOW()
  `;

  if (!cfg[0] || !(await verificarClave(clave, cfg[0].valor))) {
    const nuevos = intentos + 1;
    if (nuevos >= MAX_INTENTOS) {
      await guardarIntentos(0, Date.now() + MINUTOS_BLOQUEO * 60000);
      return `Clave incorrecta. Se bloqueó el acceso por ${MINUTOS_BLOQUEO} minutos.`;
    }
    await guardarIntentos(nuevos, 0);
    return `Clave incorrecta. Te quedan ${MAX_INTENTOS - nuevos} intentos.`;
  }

  if (intentos > 0) await guardarIntentos(0, 0);
  return null;
}

async function listarDispositivos(): Promise<Dispositivo[]> {
  const actual = await idEquipoActual();
  const filas = (await getSql()`
    SELECT id, nombre, creado_en, ultimo_uso, activo
    FROM dispositivos ORDER BY activo DESC, creado_en DESC
  `) as any[];
  return filas.map((f) => ({ ...f, esteEquipo: f.id === actual })) as Dispositivo[];
}

/** Abre el panel: valida la clave y devuelve el estado actual. */
export async function abrirPanelEquipos(clave: string) {
  const error = await validarClaveEquipos(clave);
  if (error) return { error };

  try {
    const dispositivos = await listarDispositivos();
    return {
      success: true,
      dispositivos,
      esteEquipoAutorizado: dispositivos.some((d) => d.esteEquipo && d.activo),
      activos: dispositivos.filter((d) => d.activo).length,
    };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Da de alta el equipo desde el que se esta usando la pantalla. */
export async function autorizarEsteEquipo(prevState: any, formData: FormData) {
  const nombre = String(formData.get("nombre") || "").trim();
  const clave = String(formData.get("clave") || "");

  if (!nombre) return { error: "Poné un nombre para reconocer el equipo." };

  const error = await validarClaveEquipos(clave);
  if (error) return { error };

  try {
    const sql = getSql();
    const actual = await idEquipoActual();

    // Si este navegador ya tenia un equipo cargado, se renombra y reactiva en
    // lugar de duplicarlo.
    if (actual) {
      const existe = (await sql`SELECT 1 FROM dispositivos WHERE id = ${actual} LIMIT 1`) as any[];
      if (existe.length > 0) {
        await sql`
          UPDATE dispositivos SET nombre = ${nombre}, activo = TRUE, ultimo_uso = NOW()
          WHERE id = ${actual}
        `;
        return { success: true, message: `Equipo actualizado como "${nombre}".` };
      }
    }

    const id = generarId();
    await sql`
      INSERT INTO dispositivos (id, nombre, ultimo_uso, activo)
      VALUES (${id}, ${nombre}, NOW(), TRUE)
    `;
    (await cookies()).set(COOKIE_EQUIPO, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 365 * 24 * 3600,
    });

    return { success: true, message: `Este equipo quedó autorizado como "${nombre}".` };
  } catch (e: any) {
    return { error: e.message || "No se pudo autorizar el equipo." };
  }
}

export async function cambiarEstadoEquipo(id: string, activo: boolean, clave: string) {
  const error = await validarClaveEquipos(clave);
  if (error) return { error };

  try {
    const sql = getSql();

    if (!activo) {
      // Quedarse sin equipos activos apagaria el control y, peor, dejaria a la
      // guardia sin poder entrar desde ningun lado.
      const activos = (await sql`
        SELECT COUNT(*)::int AS n FROM dispositivos WHERE activo = TRUE
      `) as any[];
      const esActivo = (await sql`
        SELECT activo FROM dispositivos WHERE id = ${id} LIMIT 1
      `) as any[];

      if (esActivo[0]?.activo && activos[0]?.n <= 1) {
        return {
          error:
            "Es el único equipo autorizado. Si lo das de baja, nadie va a poder " +
            "entrar al puesto. Autorizá otro primero.",
        };
      }
    }

    await sql`UPDATE dispositivos SET activo = ${activo} WHERE id = ${id}`;
    return {
      success: true,
      message: activo ? "Equipo reactivado." : "Equipo dado de baja.",
      dispositivos: await listarDispositivos(),
    };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function cambiarClaveEquipos(prevState: any, formData: FormData) {
  const actual = String(formData.get("clave_actual") || "");
  const nueva = String(formData.get("clave_nueva") || "");
  const repetir = String(formData.get("clave_repetir") || "");

  const error = await validarClaveEquipos(actual);
  if (error) return { error };

  const problema = validarClave(nueva, LARGO_CLAVE_INGRESO);
  if (problema) return { error: problema };
  if (nueva !== repetir) return { error: "Las contraseñas nuevas no coinciden." };

  try {
    await getSql()`
      UPDATE configuracion SET valor = ${await hashearClave(nueva)}, actualizado_en = NOW()
      WHERE clave = ${CLAVE_EQUIPOS}
    `;
    return { success: true, message: "Clave de equipos actualizada." };
  } catch (e: any) {
    return { error: e.message };
  }
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
