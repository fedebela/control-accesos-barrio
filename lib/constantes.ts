/**
 * Constantes compartidas entre el servidor y las pantallas.
 * Se definen en un solo lugar para que los valores guardados en la base y los
 * que se muestran en los desplegables no se desincronicen.
 */

/** visita = social · proveedor = laboral */
export const TIPOS = [
  { valor: "visita", etiqueta: "Visita — social" },
  { valor: "proveedor", etiqueta: "Proveedor — laboral" },
] as const;

/** Rubros de proveedor. Se guardan en registros.subtipo. */
export const RUBROS_PROVEEDOR = [
  { valor: "construccion", etiqueta: "Construcción" },
  { valor: "jardinero", etiqueta: "Jardinero" },
  { valor: "piletero", etiqueta: "Piletero" },
  { valor: "domestico", etiqueta: "Personal doméstico" },
  { valor: "delivery", etiqueta: "Delivery / Uber" },
  { valor: "servicios", etiqueta: "Servicios" },
  { valor: "reparto", etiqueta: "Supermercado / Reparto" },
] as const;

export const TURNOS = [
  { valor: "manana", etiqueta: "Mañana" },
  { valor: "tarde", etiqueta: "Tarde" },
  { valor: "noche", etiqueta: "Noche" },
  { valor: "rotativo", etiqueta: "Rotativo" },
] as const;

export const MEDIOS_AUTORIZACION = [
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "telefono", etiqueta: "Teléfono" },
  { valor: "presencial", etiqueta: "Presencial" },
] as const;

function buscarEtiqueta(lista: readonly { valor: string; etiqueta: string }[], valor?: string) {
  if (!valor) return "";
  return lista.find((x) => x.valor === valor)?.etiqueta || valor;
}

export const etiquetaTipo = (v?: string) => buscarEtiqueta(TIPOS, v);
export const etiquetaRubro = (v?: string) => buscarEtiqueta(RUBROS_PROVEEDOR, v);
export const etiquetaTurno = (v?: string) => buscarEtiqueta(TURNOS, v);
export const etiquetaMedio = (v?: string) => buscarEtiqueta(MEDIOS_AUTORIZACION, v);
