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
  lote: string;
  fecha_expiracion: string;
  autorizado: boolean;
  link_token: string;
  foto_url: string;
  residente_nombre?: string;
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

    const existeEnOtraTabla = (await sql`
      SELECT 'autorizados' as tabla, dni FROM autorizados WHERE dni = ${dni}
      UNION ALL
      SELECT 'registros' as tabla, dni FROM registros WHERE dni = ${dni}
      LIMIT 1
    `) as any[];

    if (existeEnOtraTabla.length > 0) {
      return { error: `El DNI ${dni} ya está registrado en ${existeEnOtraTabla[0].tabla}. Un DNI solo puede tener 1 nombre, apellido y foto.` };
    }

    await sql`
      INSERT INTO residentes (nombre, apellido, lote, telefono, dni, rol, foto_url)
      VALUES (${nombre}, ${apellido}, ${lote}, ${telefono}, ${dni}, ${rol}, ${foto_url || null})
      ON CONFLICT (dni) DO UPDATE SET
        nombre = ${nombre}, apellido = ${apellido}, lote = ${lote},
        telefono = ${telefono}, rol = ${rol}, foto_url = ${foto_url || null}
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

  try {
    await ensureTables();
    const sql = getSql();
    await sql`
      UPDATE residentes SET nombre=${nombre}, apellido=${apellido}, lote=${lote},
        telefono=${telefono}, dni=${dni}, rol=${rol}, foto_url=${foto_url || null}
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
             a.residente_id, a.lote, a.fecha_expiracion, a.autorizado, a.link_token,
             a.foto_url, a.created_at,
             r.nombre || ' ' || r.apellido AS residente_nombre
      FROM autorizados a
      LEFT JOIN residentes r ON r.id = a.residente_id
      ORDER BY a.apellido, a.nombre
    `) as unknown as Autorizado[];
  } catch (error) {
    console.error("Error al obtener autorizados:", error);
    return [];
  }
}

export async function createAutorizado(prevState: any, formData: FormData) {
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const tipo = String(formData.get("tipo") || "permanente").trim();
  const observaciones = String(formData.get("observaciones") || "").trim();
  const patente = String(formData.get("patente") || "").trim();
  const lote = String(formData.get("lote") || "").trim();
  const foto_url = String(formData.get("foto_url") || "").trim();

  if (!nombre || !apellido || !dni) {
    return { error: "Nombre, apellido y DNI son obligatorios." };
  }

  try {
    await ensureTables();
    const sql = getSql();

    const existeEnOtraTabla = (await sql`
      SELECT 'residentes' as tabla, dni FROM residentes WHERE dni = ${dni}
      UNION ALL
      SELECT 'registros' as tabla, dni FROM registros WHERE dni = ${dni}
      UNION ALL
      SELECT 'autorizados' as tabla, dni FROM autorizados WHERE dni = ${dni}
      LIMIT 1
    `) as any[];

    if (existeEnOtraTabla.length > 0) {
      return { error: `El DNI ${dni} ya está registrado en ${existeEnOtraTabla[0].tabla}. Un DNI solo puede tener 1 nombre, apellido y foto.` };
    }

    await sql`
      INSERT INTO autorizados (nombre, apellido, dni, tipo, observaciones, patente, lote, autorizado, foto_url)
      VALUES (${nombre}, ${apellido}, ${dni}, ${tipo}, ${observaciones}, ${patente || null}, ${lote}, true, ${foto_url || null})
    `;
    revalidatePath("/maestros");
    return { success: true, message: "Autorizado guardado correctamente." };
  } catch (error: any) {
    return { error: error.message || "Error al guardar autorizado." };
  }
}

export async function updateAutorizado(id: number, prevState: any, formData: FormData) {
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const tipo = String(formData.get("tipo") || "permanente").trim();
  const observaciones = String(formData.get("observaciones") || "").trim();
  const patente = String(formData.get("patente") || "").trim();
  const lote = String(formData.get("lote") || "").trim();
  const foto_url = String(formData.get("foto_url") || "").trim();

  try {
    await ensureTables();
    const sql = getSql();
    await sql`
      UPDATE autorizados SET nombre=${nombre}, apellido=${apellido}, dni=${dni},
        tipo=${tipo}, observaciones=${observaciones}, patente=${patente || null},
        lote=${lote}, foto_url=${foto_url || null}
      WHERE id = ${id}
    `;
    revalidatePath("/maestros");
    return { success: true, message: "Autorizado actualizado." };
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

export async function createInvitacion(prevState: any, formData: FormData) {
  const nombre = String(formData.get("nombre") || "").trim();
  const apellido = String(formData.get("apellido") || "").trim();
  const dni = String(formData.get("dni") || "").trim();
  const lote = String(formData.get("lote") || "").trim();
  const residente_nombre = String(formData.get("residente_nombre") || "").trim();
  const observaciones = String(formData.get("observaciones") || "").trim();
  const patente = String(formData.get("patente") || "").trim();

  if (!nombre || !apellido || !dni || !lote || !residente_nombre) {
    return { error: "Todos los campos son obligatorios." };
  }

  try {
    await ensureTables();
    const sql = getSql();

    const existeEnOtraTabla = (await sql`
      SELECT 'residentes' as tabla, dni FROM residentes WHERE dni = ${dni}
      UNION ALL
      SELECT 'registros' as tabla, dni FROM registros WHERE dni = ${dni}
      UNION ALL
      SELECT 'autorizados' as tabla, dni FROM autorizados WHERE dni = ${dni}
      LIMIT 1
    `) as any[];

    if (existeEnOtraTabla.length > 0) {
      return { error: `El DNI ${dni} ya está registrado en ${existeEnOtraTabla[0].tabla}. Un DNI solo puede tener 1 nombre, apellido y foto.` };
    }

    const token = crypto.randomUUID().slice(0, 12);

    await sql`
      INSERT INTO autorizados (nombre, apellido, dni, tipo, observaciones, patente, lote, autorizado, link_token)
      VALUES (${nombre}, ${apellido}, ${dni}, 'temporal', ${observaciones}, ${patente || null}, ${lote}, false, ${token})
    `;

    const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/invite/confirm?token=${token}`;

    revalidatePath("/maestros");
    return {
      success: true,
      message: `Invitación creada. Link de WhatsApp: ${inviteLink}`,
      inviteLink,
      whatsappLink: `https://wa.me/?text=${encodeURIComponent(`Has sido invitado al barrio. Confirmá tu ingreso: ${inviteLink}`)}`,
    };
  } catch (error: any) {
    return { error: error.message || "Error al crear invitación." };
  }
}

