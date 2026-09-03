"use server";

import { revalidatePath } from "next/cache";
import { ensureTables, getSql } from "@/lib/db";
import { exigirGestion } from "@/app/actions-auth";

// ========== TYPES ==========

export type Residente = {
  id: number;
  nombre: string;
  apellido: string;
  lote: string;
  telefono: string;
  dni: string;
  rol: string;
  foto_url: string;
  created_at: string;
};

export type Autorizado = {
  id: number;
  nombre: string;
  apellido: string;
  dni: string;
  tipo: string;
  observaciones: string;
  patente: string;
  residente_id: number;
  residente_nombre?: string;
  lote: string;
  fecha_expiracion: string;
  autorizado: boolean;
  un_solo_uso: boolean;
  usada: boolean;
  link_token: string;
  foto_url: string;
  created_at: string;
};

export type Registro = {
  id: number;
  nombre: string;
  apellido: string;
  dni: string;
  tipo: string;
  subtipo: string;
  vehiculo_tipo: string;
  patente: string;
  residente_nombre: string;
  lote_destino: string;
  observaciones: string;
  es_manual: boolean;
  motivo_manual: string;
  autorizado_por: string;
  autorizacion_medio: string;
  operador_id: number | null;
  operador_nombre: string;
  es_entrada: boolean;
  foto_url: string;
  fecha_hora: string;
};

/**
 * Estado de autorizacion de una persona frente al barrio.
 *  residente     -> vive en el barrio
 *  permanente    -> esta en el maestro de autorizados
 *  temporal      -> invitacion confirmada por el residente, todavia vigente
 *  pendiente     -> invitacion creada pero aun no confirmada por el residente
 *  usada         -> invitacion de unica vez ya consumida
 *  vencida       -> invitacion con fecha de expiracion pasada
 *  previo        -> ya ingreso antes, tenemos sus datos, pero no tiene permiso vigente
 *  no_registrado -> no existe en ninguna tabla
 */
export type EstadoAutorizacion =
  | "residente"
  | "permanente"
  | "temporal"
  | "pendiente"
  | "usada"
  | "vencida"
  | "previo"
  | "no_registrado";

export type PersonaEncontrada = {
  nombre: string;
  apellido: string;
  dni: string;
  tipo: string;
  lote: string;
  patente: string;
  observaciones: string;
  residente_nombre: string;
  foto_url: string;
};

export type ResultadoBusqueda = {
  persona: PersonaEncontrada | null;
  estado: EstadoAutorizacion;
  autorizado: boolean;
  ultimoRegistro: Registro | null;
  ultimaEntrada: Registro | null;
  /** Lotes de la ultima entrada. Se precargan y se pueden modificar. */
  lotesUltimaEntrada: string[];
  /** Lotes del ultimo movimiento, sea entrada o salida. */
  lotesUltimoRegistro: string[];
  /** Apellidos de los residentes de esos lotes, para mostrarlos en el preview. */
  apellidosDeLotes: Record<string, string>;
  /** Rubro de proveedor usado la ultima vez. */
  subtipoPrevio: string;
};

// ========== IDENTIDAD (tabla personas) ==========

export type Persona = {
  dni: string;
  nombre: string;
  apellido: string;
  foto_url: string;
  actualizado_motivo: string | null;
  actualizado_en: string;
};

/**
 * Devuelve la identidad vigente de un DNI, o null si nunca se registro.
 */
async function getPersona(sql: ReturnType<typeof getSql>, dni: string) {
  const filas = (await sql`
    SELECT dni, nombre, apellido, foto_url, actualizado_motivo, actualizado_en
    FROM personas WHERE dni = ${dni} LIMIT 1
  `) as any[];
  return (filas[0] as Persona) || null;
}

/**
 * Crea o actualiza la identidad de un DNI.
 *
 * Reglas:
 *  - Si la persona no existe, se crea con los datos recibidos.
 *  - Si ya existe y `sobrescribir` es false (caso normal), NO se pisan
 *    nombre ni apellido. La foto solo se completa si estaba vacia.
 *  - Si `sobrescribir` es true (carga manual con motivo), se reemplazan
 *    nombre, apellido y foto, y se deja asentado el motivo del cambio.
 *
 * Asi se garantiza que un DNI tenga una sola foto y un solo nombre.
 */
async function upsertPersona(
  sql: ReturnType<typeof getSql>,
  datos: { dni: string; nombre: string; apellido: string; foto_url?: string },
  opciones: { sobrescribir?: boolean; motivo?: string } = {}
) {
  const { dni, nombre, apellido } = datos;
  const foto = datos.foto_url?.trim() || null;
  if (!dni || !nombre || !apellido) return;

  if (opciones.sobrescribir) {
    await sql`
      INSERT INTO personas (dni, nombre, apellido, foto_url, actualizado_motivo, actualizado_en)
      VALUES (${dni}, ${nombre}, ${apellido}, ${foto}, ${opciones.motivo || null}, CURRENT_TIMESTAMP)
      ON CONFLICT (dni) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        apellido = EXCLUDED.apellido,
        foto_url = COALESCE(EXCLUDED.foto_url, personas.foto_url),
        -- Si no viene motivo (por ejemplo, solo se reemplazo la foto),
        -- se conserva el ultimo motivo registrado.
        actualizado_motivo = COALESCE(EXCLUDED.actualizado_motivo, personas.actualizado_motivo),
        actualizado_en = CURRENT_TIMESTAMP
    `;
    return;
  }

  await sql`
    INSERT INTO personas (dni, nombre, apellido, foto_url)
    VALUES (${dni}, ${nombre}, ${apellido}, ${foto})
    ON CONFLICT (dni) DO UPDATE SET
      foto_url = COALESCE(NULLIF(personas.foto_url, ''), EXCLUDED.foto_url)
  `;
}

// ========== IMPORTACION DESDE PLANILLA ==========

export type FilaImportacion = {
  dni: string;
  nombre: string;
  apellido: string;
  lote?: string;
  patente?: string;
  telefono?: string;
  observaciones?: string;
};

export type ResultadoImportacion = {
  success?: boolean;
  error?: string;
  creados: number;
  actualizados: number;
  omitidos: number;
  detalleOmitidos: string[];
};

/**
 * Alta masiva de personas desde una planilla.
 *
 * No pisa identidades ya cargadas salvo que se pida expresamente: la foto y
 * el nombre vigentes de alguien que ya ingreso al barrio valen mas que lo que
 * diga un Excel viejo.
 */
