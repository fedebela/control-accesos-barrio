/**
 * Constantes de auditoria, sin dependencias del servidor.
 *
 * Van aparte de lib/auditoria.ts porque ese archivo usa next/headers y solo
 * puede correr en el servidor. Las pantallas necesitan las etiquetas, asi que
 * si estuvieran juntas arrastrarian next/headers al bundle del cliente.
 */

export type AccionAuditoria =
  // Autenticacion
  | "login_ok"
  | "login_fallido"
  | "login_forzado"
  | "logout"
  // Gestion
  | "gestion_abierta"
  | "gestion_cerrada"
  // Equipos
  | "equipo_alta"
  | "equipo_baja"
  | "equipo_reactivado"
  // Claves
  | "clave_gestion"
  | "clave_equipos"
  | "clave_usuario"
  | "clave_propia"
  // Usuarios
  | "usuario_alta"
  | "usuario_estado"
  // Accesos de residentes
  | "acceso_alta"
  | "acceso_blanqueo"
  | "acceso_baja"
  // Maestros
  | "residente_alta"
  | "residente_edit"
  | "residente_baja"
  | "operador_alta"
  | "operador_edit"
  | "operador_baja"
  // Autorizaciones
  | "autorizacion_otorgada"
  | "autorizacion_revocada"
  // Importacion
  | "importacion";

export const ETIQUETAS_AUDITORIA: Record<string, string> = {
  login_ok: "Inicio de sesión",
  login_fallido: "Intento fallido",
  login_forzado: "Cierre forzado de sesión",
  logout: "Cierre de sesión",
  gestion_abierta: "Desbloqueo de gestión",
  gestion_cerrada: "Bloqueo de gestión",
  equipo_alta: "Alta de equipo",
  equipo_baja: "Baja de equipo",
  equipo_reactivado: "Reactivación de equipo",
  clave_gestion: "Cambio de clave de gestión",
  clave_equipos: "Cambio de clave de equipos",
  clave_usuario: "Cambio de contraseña de usuario",
  clave_propia: "Cambio de contraseña propia",
  usuario_alta: "Alta de usuario",
  usuario_estado: "Activación / desactivación de usuario",
  acceso_alta: "Alta de acceso a residente",
  acceso_blanqueo: "Blanqueo de acceso a residente",
  acceso_baja: "Baja de acceso a residente",
  residente_alta: "Alta de residente",
  residente_edit: "Edición de residente",
  residente_baja: "Baja de residente",
  operador_alta: "Alta de operador",
  operador_edit: "Edición de operador",
  operador_baja: "Baja de operador",
  autorizacion_otorgada: "Autorización otorgada",
  autorizacion_revocada: "Autorización revocada",
  importacion: "Importación de planilla",
};

/** Eventos que conviene poder mirar de un vistazo cuando algo huele mal. */
export const ACCIONES_SENSIBLES = new Set([
  "login_fallido",
  "login_forzado",
  "equipo_alta",
  "equipo_baja",
  "clave_gestion",
  "clave_equipos",
  "usuario_alta",
  "acceso_alta",
]);