export async function confirmInvitacion(token: string) {
  try {
    await ensureTables();
    const sql = getSql();
    const result = await sql`
      UPDATE autorizados SET autorizado = true WHERE link_token = ${token} AND autorizado = false
    `;
    if ((result as any).count === 0) {
      return { error: "Link inválido o ya fue utilizado." };
    }
    return { success: true, message: "Ingreso autorizado correctamente." };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function getAutorizadoByToken(token: string) {
  try {
    await ensureTables();
    const sql = getSql();
    const rows = await sql`
      SELECT nombre, apellido, dni, lote, autorizado
      FROM autorizados WHERE link_token = ${token}
    `;
    return (rows as any)[0] || null;
  } catch (error) {
    return null;
  }
}

// ========== REGISTROS (ENTRADAS / SALIDAS) ==========

export async function searchPersona(dni: string) {
  try {
    await ensureTables();
    const sql = getSql();

    const residente = (await sql`
      SELECT nombre, apellido, dni, lote, foto_url
      FROM residentes WHERE dni = ${dni} LIMIT 1
    `) as any[];

    if (residente.length > 0) {
      return {
        autorizado: {
          ...residente[0],
          tipo: "residente",
          autorizado: true,
          es_residente: true,
        },
        ultimoRegistro: null,
      };
    }

    const ultimoRegistro = (await sql`
      SELECT nombre, apellido, dni, tipo, subtipo, vehiculo_tipo, patente,
             residente_nombre, lote_destino, es_entrada, foto_url, fecha_hora
      FROM registros
      WHERE dni = ${dni}
      ORDER BY fecha_hora DESC
      LIMIT 1
    `) as any[];

    let autorizadoData: any = null;

    if (ultimoRegistro.length > 0) {
      const r = ultimoRegistro[0];
      autorizadoData = {
        nombre: r.nombre,
        apellido: r.apellido,
        dni: r.dni,
        tipo: r.tipo,
        patente: r.patente || "",
        lote: r.lote_destino || "",
        autorizado: false,
        foto_url: r.foto_url || "",
        es_registro_previo: true,
      };
    }

    const autorizado = (await sql`
      SELECT a.tipo, a.autorizado, a.patente, a.lote,
             r.nombre || ' ' || r.apellido AS residente_nombre
      FROM autorizados a
      LEFT JOIN residentes r ON r.id = a.residente_id
      WHERE a.dni = ${dni}
      LIMIT 1
    `) as any[];

    if (autorizado.length > 0) {
      const a = autorizado[0];
      autorizadoData = {
        ...autorizadoData,
        nombre: autorizadoData?.nombre || "",
        apellido: autorizadoData?.apellido || "",
        dni: dni,
        tipo: a.tipo,
        autorizado: true,
        es_autorizado_permanente: true,
        residente_nombre: a.residente_nombre,
      };
    }

    if (autorizado.length === 0) {
      const invitacion = (await sql`
        SELECT nombre, apellido, dni, lote, aprobada, usada, foto_url, patente
        FROM invitaciones
        WHERE dni = ${dni}
        ORDER BY created_at DESC
        LIMIT 1
      `) as any[];

      if (invitacion.length > 0) {
        const inv = invitacion[0];
        autorizadoData = {
          ...autorizadoData,
          nombre: autorizadoData?.nombre || inv.nombre,
          apellido: autorizadoData?.apellido || inv.apellido,
          dni: dni,
          tipo: "temporal",
          autorizado: inv.aprobada && !inv.usada,
          es_invitacion: true,
          invitacion_aprobada: inv.aprobada,
          invitacion_usada: inv.usada,
        };
      }
    }

    return {
      autorizado: autorizadoData,
      ultimoRegistro: ultimoRegistro[0] || null,
    };
  } catch (error) {
    console.error("Error al buscar persona:", error);
    return { autorizado: null, ultimoRegistro: null };
  }
}

export async function checkDniCargadoReciente(dni: string) {
  try {
    await ensureTables();
    const sql = getSql();
    const reciente = (await sql`
      SELECT id FROM registros
      WHERE dni = ${dni}
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
  const patente = String(formData.get("patente") || "").trim();
  const residente_nombre = String(formData.get("residente_nombre") || "").trim();
  const lote_destino = String(formData.get("lote_destino") || "").trim();
  const observaciones = String(formData.get("observaciones") || "").trim();
  const es_manual = formData.get("es_manual") === "true";
  const motivo_manual = String(formData.get("motivo_manual") || "").trim();
  const autorizado_por = String(formData.get("autorizado_por") || "").trim();
  const es_entrada = formData.get("es_entrada") === "true";
  const foto_url = String(formData.get("foto_url") || "").trim();

  if (!nombre || !apellido || !dni) {
    return { error: "Nombre, apellido y DNI son obligatorios." };
  }

  if (es_manual && !motivo_manual) {
    return { error: "Si es carga manual, debe indicar el motivo." };
  }

  if (!autorizado_por) {
    return { error: es_entrada ? "Debe indicar el lote que autoriza." : "Debe indicar el lote donde se retira." };
  }

  if (es_entrada) {
    const cargadoReciente = await checkDniCargadoReciente(dni);
    if (cargadoReciente) {
      return { error: "Ya fue cargado el DNI hace menos de 5 minutos." };
    }
  }

  try {
    await ensureTables();
    const sql = getSql();
    await sql`
      INSERT INTO registros (nombre, apellido, dni, tipo, subtipo, vehiculo_tipo, patente,
                             residente_nombre, lote_destino, observaciones, es_manual, motivo_manual,
                             autorizado_por, es_entrada, foto_url)
      VALUES (${nombre}, ${apellido}, ${dni}, ${tipo}, ${subtipo}, ${vehiculo_tipo}, ${patente},
              ${residente_nombre}, ${lote_destino}, ${observaciones}, ${es_manual}, ${motivo_manual},
              ${autorizado_por}, ${es_entrada}, ${foto_url || null})
    `;
    revalidatePath("/");
    return {
      success: true,
      message: es_entrada ? "Entrada registrada correctamente." : "Salida registrada correctamente.",
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
  const patente = String(formData.get("patente") || "").trim();
  const lote_destino = String(formData.get("lote_destino") || "").trim();
  const observaciones = String(formData.get("observaciones") || "").trim();

  try {
    await ensureTables();
    const sql = getSql();
    await sql`
      UPDATE registros SET nombre=${nombre}, apellido=${apellido}, dni=${dni},
        tipo=${tipo}, vehiculo_tipo=${vehiculo_tipo}, patente=${patente},
        lote_destino=${lote_destino}, observaciones=${observaciones}
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