export async function importarPersonas(
  filas: FilaImportacion[],
  opciones: { actualizarExistentes?: boolean } = {}
): Promise<ResultadoImportacion> {
  const res: ResultadoImportacion = { creados: 0, actualizados: 0, omitidos: 0, detalleOmitidos: [] };
  if (!filas?.length) return { ...res, error: "No hay filas para importar." };

  try {
    await ensureTables();
    const sql = getSql();

    for (const f of filas) {
      const dni = String(f.dni || "").trim();
      const nombre = String(f.nombre || "").trim();
      const apellido = String(f.apellido || "").trim();

      if (!dni || (!nombre && !apellido)) {
        res.omitidos++;
        res.detalleOmitidos.push(`${dni || "(sin DNI)"} — faltan datos`);
        continue;
      }

      const existente = await getPersona(sql, dni);

      if (existente && !opciones.actualizarExistentes) {
        res.omitidos++;
        res.detalleOmitidos.push(`${dni} — ya existe como ${existente.nombre} ${existente.apellido}`);
        continue;
      }

      await upsertPersona(
        sql,
        { dni, nombre, apellido },
        existente ? { sobrescribir: true, motivo: "Importación desde planilla" } : {}
      );

      if (existente) res.actualizados++;
      else res.creados++;
    }

    revalidatePath("/maestros");
    revalidatePath("/");
    return { ...res, success: true };
  } catch (error: any) {
    return { ...res, error: error.message || "Error al importar personas." };
  }
}

/**
 * Alta masiva de autorizados permanentes desde una planilla.
 * Crea la identidad si el DNI todavia no existe, asi el archivo de autorizados
 * se puede importar aunque esa persona no figure en la planilla de ingresos.
 */
export async function importarAutorizados(filas: FilaImportacion[]): Promise<ResultadoImportacion> {
  const res: ResultadoImportacion = { creados: 0, actualizados: 0, omitidos: 0, detalleOmitidos: [] };
  if (!filas?.length) return { ...res, error: "No hay filas para importar." };

  try {
    await ensureTables();
    const sql = getSql();

    for (const f of filas) {
      const dni = String(f.dni || "").trim();
      const nombre = String(f.nombre || "").trim();
      const apellido = String(f.apellido || "").trim();
      const lote = String(f.lote || "").trim();
      const patente = String(f.patente || "").trim().toUpperCase();
      const observaciones = String(f.observaciones || "").trim();

      if (!dni || (!nombre && !apellido)) {
        res.omitidos++;
        res.detalleOmitidos.push(`${dni || "(sin DNI)"} — faltan datos`);
        continue;
      }
      if (!lote) {
        res.omitidos++;
        res.detalleOmitidos.push(`${dni} — sin lote`);
        continue;
      }

      const esResidente = (await sql`
        SELECT 1 FROM residentes WHERE dni = ${dni} LIMIT 1
      `) as any[];
      if (esResidente.length > 0) {
        res.omitidos++;
        res.detalleOmitidos.push(`${dni} — es residente, ya tiene ingreso`);
        continue;
      }

      // La identidad se crea si falta, pero no se pisa si ya existe.
      await upsertPersona(sql, { dni, nombre, apellido });
      const identidad = await getPersona(sql, dni);

      const yaTenia = (await sql`
        SELECT 1 FROM autorizados WHERE dni = ${dni} AND usada = FALSE LIMIT 1
      `) as any[];

      await sql`DELETE FROM autorizados WHERE dni = ${dni}`;
      await sql`
        INSERT INTO autorizados
          (nombre, apellido, dni, tipo, observaciones, patente, lote,
           autorizado, un_solo_uso, usada, foto_url)
        VALUES
          (${identidad?.nombre || nombre}, ${identidad?.apellido || apellido}, ${dni},
           'permanente', ${observaciones}, ${patente || null}, ${lote},
           TRUE, FALSE, FALSE, ${identidad?.foto_url || null})
      `;

      if (yaTenia.length > 0) res.actualizados++;
      else res.creados++;
    }

    revalidatePath("/maestros");
    revalidatePath("/");
    return { ...res, success: true };
  } catch (error: any) {
    return { ...res, error: error.message || "Error al importar autorizados." };
  }
}

/** DNI que ya existen en `personas`, para avisar en la vista previa. */
export async function dnisExistentes(dnis: string[]): Promise<string[]> {
  const limpios = (dnis || []).map((d) => String(d).trim()).filter(Boolean);
  if (limpios.length === 0) return [];
  try {
    await ensureTables();
    const sql = getSql();
    const filas = (await sql`
      SELECT dni FROM personas WHERE dni = ANY(${limpios})
    `) as any[];
    return filas.map((f) => f.dni as string);
  } catch {
    return [];
  }
}

// ========== OPERADORES (vigiladores) ==========

export type Operador = {
  id: number;
  nombre: string;
  apellido: string;
  dni: string;
  turno: string;
  activo: boolean;
};

export async function getOperadores(): Promise<Operador[]> {
  try {
    await ensureTables();
    const sql = getSql();
    return (await sql`
      SELECT id, nombre, apellido, dni, turno, activo
      FROM operadores
      ORDER BY activo DESC, apellido, nombre
    `) as unknown as Operador[];
  } catch (error) {
    console.error("Error al obtener operadores:", error);
    return [];
  }
}

/**
 * Ultimo operador que registro una entrada o una salida.
 *
 * Es lo que se precarga en la pantalla de accesos: al cambiar el turno, el
 * primer movimiento que carga el operador entrante deja el desplegable
 * apuntando a el para todos los siguientes, sin tener que configurar nada.
 *
 * Devuelve null si nunca se registro nada o si ese operador ya no esta activo.
 */
export async function getUltimoOperadorUsado(): Promise<number | null> {
  try {
    await ensureTables();
    const sql = getSql();
    const filas = (await sql`
      SELECT r.operador_id
      FROM registros r
      JOIN operadores o ON o.id = r.operador_id
      WHERE r.operador_id IS NOT NULL AND o.activo = TRUE
      ORDER BY r.fecha_hora DESC
      LIMIT 1
    `) as any[];
    return filas[0]?.operador_id ?? null;
  } catch {
    return null;
  }
}

export async function createOperador(prevState: any, formData: FormData) {
  { const b = await exigirGestion(); if (b) return { error: b }; }
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const turno = String(formData.get("turno") || "").trim();

  if (!nombre || !apellido || !dni) {
    return { error: "Nombre, apellido y DNI son obligatorios." };
  }

  try {
    await ensureTables();
    const sql = getSql();

    const existe = (await sql`SELECT 1 FROM operadores WHERE dni = ${dni} LIMIT 1`) as any[];
    if (existe.length > 0) {
      return { error: `Ya hay un operador cargado con el DNI ${dni}.` };
    }

    await sql`
      INSERT INTO operadores (nombre, apellido, dni, turno, activo)
      VALUES (${nombre}, ${apellido}, ${dni}, ${turno || null}, TRUE)
    `;

    revalidatePath("/maestros");
    revalidatePath("/");
    return { success: true, message: "Operador guardado correctamente." };
  } catch (error: any) {
    return { error: error.message || "Error al guardar operador." };
  }
}

