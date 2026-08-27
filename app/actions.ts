"use server";

import { revalidatePath } from "next/cache";
import { ensureTables, getSql } from "@/lib/db";

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
};

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
    revalidatePath("/maestros");
    return { success: true, message: "Residente guardado correctamente." };
  } catch (error: any) {
    return { error: error.message || "Error al guardar residente." };
  }
}

export async function updateResidente(id: number, prevState: any, formData: FormData) {
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
    revalidatePath("/maestros");
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
 * Marca como AUTORIZADO PERMANENTE a una persona que ya existe en el sistema.
 *
 * No se cargan nombre/apellido/foto a mano: se toman de lo que ya quedo grabado
 * cuando la persona ingreso por primera vez (o de una invitacion previa).
 * Solo se pide el lote que autoriza y, opcionalmente, patente y observaciones.
 */
export async function promoverAPermanente(prevState: any, formData: FormData) {
  const dni = String(formData.get("dni") || "").trim();
  const lote = String(formData.get("lote") || "").trim();
  const patente = String(formData.get("patente") || "").trim().toUpperCase();
  const observaciones = String(formData.get("observaciones") || "").trim();

  if (!dni) return { error: "Falta el DNI." };
  if (!lote) return { error: "Indicá el lote que autoriza el ingreso permanente." };

  try {
    await ensureTables();
    const sql = getSql();

    const residente = (await sql`
      SELECT 1 FROM residentes WHERE dni = ${dni} LIMIT 1
    `) as any[];
    if (residente.length > 0) {
      return { error: "Esta persona es residente del barrio: ya tiene ingreso permanente." };
    }

    // Datos ya conocidos: primero una autorizacion previa, si no la bitacora.
    const autorizacionPrevia = (await sql`
      SELECT nombre, apellido, foto_url, patente, observaciones
      FROM autorizados WHERE dni = ${dni}
      ORDER BY usada ASC, created_at DESC LIMIT 1
    `) as any[];

    const registroPrevio = (await sql`
      SELECT nombre, apellido, foto_url, patente
      FROM registros WHERE dni = ${dni}
      ORDER BY fecha_hora DESC LIMIT 1
    `) as any[];

    const base = autorizacionPrevia[0] || registroPrevio[0] || null;

    if (!base) {
      return {
        error:
          "No hay datos de esta persona. Primero tiene que registrar un ingreso desde la pantalla principal (carga manual).",
      };
    }

    const foto = autorizacionPrevia[0]?.foto_url || registroPrevio[0]?.foto_url || null;

    // Una autorizacion permanente reemplaza cualquier permiso anterior del mismo DNI.
    await sql`DELETE FROM autorizados WHERE dni = ${dni}`;

    await sql`
      INSERT INTO autorizados
        (nombre, apellido, dni, tipo, observaciones, patente, lote,
         autorizado, un_solo_uso, usada, foto_url)
      VALUES
        (${base.nombre}, ${base.apellido}, ${dni}, 'permanente', ${observaciones},
         ${patente || base.patente || null}, ${lote},
         TRUE, FALSE, FALSE, ${foto})
    `;

    revalidatePath("/maestros");
    revalidatePath("/");
    return {
      success: true,
      message: `${base.nombre} ${base.apellido} quedó como autorizado permanente del lote ${lote}.`,
    };
  } catch (error: any) {
    return { error: error.message || "Error al marcar como autorizado permanente." };
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

// ========== INVITACIONES ==========
// Una invitacion es una fila en `autorizados` con tipo='temporal' y autorizado=false
// hasta que el residente la confirma desde el link.

export async function createInvitacion(prevState: any, formData: FormData) {
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const lote = String(formData.get("lote") || "").trim();
  const residente_nombre = String(formData.get("residente_nombre") || "").trim();
  const observaciones = String(formData.get("observaciones") || "").trim();
  const patente = String(formData.get("patente") || "").trim();
  const un_solo_uso = formData.get("un_solo_uso") === "on" || formData.get("un_solo_uso") === "true";
  const fecha_expiracion = String(formData.get("fecha_expiracion") || "").trim();

  if (!nombre || !apellido || !dni || !lote || !residente_nombre) {
    return { error: "Nombre, apellido, DNI, lote y residente que invita son obligatorios." };
  }

  try {
    await ensureTables();
    const sql = getSql();

    const duplicado = await dniYaRegistrado(dni);
    if (duplicado === "residentes") {
      return { error: `El DNI ${dni} pertenece a un residente del barrio.` };
    }
    if (duplicado === "autorizados") {
      return { error: `El DNI ${dni} ya tiene una autorización vigente.` };
    }

    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    await sql`
      INSERT INTO autorizados
        (nombre, apellido, dni, tipo, observaciones, patente, lote, residente_nombre,
         fecha_expiracion, autorizado, un_solo_uso, usada, link_token)
      VALUES
        (${nombre}, ${apellido}, ${dni}, 'temporal', ${observaciones}, ${patente || null}, ${lote}, ${residente_nombre},
         ${fecha_expiracion || null}, FALSE, ${un_solo_uso}, FALSE, ${token})
    `;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const inviteLink = `${baseUrl}/invite/confirm?token=${token}`;

    revalidatePath("/maestros");
    return {
      success: true,
      message: un_solo_uso
        ? "Invitación de única vez creada. Enviala al residente para que la confirme."
        : "Invitación temporal creada. Enviala al residente para que la confirme.",
      inviteLink,
      whatsappLink: `https://wa.me/?text=${encodeURIComponent(
        `${residente_nombre}: confirmá el ingreso de ${nombre} ${apellido} (DNI ${dni}) al lote ${lote}: ${inviteLink}`
      )}`,
    };
  } catch (error: any) {
    return { error: error.message || "Error al crear invitación." };
  }
}

export async function confirmInvitacion(token: string) {
  if (!token) return { error: "Link inválido." };

  try {
    await ensureTables();
    const sql = getSql();

    const filas = (await sql`
      UPDATE autorizados
      SET autorizado = TRUE
      WHERE link_token = ${token} AND autorizado = FALSE AND usada = FALSE
      RETURNING id, nombre, apellido, dni, lote, un_solo_uso
    `) as any[];

    if (filas.length === 0) {
      const existente = (await sql`
        SELECT autorizado, usada FROM autorizados WHERE link_token = ${token} LIMIT 1
      `) as any[];

      if (existente.length === 0) return { error: "Link inválido." };
      if (existente[0].usada) return { error: "Esta invitación ya fue utilizada." };
      if (existente[0].autorizado) return { error: "Esta invitación ya estaba confirmada." };
      return { error: "No se pudo confirmar la invitación." };
    }

    const inv = filas[0];
    revalidatePath("/maestros");
    return {
      success: true,
      message: inv.un_solo_uso
        ? `Ingreso de ${inv.nombre} ${inv.apellido} autorizado por única vez.`
        : `Ingreso de ${inv.nombre} ${inv.apellido} autorizado.`,
    };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function getAutorizadoByToken(token: string) {
  try {
    await ensureTables();
    const sql = getSql();
    const rows = (await sql`
      SELECT nombre, apellido, dni, lote, autorizado, usada, un_solo_uso, residente_nombre
      FROM autorizados WHERE link_token = ${token} LIMIT 1
    `) as any[];
    return rows[0] || null;
  } catch {
    return null;
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
  };

  const dniLimpio = String(dni || "").trim();
  if (!dniLimpio) return vacio;

  try {
    await ensureTables();
    const sql = getSql();

    const [registros, entradas, residentes, autorizaciones] = await Promise.all([
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
    ]);

    const ultimoRegistro = registros[0] || null;
    const ultimaEntrada = entradas[0] || null;
    const residente = residentes[0] || null;
    const auth = autorizaciones[0] || null;

    if (!ultimoRegistro && !residente && !auth) return vacio;

    // --- Datos de la persona: la bitacora es la base, el maestro tiene prioridad ---
    const persona: PersonaEncontrada = {
      nombre: residente?.nombre || auth?.nombre || ultimoRegistro?.nombre || "",
      apellido: residente?.apellido || auth?.apellido || ultimoRegistro?.apellido || "",
      dni: dniLimpio,
      tipo: residente ? "residente" : auth?.tipo || ultimoRegistro?.tipo || "visita",
      lote: auth?.lote || residente?.lote || ultimoRegistro?.lote_destino || "",
      patente: ultimoRegistro?.patente || auth?.patente || "",
      observaciones: auth?.observaciones || ultimoRegistro?.observaciones || "",
      residente_nombre: auth?.residente_nombre || ultimoRegistro?.residente_nombre || "",
      foto_url: residente?.foto_url || auth?.foto_url || ultimoRegistro?.foto_url || "",
    };

    // --- Estado de autorizacion ---
    let estado: EstadoAutorizacion = "no_registrado";
    let autorizado = false;

    if (residente) {
      estado = "residente";
      autorizado = true;
    } else if (auth) {
      const vencida =
        auth.fecha_expiracion && new Date(auth.fecha_expiracion) < new Date(new Date().toDateString());

      if (auth.usada) {
        estado = "usada";
      } else if (!auth.autorizado) {
        estado = "pendiente";
      } else if (vencida) {
        estado = "vencida";
      } else if (auth.tipo === "permanente") {
        estado = "permanente";
        autorizado = true;
      } else {
        estado = "temporal";
        autorizado = true;
      }
    } else if (ultimoRegistro) {
      estado = "previo";
    }

    return { persona, estado, autorizado, ultimoRegistro, ultimaEntrada };
  } catch (error) {
    console.error("Error al buscar persona:", error);
    return vacio;
  }
}

// ========== REGISTROS (ENTRADAS / SALIDAS) ==========

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

  // El lote es un unico dato: donde se autoriza (entrada) o de donde se retira (salida).
  const lote = String(
    formData.get("lote_destino") || formData.get("autorizado_por") || ""
  ).trim();

  if (!nombre || !apellido || !dni) {
    return { error: "Nombre, apellido y DNI son obligatorios." };
  }

  if (!lote) {
    return {
      error: es_entrada
        ? "Debe indicar el lote que autoriza el ingreso."
        : "Debe indicar el lote desde donde se retira.",
    };
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

    await sql`
      INSERT INTO registros (nombre, apellido, dni, tipo, subtipo, vehiculo_tipo, patente,
                             residente_nombre, lote_destino, observaciones, es_manual, motivo_manual,
                             autorizado_por, es_entrada, foto_url)
      VALUES (${nombre}, ${apellido}, ${dni}, ${tipo}, ${subtipo}, ${vehiculo_tipo}, ${patente},
              ${residente_nombre}, ${lote}, ${observaciones}, ${es_manual}, ${motivo_manual},
              ${lote}, ${es_entrada}, ${foto_url || null})
    `;

    // Si la persona no tenia foto guardada en el maestro, la propagamos.
    if (foto_url) {
      await sql`
        UPDATE autorizados SET foto_url = ${foto_url}
        WHERE dni = ${dni} AND (foto_url IS NULL OR foto_url = '')
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
    return {
      success: true,
      message:
        (es_entrada ? "Entrada registrada correctamente." : "Salida registrada correctamente.") +
        mensajeExtra,
    };
  } catch (error: any) {
    return { error: error.message || "Error al registrar movimiento." };
  }
}

export async function updateRegistro(id: number, prevState: any, formData: FormData) {
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const tipo = String(formData.get("tipo") || "").trim();
  const vehiculo_tipo = String(formData.get("vehiculo_tipo") || "").trim();
  const patente = String(formData.get("patente") || "").trim().toUpperCase();
  const lote_destino = String(formData.get("lote_destino") || "").trim();
  const observaciones = String(formData.get("observaciones") || "").trim();

  try {
    await ensureTables();
    const sql = getSql();
    await sql`
      UPDATE registros SET nombre=${nombre}, apellido=${apellido}, dni=${dni},
        tipo=${tipo}, vehiculo_tipo=${vehiculo_tipo}, patente=${patente},
        lote_destino=${lote_destino}, autorizado_por=${lote_destino},
        observaciones=${observaciones}
      WHERE id = ${id}
    `;
    revalidatePath("/");
    revalidatePath("/informes");
    return { success: true, message: "Registro actualizado." };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function deleteRegistro(id: number) {
  try {
    await ensureTables();
    const sql = getSql();
    await sql`DELETE FROM registros WHERE id = ${id}`;
    revalidatePath("/");
    revalidatePath("/informes");
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function getRegistros(fecha?: string, dni?: string): Promise<Registro[]> {
  try {
    await ensureTables();
    const sql = getSql();

    if (dni) {
      return (await sql`
        SELECT * FROM registros WHERE dni = ${dni} ORDER BY fecha_hora DESC LIMIT 50
      `) as unknown as Registro[];
    }

    if (fecha) {
      return (await sql`
        SELECT * FROM registros
        WHERE fecha_hora::date = ${fecha}::date
        ORDER BY fecha_hora DESC
      `) as unknown as Registro[];
    }

    return (await sql`
      SELECT * FROM registros ORDER BY fecha_hora DESC LIMIT 100
    `) as unknown as Registro[];
  } catch (error) {
    console.error("Error al obtener registros:", error);
    return [];
  }
}

export async function getRegistrosHoy(): Promise<Registro[]> {
  try {
    await ensureTables();
    const sql = getSql();
    return (await sql`
      SELECT * FROM registros
      WHERE fecha_hora::date = CURRENT_DATE
      ORDER BY fecha_hora DESC
    `) as unknown as Registro[];
  } catch (error) {
    console.error("Error al obtener registros de hoy:", error);
    return [];
  }
}