export async function updateOperador(id: number, prevState: any, formData: FormData) {
  { const b = await exigirGestion(); if (b) return { error: b }; }
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const turno = String(formData.get("turno") || "").trim();
  const activo = formData.get("activo") !== "false";

  if (!nombre || !apellido || !dni) {
    return { error: "Nombre, apellido y DNI son obligatorios." };
  }

  try {
    await ensureTables();
    const sql = getSql();

    const otro = (await sql`
      SELECT id FROM operadores WHERE dni = ${dni} AND id <> ${id} LIMIT 1
    `) as any[];
    if (otro.length > 0) {
      return { error: `Ya hay otro operador con el DNI ${dni}.` };
    }

    await sql`
      UPDATE operadores SET nombre=${nombre}, apellido=${apellido}, dni=${dni},
        turno=${turno || null}, activo=${activo}
      WHERE id = ${id}
    `;

    revalidatePath("/maestros");
    revalidatePath("/");
    return { success: true, message: "Operador actualizado." };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function deleteOperador(id: number) {
  try {
    await ensureTables();
    const sql = getSql();
    // No se borra: los movimientos ya registrados lo referencian. Se desactiva.
    await sql`UPDATE operadores SET activo = FALSE WHERE id = ${id}`;
    revalidatePath("/maestros");
    revalidatePath("/");
    return { success: true, message: "Operador dado de baja." };
  } catch (error: any) {
    return { error: error.message };
  }
}

// ========== ESTADO DE AUTORIZACION ==========

/**
 * Unica fuente de verdad para decidir el estado de una persona.
 * La usan la busqueda por DNI, el buscador de la pantalla de autorizados
 * y la validacion del servidor al registrar una entrada.
 */
function resolverEstado(datos: {
  esResidente: boolean;
  auth: { tipo: string; autorizado: boolean; usada: boolean; fecha_expiracion: any } | null;
  tieneRegistro: boolean;
}): { estado: EstadoAutorizacion; autorizado: boolean } {
  if (datos.esResidente) return { estado: "residente", autorizado: true };

  const a = datos.auth;
  if (a) {
    if (a.usada) return { estado: "usada", autorizado: false };
    if (!a.autorizado) return { estado: "pendiente", autorizado: false };

    if (a.fecha_expiracion) {
      const hoy = new Date();
      const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      if (new Date(a.fecha_expiracion) < limite) return { estado: "vencida", autorizado: false };
    }

    if (a.tipo === "permanente") return { estado: "permanente", autorizado: true };
    return { estado: "temporal", autorizado: true };
  }

  if (datos.tieneRegistro) return { estado: "previo", autorizado: false };
  return { estado: "no_registrado", autorizado: false };
}

// ========== HELPERS ==========

/**
 * Un DNI identifica a una unica persona. No se permite cargar el mismo DNI
 * en residentes y en autorizados a la vez, ni duplicarlo dentro de autorizados.
 *
 * IMPORTANTE: la tabla `registros` NO se valida aca. Registros es la bitacora
 * de ingresos: que alguien haya entrado antes es justamente el caso normal para
 * despues promoverlo a autorizado permanente.
 */
async function dniYaRegistrado(dni: string, opciones: { ignorarAutorizadoId?: number } = {}) {
  const sql = getSql();

  const enResidentes = (await sql`
    SELECT 1 FROM residentes WHERE dni = ${dni} LIMIT 1
  `) as any[];
  if (enResidentes.length > 0) return "residentes";

  const enAutorizados = (await sql`
    SELECT id FROM autorizados
    WHERE dni = ${dni} AND usada = FALSE
    LIMIT 1
  `) as any[];
  if (enAutorizados.length > 0 && enAutorizados[0].id !== opciones.ignorarAutorizadoId) {
    return "autorizados";
  }

  return null;
}

// ========== RESIDENTES ==========

export async function getResidentes(): Promise<Residente[]> {
  try {
    await ensureTables();
    const sql = getSql();
    return (await sql`
      SELECT id, nombre, apellido, lote, telefono, dni, rol, foto_url, created_at
      FROM residentes
      ORDER BY apellido, nombre
    `) as unknown as Residente[];
  } catch (error) {
    console.error("Error al obtener residentes:", error);
    return [];
  }
}

export async function createResidente(prevState: any, formData: FormData) {
  { const b = await exigirGestion(); if (b) return { error: b }; }
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const lote = String(formData.get("lote") || "").trim();
  const telefono = String(formData.get("telefono") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const rol = String(formData.get("rol") || "propietario").trim();
  const foto_url = String(formData.get("foto_url") || "").trim();

  if (!nombre || !apellido || !lote || !dni) {
    return { error: "Nombre, apellido, lote y DNI son obligatorios." };
  }

  try {
    await ensureTables();
    const sql = getSql();

    const duplicado = await dniYaRegistrado(dni);
    if (duplicado === "autorizados") {
      return { error: `El DNI ${dni} ya tiene una autorización cargada. Eliminala antes de darlo de alta como residente.` };
    }

    await sql`
      INSERT INTO residentes (nombre, apellido, lote, telefono, dni, rol, foto_url)
      VALUES (${nombre}, ${apellido}, ${lote}, ${telefono}, ${dni}, ${rol}, ${foto_url || null})
      ON CONFLICT (dni) DO UPDATE SET
        nombre = ${nombre}, apellido = ${apellido}, lote = ${lote},
        telefono = ${telefono}, rol = ${rol},
        foto_url = COALESCE(${foto_url || null}, residentes.foto_url)
    `;

    await upsertPersona(sql, { dni, nombre, apellido, foto_url }, { sobrescribir: true, motivo: "Alta/edición de residente" });

    revalidatePath("/maestros");
    revalidatePath("/");
    return { success: true, message: "Residente guardado correctamente." };
  } catch (error: any) {
    return { error: error.message || "Error al guardar residente." };
  }
}

export async function updateResidente(id: number, prevState: any, formData: FormData) {
  { const b = await exigirGestion(); if (b) return { error: b }; }
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const lote = String(formData.get("lote") || "").trim();
  const telefono = String(formData.get("telefono") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const rol = String(formData.get("rol") || "propietario").trim();
  const foto_url = String(formData.get("foto_url") || "").trim();

  if (!nombre || !apellido || !lote || !dni) {
    return { error: "Nombre, apellido, lote y DNI son obligatorios." };
  }

  try {
    await ensureTables();
    const sql = getSql();
    await sql`
      UPDATE residentes SET nombre=${nombre}, apellido=${apellido}, lote=${lote},
        telefono=${telefono}, dni=${dni}, rol=${rol},
        foto_url=${foto_url || null}
      WHERE id = ${id}
    `;

    await upsertPersona(sql, { dni, nombre, apellido, foto_url }, { sobrescribir: true, motivo: "Edición de residente" });

    revalidatePath("/maestros");
    revalidatePath("/");
    return { success: true, message: "Residente actualizado." };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function deleteResidente(id: number) {
  try {
    await ensureTables();
    const sql = getSql();
    await sql`DELETE FROM residentes WHERE id = ${id}`;
    revalidatePath("/maestros");
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

// ========== AUTORIZADOS ==========

export async function getAutorizados(): Promise<Autorizado[]> {
  try {
    await ensureTables();
    const sql = getSql();
    return (await sql`
      SELECT a.id, a.nombre, a.apellido, a.dni, a.tipo, a.observaciones, a.patente,
             a.residente_id, a.lote, a.fecha_expiracion, a.autorizado,
             a.un_solo_uso, a.usada, a.link_token, a.foto_url, a.created_at,
             COALESCE(a.residente_nombre, r.nombre || ' ' || r.apellido) AS residente_nombre
      FROM autorizados a
      LEFT JOIN residentes r ON r.id = a.residente_id
      ORDER BY a.usada ASC, a.apellido, a.nombre
    `) as unknown as Autorizado[];
  } catch (error) {
    console.error("Error al obtener autorizados:", error);
    return [];
  }
}

/**
 * Otorga autorizacion a una o varias personas que ya existen en el sistema.
 *
 * No se cargan nombre/apellido/foto a mano: se toman de la identidad que quedo
 * grabada cuando la persona ingreso por primera vez.
 *
 *   tipo = 'permanente' -> queda habilitada indefinidamente.
 *   tipo = 'temporal'   -> habilitada por UNICA VEZ. Al registrarse la entrada
 *                          se consume y la persona vuelve a quedar sin permiso.
 *
 * Reemplaza cualquier autorizacion anterior de los mismos DNI.
 */
export async function autorizarPersonas(prevState: any, formData: FormData) {
  { const b = await exigirGestion(); if (b) return { error: b }; }
  const dnis = formData
    .getAll("dni")
    .map((d) => String(d).trim())
    .filter(Boolean);

  const tipo = String(formData.get("tipo") || "").trim();
  const lote = String(formData.get("lote") || "").trim();
  const observaciones = String(formData.get("observaciones") || "").trim();

  if (dnis.length === 0) return { error: "No hay personas en la lista." };
  if (tipo !== "permanente" && tipo !== "temporal") {
    return { error: "Tipo de autorización inválido." };
  }
  if (!lote) return { error: "Indicá el lote que autoriza el ingreso." };

  const esTemporal = tipo === "temporal";

  try {
    await ensureTables();
    const sql = getSql();

    const otorgados: string[] = [];
    const omitidos: string[] = [];

    for (const dni of dnis) {
      const residente = (await sql`
        SELECT 1 FROM residentes WHERE dni = ${dni} LIMIT 1
      `) as any[];
      if (residente.length > 0) {
        omitidos.push(`${dni} (es residente)`);
        continue;
      }

      const identidad = await getPersona(sql, dni);
      if (!identidad) {
        omitidos.push(`${dni} (sin datos)`);
        continue;
      }

      const previa = (await sql`
        SELECT patente FROM autorizados WHERE dni = ${dni}
        ORDER BY usada ASC, created_at DESC LIMIT 1
      `) as any[];

      const ultimoRegistro = (await sql`
        SELECT patente FROM registros WHERE dni = ${dni}
        ORDER BY fecha_hora DESC LIMIT 1
      `) as any[];

      const patente = previa[0]?.patente || ultimoRegistro[0]?.patente || null;

      await sql`DELETE FROM autorizados WHERE dni = ${dni}`;

      await sql`
        INSERT INTO autorizados
          (nombre, apellido, dni, tipo, observaciones, patente, lote,
           autorizado, un_solo_uso, usada, foto_url)
        VALUES
          (${identidad.nombre}, ${identidad.apellido}, ${dni}, ${tipo}, ${observaciones},
           ${patente}, ${lote},
           TRUE, ${esTemporal}, FALSE, ${identidad.foto_url || null})
      `;

      otorgados.push(`${identidad.nombre} ${identidad.apellido}`);
    }

    revalidatePath("/maestros");
    revalidatePath("/");

    if (otorgados.length === 0) {
      return { error: `No se pudo autorizar a nadie. Omitidos: ${omitidos.join(", ")}.` };
    }

    const etiqueta = esTemporal ? "autorización temporal (única vez)" : "autorización permanente";
    let message = `Se otorgó ${etiqueta} a ${otorgados.length} persona${otorgados.length > 1 ? "s" : ""} del lote ${lote}.`;
    if (omitidos.length > 0) message += ` Omitidos: ${omitidos.join(", ")}.`;

    return { success: true, message };
  } catch (error: any) {
    return { error: error.message || "Error al otorgar la autorización." };
  }
}

/**
 * Busca personas ya registradas por DNI, nombre o apellido, con su estado actual.
 * Se usa para armar la lista de autorizaciones masivas.
 */
export async function buscarPersonas(consulta: string) {
  const q = String(consulta || "").trim();
  if (q.length < 2) return [];

  try {
    await ensureTables();
    const sql = getSql();
    const patron = `%${q}%`;

    const filas = (await sql`
      SELECT p.dni, p.nombre, p.apellido, p.foto_url,
             (r.dni IS NOT NULL) AS es_residente,
             a.tipo AS auth_tipo, a.autorizado AS auth_autorizado,
             a.usada AS auth_usada, a.un_solo_uso AS auth_un_solo_uso,
             a.fecha_expiracion AS auth_expira, a.lote AS auth_lote,
             ur.lote_destino AS lote_ultimo
      FROM personas p
      LEFT JOIN residentes r ON r.dni = p.dni
      LEFT JOIN LATERAL (
        SELECT tipo, autorizado, usada, un_solo_uso, fecha_expiracion, lote
        FROM autorizados WHERE dni = p.dni
        ORDER BY usada ASC, created_at DESC LIMIT 1
      ) a ON TRUE
      LEFT JOIN LATERAL (
        SELECT lote_destino FROM registros WHERE dni = p.dni
        ORDER BY fecha_hora DESC LIMIT 1
      ) ur ON TRUE
      WHERE p.dni ILIKE ${patron}
         OR p.apellido ILIKE ${patron}
         OR p.nombre ILIKE ${patron}
      ORDER BY p.apellido, p.nombre
      LIMIT 40
    `) as any[];

    return filas.map((f) => ({
      dni: f.dni as string,
      nombre: f.nombre as string,
      apellido: f.apellido as string,
      foto_url: (f.foto_url || "") as string,
      lote: (f.auth_lote || f.lote_ultimo || "") as string,
      estado: resolverEstado({
        esResidente: Boolean(f.es_residente),
        auth: f.auth_tipo
          ? {
              tipo: f.auth_tipo,
              autorizado: f.auth_autorizado,
              usada: f.auth_usada,
              fecha_expiracion: f.auth_expira,
            }
          : null,
        tieneRegistro: Boolean(f.lote_ultimo),
      }).estado,
    }));
  } catch (error) {
    console.error("Error al buscar personas:", error);
    return [];
  }
}

/**
 * Quita la autorizacion de un DNI. Los registros de ingreso NO se tocan:
 * la persona sigue existiendo en la bitacora, solo pierde el permiso.
 */
export async function revocarAutorizacion(dni: string) {
  try {
    await ensureTables();
    const sql = getSql();
    await sql`DELETE FROM autorizados WHERE dni = ${dni}`;
    revalidatePath("/maestros");
    revalidatePath("/");
    return { success: true, message: "Autorización revocada." };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function deleteAutorizado(id: number) {
  try {
    await ensureTables();
    const sql = getSql();
    await sql`DELETE FROM autorizados WHERE id = ${id}`;
    revalidatePath("/maestros");
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}


// ========== BUSQUEDA DE PERSONA ==========

/**
 * Resuelve el estado de una persona a partir del DNI.
 *
 * Estrategia (segun lo pedido):
 *   1. Siempre se trae el ultimo registro de la bitacora -> datos de la persona.
 *   2. Despues se consulta residentes / autorizados -> solo define el estado (badge).
 *
 * De esta forma una persona con ingresos previos siempre muestra sus datos,
 * tenga o no una autorizacion vigente.
 */
export async function searchPersona(dni: string): Promise<ResultadoBusqueda> {
  const vacio: ResultadoBusqueda = {
    persona: null,
    estado: "no_registrado",
    autorizado: false,
    ultimoRegistro: null,
    ultimaEntrada: null,
    lotesUltimaEntrada: [],
    lotesUltimoRegistro: [],
    apellidosDeLotes: {},
    subtipoPrevio: "",
  };

  const dniLimpio = String(dni || "").trim();
  if (!dniLimpio) return vacio;

  try {
    await ensureTables();
    const sql = getSql();

    const [registros, entradas, residentes, autorizaciones, identidades] = await Promise.all([
      sql`
        SELECT * FROM registros
        WHERE dni = ${dniLimpio}
        ORDER BY fecha_hora DESC
        LIMIT 1
      ` as unknown as Promise<any[]>,
      sql`
        SELECT * FROM registros
        WHERE dni = ${dniLimpio} AND es_entrada = TRUE
        ORDER BY fecha_hora DESC
        LIMIT 1
      ` as unknown as Promise<any[]>,
      sql`
        SELECT nombre, apellido, dni, lote, foto_url, rol
        FROM residentes WHERE dni = ${dniLimpio} LIMIT 1
      ` as unknown as Promise<any[]>,
      sql`
        SELECT a.id, a.nombre, a.apellido, a.dni, a.tipo, a.observaciones, a.patente, a.lote,
               a.autorizado, a.un_solo_uso, a.usada, a.fecha_expiracion, a.foto_url,
               COALESCE(a.residente_nombre, r.nombre || ' ' || r.apellido) AS residente_nombre
        FROM autorizados a
        LEFT JOIN residentes r ON r.id = a.residente_id
        WHERE a.dni = ${dniLimpio}
        ORDER BY a.usada ASC, a.created_at DESC
        LIMIT 1
      ` as unknown as Promise<any[]>,
      sql`
        SELECT dni, nombre, apellido, foto_url
        FROM personas WHERE dni = ${dniLimpio} LIMIT 1
      ` as unknown as Promise<any[]>,
    ]);

    const ultimoRegistro = registros[0] || null;
    const ultimaEntrada = entradas[0] || null;
    const residente = residentes[0] || null;
    const auth = autorizaciones[0] || null;
    const identidad = identidades[0] || null;

    if (!ultimoRegistro && !residente && !auth && !identidad) return vacio;

    // --- Identidad: `personas` es la fuente unica de nombre, apellido y foto.
    // El resto de los campos (lote, patente, observaciones) si salen del
    // maestro o del ultimo movimiento, porque pueden cambiar en cada ingreso.
    const persona: PersonaEncontrada = {
      nombre: identidad?.nombre || residente?.nombre || auth?.nombre || ultimoRegistro?.nombre || "",
      apellido: identidad?.apellido || residente?.apellido || auth?.apellido || ultimoRegistro?.apellido || "",
      dni: dniLimpio,
      tipo: residente ? "residente" : auth?.tipo || ultimoRegistro?.tipo || "visita",
      lote: auth?.lote || residente?.lote || ultimoRegistro?.lote_destino || "",
      patente: ultimoRegistro?.patente || auth?.patente || "",
      observaciones: auth?.observaciones || ultimoRegistro?.observaciones || "",
      residente_nombre: auth?.residente_nombre || ultimoRegistro?.residente_nombre || "",
      foto_url: identidad?.foto_url || residente?.foto_url || auth?.foto_url || ultimoRegistro?.foto_url || "",
    };

    const { estado, autorizado } = resolverEstado({
      esResidente: Boolean(residente),
      auth,
      tieneRegistro: Boolean(ultimoRegistro),
    });

    // Lotes de cada movimiento. Los de la ultima entrada precargan la lista de
    // un proveedor que vuelve a anunciarse en los mismos lotes; los del ultimo
    // movimiento se muestran en el preview.
    const lotesDe = async (reg: any): Promise<string[]> => {
      if (!reg?.id) return [];
      const filas = (await sql`
        SELECT lote FROM registro_lotes
        WHERE registro_id = ${reg.id}
        ORDER BY id
      `) as any[];
      const l = filas.map((f) => f.lote as string);
      return l.length > 0 ? l : reg.lote_destino ? [reg.lote_destino] : [];
    };

    const [lotesUltimaEntrada, lotesUltimoRegistro] = await Promise.all([
      lotesDe(ultimaEntrada),
      ultimaEntrada?.id === ultimoRegistro?.id ? lotesDe(ultimaEntrada) : lotesDe(ultimoRegistro),
    ]);

    const apellidosDeLotes = await apellidosPorLote(sql, [
      ...lotesUltimaEntrada,
      ...lotesUltimoRegistro,
    ]);

    return {
      persona,
      estado,
      autorizado,
      ultimoRegistro,
      ultimaEntrada,
      lotesUltimaEntrada,
      lotesUltimoRegistro,
      apellidosDeLotes,
      subtipoPrevio: ultimaEntrada?.subtipo || ultimoRegistro?.subtipo || "",
    };
  } catch (error) {
    console.error("Error al buscar persona:", error);
    return vacio;
  }
}

// ========== REGISTROS (ENTRADAS / SALIDAS) ==========

/**
 * Determina si un DNI tiene autorizacion vigente para ingresar.
 * Se usa tanto para el badge de la pantalla como para validar en el servidor,
 * asi que la UI no puede saltearse el control.
 */
async function tieneAutorizacionVigente(sql: ReturnType<typeof getSql>, dni: string) {
  const residente = (await sql`
    SELECT 1 FROM residentes WHERE dni = ${dni} LIMIT 1
  `) as any[];

  const filas = (await sql`
    SELECT tipo, autorizado, usada, fecha_expiracion
    FROM autorizados WHERE dni = ${dni}
    ORDER BY usada ASC, created_at DESC LIMIT 1
  `) as any[];

  return resolverEstado({
    esResidente: residente.length > 0,
    auth: filas[0] || null,
    tieneRegistro: false,
  }).autorizado;
}

/**
 * Apellidos de los residentes de cada lote, separados por " / ".
 *
 * Sirve para que el operador confirme que cargo el lote correcto: al escribir
 * el numero ve de quien es. Un lote puede tener varios residentes (propietario
 * e inquilino, familias distintas), por eso se agregan todos.
 *
 * Se consultan todos los lotes de una sola vez para no hacer una llamada por lote.
 */
async function apellidosPorLote(
  sql: ReturnType<typeof getSql>,
  lotes: string[]
): Promise<Record<string, string>> {
  const limpios = Array.from(
    new Set((lotes || []).map((l) => String(l).trim()).filter(Boolean))
  );
  if (limpios.length === 0) return {};

  const filas = (await sql`
    SELECT lower(lote) AS clave,
           string_agg(DISTINCT apellido, ' / ' ORDER BY apellido) AS apellidos
    FROM residentes
    WHERE lower(lote) = ANY(${limpios.map((l) => l.toLowerCase())})
    GROUP BY lower(lote)
  `) as any[];

  const porClave = new Map(filas.map((f) => [f.clave as string, f.apellidos as string]));

  // Se devuelve con el lote tal como lo escribio el operador.
  const salida: Record<string, string> = {};
  for (const l of limpios) salida[l] = porClave.get(l.toLowerCase()) || "";
  return salida;
}

export async function getApellidosPorLote(lotes: string[]): Promise<Record<string, string>> {
  try {
    await ensureTables();
    return await apellidosPorLote(getSql(), lotes);
  } catch (error) {
    console.error("Error al obtener apellidos por lote:", error);
    return {};
  }
}



/** Residentes de un lote, para poder pedirles autorizacion por telefono o WhatsApp. */
export async function getResidentesDeLote(lote: string) {
  const limpio = String(lote || "").trim();
  if (!limpio) return [];
  try {
    await ensureTables();
    const sql = getSql();
    return (await sql`
      SELECT nombre, apellido, telefono, rol
      FROM residentes
      WHERE lower(lote) = lower(${limpio})
      ORDER BY rol, apellido
    `) as any[];
  } catch {
    return [];
  }
}

export async function checkDniCargadoReciente(dni: string) {
  try {
    await ensureTables();
    const sql = getSql();
    const reciente = (await sql`
      SELECT id FROM registros
      WHERE dni = ${dni}
        AND es_entrada = TRUE
        AND fecha_hora > NOW() - INTERVAL '5 minutes'
      LIMIT 1
    `) as any[];
    return reciente.length > 0;
  } catch {
    return false;
  }
}

export async function registrarMovimiento(prevState: any, formData: FormData) {
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const tipo = String(formData.get("tipo") || "visita").trim();
  const subtipo = String(formData.get("subtipo") || "").trim();
  const vehiculo_tipo = String(formData.get("vehiculo_tipo") || "").trim();
  const patente = String(formData.get("patente") || "").trim().toUpperCase();
  const residente_nombre = String(formData.get("residente_nombre") || "").trim();
  const observaciones = String(formData.get("observaciones") || "").trim();
  const es_manual = formData.get("es_manual") === "true";
  const motivo_manual = String(formData.get("motivo_manual") || "").trim();
  const es_entrada = formData.get("es_entrada") === "true";
  const foto_url = String(formData.get("foto_url") || "").trim();

  // Un proveedor puede anunciarse para varios lotes en el mismo ingreso.
  // Una visita normalmente trae uno solo. El primero de la lista queda como
  // lote_destino del movimiento; todos se guardan en registro_lotes.
  const lotes = Array.from(
    new Set(
      formData
        .getAll("lote_destino")
        .map((l) => String(l).trim())
        .filter(Boolean)
    )
  );
  const lote = lotes[0] || "";

  const operador_id = String(formData.get("operador_id") || "").trim();
  const operador_nombre = String(formData.get("operador_nombre") || "").trim();

  // Solo se completan cuando la persona NO tiene autorizacion vigente.
  const autorizado_por = String(formData.get("autorizado_por") || "").trim();
  const autorizacion_medio = String(formData.get("autorizacion_medio") || "").trim();

  if (!nombre || !apellido || !dni) {
    return { error: "Nombre, apellido y DNI son obligatorios." };
  }

  if (!lote) {
    return {
      error: es_entrada
        ? "Debe indicar al menos un lote que autoriza el ingreso."
        : "Debe indicar al menos un lote desde donde se retira.",
    };
  }

  if (!operador_nombre) {
    return { error: "Debe indicar qué operador registra el movimiento." };
  }

  if (tipo === "proveedor" && !subtipo) {
    return { error: "Para un proveedor hay que indicar el rubro." };
  }

  if (es_manual && !motivo_manual) {
    return { error: "Si es carga manual, debe indicar el motivo." };
  }

  if (vehiculo_tipo === "si" && !patente) {
    return { error: "Si ingresa con vehículo, debe cargar la patente." };
  }

  try {
    await ensureTables();
    const sql = getSql();

    if (es_entrada) {
      const reciente = (await sql`
        SELECT id FROM registros
        WHERE dni = ${dni} AND es_entrada = TRUE
          AND fecha_hora > NOW() - INTERVAL '5 minutes'
        LIMIT 1
      `) as any[];
      if (reciente.length > 0) {
        return { error: "Ya se registró una entrada para este DNI hace menos de 5 minutos." };
      }

      // ---- Sin autorizacion vigente no se puede ingresar ----
      // Hay que conseguir el visto bueno del residente por telefono o WhatsApp
      // y dejar asentado quien lo dio.
      const autorizada = await tieneAutorizacionVigente(sql, dni);
      if (!autorizada) {
        if (!autorizacion_medio || !autorizado_por) {
          return {
            error:
              `${nombre} ${apellido} no tiene autorización vigente. ` +
              `Comunicate con el residente del lote ${lote} y, una vez que autorice, ` +
              `registrá quién lo hizo y por qué medio.`,
            requiereAutorizacion: true,
          };
        }
      }
    } else {
      const tieneEntrada = (await sql`
        SELECT id FROM registros
        WHERE dni = ${dni} AND es_entrada = TRUE
        LIMIT 1
      `) as any[];
      if (tieneEntrada.length === 0) {
        return { error: "No se puede registrar una salida: este DNI no tiene ninguna entrada previa." };
      }
    }

    // ---- Identidad unica por DNI ----
    // Nombre y apellido quedan fijos: solo cambian por carga manual con motivo.
    // La foto, en cambio, se puede reemplazar en cualquier momento; siempre
    // queda la ultima y se descarta la anterior. Una sola foto por persona.
    const personaExistente = await getPersona(sql, dni);
    const puedeModificar = es_manual && Boolean(motivo_manual);

    let nombreFinal = nombre;
    let apellidoFinal = apellido;
    let mensajeIdentidad = "";

    if (personaExistente && !puedeModificar) {
      nombreFinal = personaExistente.nombre;
      apellidoFinal = personaExistente.apellido;
    }

    // Si suben una foto nueva, esa pasa a ser la vigente. Si no, se conserva.
    const fotoFinal = foto_url || personaExistente?.foto_url || "";

    if (personaExistente) {
      const cambioNombre =
        puedeModificar &&
        (personaExistente.nombre !== nombre || personaExistente.apellido !== apellido);
      const cambioFoto = Boolean(foto_url) && foto_url !== personaExistente.foto_url;

      if (cambioNombre && cambioFoto) mensajeIdentidad = " Se actualizaron los datos y la foto.";
      else if (cambioNombre) mensajeIdentidad = " Se actualizaron los datos de la persona.";
      else if (cambioFoto) mensajeIdentidad = " Se reemplazó la foto de la persona.";
    }

    await upsertPersona(
      sql,
      { dni, nombre: nombreFinal, apellido: apellidoFinal, foto_url: fotoFinal },
      // La foto siempre se pisa con la ultima; el nombre solo con motivo.
      { sobrescribir: puedeModificar || Boolean(foto_url), motivo: motivo_manual }
    );

    const insertado = (await sql`
      INSERT INTO registros (nombre, apellido, dni, tipo, subtipo, vehiculo_tipo, patente,
                             residente_nombre, lote_destino, observaciones, es_manual, motivo_manual,
                             autorizado_por, autorizacion_medio, es_entrada,
                             operador_id, operador_nombre)
      VALUES (${nombreFinal}, ${apellidoFinal}, ${dni}, ${tipo}, ${subtipo}, ${vehiculo_tipo}, ${patente},
              ${residente_nombre}, ${lote}, ${observaciones}, ${es_manual}, ${motivo_manual},
              ${autorizado_por || null}, ${autorizacion_medio || null}, ${es_entrada},
              ${operador_id ? Number(operador_id) : null}, ${operador_nombre})
      RETURNING id
    `) as any[];

    const registroId = insertado[0]?.id;

    // Todos los lotes del movimiento, incluido el primero.
    if (registroId) {
      for (const l of lotes) {
        await sql`INSERT INTO registro_lotes (registro_id, lote) VALUES (${registroId}, ${l})`;
      }
    }

    // El maestro de autorizados replica la identidad vigente para que no queden
    // dos fotos distintas del mismo DNI dando vueltas.
    if (puedeModificar || foto_url) {
      await sql`
        UPDATE autorizados
        SET nombre = ${nombreFinal}, apellido = ${apellidoFinal},
            foto_url = ${fotoFinal || null}
        WHERE dni = ${dni}
      `;
    }

    // Una autorizacion de unica vez se consume al registrar la entrada.
    let mensajeExtra = "";
    if (es_entrada) {
      const consumidas = (await sql`
        UPDATE autorizados
        SET usada = TRUE
        WHERE dni = ${dni} AND un_solo_uso = TRUE AND autorizado = TRUE AND usada = FALSE
        RETURNING id
      `) as any[];
      if (consumidas.length > 0) {
        mensajeExtra = " La autorización de única vez quedó consumida.";
      }
    }

    revalidatePath("/");
    revalidatePath("/informes");

    const detalleLotes =
      lotes.length > 1 ? ` Lotes: ${lotes.join(", ")}.` : ` Lote ${lote}.`;

    return {
      success: true,
      message:
        (es_entrada ? "Entrada registrada correctamente." : "Salida registrada correctamente.") +
        detalleLotes +
        mensajeIdentidad +
        mensajeExtra,
    };
  } catch (error: any) {
    return { error: error.message || "Error al registrar movimiento." };
  }
}


// ---------------------------------------------------------------------------
// La bitacora de movimientos es APPEND-ONLY. No existen updateRegistro ni
// deleteRegistro a proposito: un registro de acceso, una vez asentado, no se
// modifica ni se borra.
//
// Si un movimiento se cargo mal, se registra el correcto de nuevo y quedan los
// dos: el erroneo y el que lo corrige. Poder editar o borrar invalidaria la
// bitacora como evidencia de lo que paso en la guardia.
// ---------------------------------------------------------------------------

// La foto no se guarda en la bitacora: sale siempre de `personas`, que es la
// unica copia. Por eso todas las lecturas de registros hacen el JOIN.
export async function getRegistros(fecha?: string, dni?: string): Promise<Registro[]> {
  try {
    await ensureTables();
    const sql = getSql();

    if (dni) {
      return (await sql`
        SELECT r.*, p.foto_url
        FROM registros r
        LEFT JOIN personas p ON p.dni = r.dni
        WHERE r.dni = ${dni}
        ORDER BY r.fecha_hora DESC LIMIT 50
      `) as unknown as Registro[];
    }

    if (fecha) {
      return (await sql`
        SELECT r.*, p.foto_url
        FROM registros r
        LEFT JOIN personas p ON p.dni = r.dni
        WHERE r.fecha_hora::date = ${fecha}::date
        ORDER BY r.fecha_hora DESC
      `) as unknown as Registro[];
    }

    return (await sql`
      SELECT r.*, p.foto_url
      FROM registros r
      LEFT JOIN personas p ON p.dni = r.dni
      ORDER BY r.fecha_hora DESC LIMIT 100
    `) as unknown as Registro[];
  } catch (error) {
    console.error("Error al obtener registros:", error);
    return [];
  }
}

export type FiltrosInforme = {
  desde?: string;
  hasta?: string;
  dni?: string;
  texto?: string;      // nombre o apellido
  lote?: string;
  tipo?: string;
  subtipo?: string;
  patente?: string;
  operador?: string;
  movimiento?: string; // "entrada" | "salida" | ""
  soloManuales?: boolean;
  soloSinAutorizacion?: boolean;
  /**
   * Entradas de proveedores que nunca registraron la salida.
   * Solo aplica a proveedores: una visita puede irse con el propietario o en
   * otro auto, asi que no tiene sentido controlarle la salida.
   */
  soloProveedoresSinSalida?: boolean;
};

export type RegistroInforme = Registro & { lotes: string };

/**
 * Consulta de la bitacora con filtros combinables para los informes.
 * Los lotes vienen agregados en un solo campo separado por coma, para poder
 * mostrar en una fila un ingreso de proveedor anunciado en varios lotes.
 */
export async function getRegistrosFiltrados(f: FiltrosInforme): Promise<RegistroInforme[]> {
  try {
    await ensureTables();
    const sql = getSql();

    const desde = f.desde?.trim() || null;
    const hasta = f.hasta?.trim() || null;
    const dni = f.dni?.trim() || null;
    const texto = f.texto?.trim() ? `%${f.texto.trim()}%` : null;
    const lote = f.lote?.trim() || null;
    const tipo = f.tipo?.trim() || null;
    const subtipo = f.subtipo?.trim() || null;
    const patente = f.patente?.trim() ? `%${f.patente.trim()}%` : null;
    const operador = f.operador?.trim() ? `%${f.operador.trim()}%` : null;
    const esEntrada =
      f.movimiento === "entrada" ? true : f.movimiento === "salida" ? false : null;

    return (await sql`
      SELECT r.*,
             p.foto_url,
             COALESCE(
               (SELECT string_agg(rl.lote, ', ' ORDER BY rl.id)
                FROM registro_lotes rl WHERE rl.registro_id = r.id),
               r.lote_destino
             ) AS lotes
      FROM registros r
      LEFT JOIN personas p ON p.dni = r.dni
      WHERE (${desde}::date IS NULL OR r.fecha_hora::date >= ${desde}::date)
        AND (${hasta}::date IS NULL OR r.fecha_hora::date <= ${hasta}::date)
        AND (${dni}::text IS NULL OR r.dni = ${dni})
        AND (${texto}::text IS NULL OR r.nombre ILIKE ${texto} OR r.apellido ILIKE ${texto})
        AND (${tipo}::text IS NULL OR r.tipo = ${tipo})
        AND (${subtipo}::text IS NULL OR r.subtipo = ${subtipo})
        AND (${patente}::text IS NULL OR r.patente ILIKE ${patente})
        AND (${operador}::text IS NULL OR r.operador_nombre ILIKE ${operador})
        AND (${esEntrada}::boolean IS NULL OR r.es_entrada = ${esEntrada})
        AND (${f.soloManuales ? true : null}::boolean IS NULL OR r.es_manual = TRUE)
        AND (${f.soloSinAutorizacion ? true : null}::boolean IS NULL OR r.autorizado_por IS NOT NULL)
        AND (
          ${f.soloProveedoresSinSalida ? true : null}::boolean IS NULL
          OR (
            r.tipo = 'proveedor'
            AND r.es_entrada = TRUE
            -- Queda "sin salida" si no hay una salida posterior a esta entrada
            -- y anterior a la siguiente entrada del mismo DNI. Asi se detectan
            -- tanto al que sigue adentro como entradas viejas sin cerrar.
            AND NOT EXISTS (
              SELECT 1 FROM registros s
              WHERE s.dni = r.dni
                AND s.es_entrada = FALSE
                AND s.fecha_hora > r.fecha_hora
                AND s.fecha_hora < COALESCE((
                  SELECT MIN(e.fecha_hora) FROM registros e
                  WHERE e.dni = r.dni
                    AND e.es_entrada = TRUE
                    AND e.fecha_hora > r.fecha_hora
                ), 'infinity'::timestamptz)
            )
          )
        )
        AND (
          ${lote}::text IS NULL
          OR r.lote_destino = ${lote}
          OR EXISTS (
            SELECT 1 FROM registro_lotes rl
            WHERE rl.registro_id = r.id AND rl.lote = ${lote}
          )
        )
      ORDER BY r.fecha_hora DESC
      LIMIT 2000
    `) as unknown as RegistroInforme[];
  } catch (error) {
    console.error("Error al filtrar registros:", error);
    return [];
  }
}

/**
 * Entradas de proveedores que todavia no registraron la salida.
 *
 * Se muestra en la pantalla del operador: da una idea de quien esta adentro y
 * deja ver errores de carga. No pasa por la clave de gestion porque es
 * informacion operativa del puesto, no administrativa.
 *
 * Se acota a los ultimos dias para que una entrada vieja sin cerrar no quede
 * para siempre ocupando la pantalla; el listado completo esta en Informes.
 */
export async function getProveedoresSinSalida(dias = 15): Promise<RegistroInforme[]> {
  try {
    await ensureTables();
    const sql = getSql();

    return (await sql`
      SELECT r.*,
             p.foto_url,
             COALESCE(
               (SELECT string_agg(rl.lote, ', ' ORDER BY rl.id)
                FROM registro_lotes rl WHERE rl.registro_id = r.id),
               r.lote_destino
             ) AS lotes
      FROM registros r
      LEFT JOIN personas p ON p.dni = r.dni
      WHERE r.tipo = 'proveedor'
        AND r.es_entrada = TRUE
        AND r.fecha_hora > NOW() - (${dias} || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM registros s
          WHERE s.dni = r.dni
            AND s.es_entrada = FALSE
            AND s.fecha_hora > r.fecha_hora
            AND s.fecha_hora < COALESCE((
              SELECT MIN(e.fecha_hora) FROM registros e
              WHERE e.dni = r.dni
                AND e.es_entrada = TRUE
                AND e.fecha_hora > r.fecha_hora
            ), 'infinity'::timestamptz)
        )
      ORDER BY r.fecha_hora DESC
      LIMIT 100
    `) as unknown as RegistroInforme[];
  } catch (error) {
    console.error("Error al obtener proveedores sin salida:", error);
    return [];
  }
}

/** Lotes que aparecen en la bitacora, para el desplegable de filtros. */
export async function getLotesUsados(): Promise<string[]> {
  try {
    await ensureTables();
    const sql = getSql();
    const filas = (await sql`
      SELECT DISTINCT lote FROM registro_lotes
      WHERE lote IS NOT NULL AND lote <> ''
      ORDER BY lote
    `) as any[];
    return filas.map((f) => f.lote as string);
  } catch {
    return [];
  }
}

export async function getRegistrosHoy(): Promise<Registro[]> {
  try {
    await ensureTables();
    const sql = getSql();
    return (await sql`
      SELECT r.*, p.foto_url
      FROM registros r
      LEFT JOIN personas p ON p.dni = r.dni
      WHERE r.fecha_hora::date = CURRENT_DATE
      ORDER BY r.fecha_hora DESC
    `) as unknown as Registro[];
  } catch (error) {
    console.error("Error al obtener registros de hoy:", error);
    return [];
  }
}
