/**
 * Parser de la tira que emite el lector de DNI argentino (PDF417).
 *
 * Ejemplo real:
 *   00280252214"maza"juan carlos"m"30588449"a"30-01-1984"13-11-2014"239
 *
 * Campos:
 *   1. Numero de tramite
 *   2. Apellido
 *   3. Nombre
 *   4. Sexo (M/F/X)          <- puede no venir en algunos lectores
 *   5. DNI
 *   6. Ejemplar (A/B/C/D)
 *   7. Fecha de nacimiento   (DD-MM-AAAA)
 *   8. Fecha de emision      (DD-MM-AAAA)  -- NO es el vencimiento
 *   9. Codigo interno
 *
 * El codigo no contiene la fecha de vencimiento del documento, asi que no
 * se puede validar la vigencia a partir del escaneo.
 *
 * Sobre el separador: el PDF417 del DNI usa "@". Muchos lectores configurados
 * con teclado latinoamericano lo emiten como comilla doble, porque el "@" es
 * AltGr+Q y la emulacion de teclado no lo reproduce. Por eso aceptamos ambos.
 */

export type DniEscaneado = {
  nroTramite: string;
  apellido: string;
  nombre: string;
  sexo: string;
  dni: string;
  ejemplar: string;
  fechaNacimiento: Date | null;
  fechaEmision: Date | null;
  /** true si se pudo mapear la tira completa; false si solo se rescato el DNI */
  completo: boolean;
  crudo: string;
};

const SEPARADORES = /["@|]/;

/** Convierte "juan carlos" -> "Juan Carlos" */
export function aTitulo(texto: string): string {
  return texto
    .toLocaleLowerCase("es-AR")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toLocaleUpperCase("es-AR") + p.slice(1))
    .join(" ");
}

/** Acepta DD-MM-AAAA y DD/MM/AAAA. Devuelve null si no es una fecha valida. */
export function parseFecha(valor: string): Date | null {
  const m = String(valor || "").trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m) return null;

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);

  const d = new Date(anio, mes - 1, dia);
  // Rechaza fechas imposibles tipo 31-02-2020, que Date normalizaria.
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) {
    return null;
  }
  return d;
}

function hoySinHora(): Date {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate());
}

const VACIO: Omit<DniEscaneado, "crudo"> = {
  nroTramite: "",
  apellido: "",
  nombre: "",
  sexo: "",
  dni: "",
  ejemplar: "",
  fechaNacimiento: null,
  fechaEmision: null,
  completo: false,
};

/**
 * Devuelve null si no se pudo extraer ni siquiera un DNI.
 */
export function parseDniEscaneado(entrada: string): DniEscaneado | null {
  const crudo = String(entrada || "").trim();
  if (!crudo) return null;

  const partes = crudo.split(SEPARADORES).map((p) => p.trim());

  // --- Sin separadores utiles: intentamos rescatar solo el numero de DNI ---
  if (partes.length < 5) {
    const soloDigitos = crudo.replace(/\D/g, "");
    const suelto = crudo.match(/\b\d{7,9}\b/);
    const dni = suelto ? suelto[0] : /^\d{7,9}$/.test(soloDigitos) ? soloDigitos : "";
    return dni ? { ...VACIO, dni, crudo } : null;
  }

  const [nroTramite = "", apellido = "", nombre = "", campo4 = "", campo5 = "", ...resto] = partes;

  // El campo 4 puede ser el sexo (1 letra) o directamente el DNI,
  // segun el lector. Detectamos cual es.
  const sinSexo = /^\d{7,9}$/.test(campo4);

  const sexo = sinSexo ? "" : campo4;
  const dni = sinSexo ? campo4 : campo5;
  const ejemplar = sinSexo ? campo5 : resto[0] || "";
  const fNacTexto = sinSexo ? resto[0] || "" : resto[1] || "";
  const fEmiTexto = sinSexo ? resto[1] || "" : resto[2] || "";

  const dniLimpio = dni.replace(/\D/g, "");
  if (!/^\d{6,9}$/.test(dniLimpio)) {
    // El mapeo no cerro: ultimo intento buscando cualquier numero plausible.
    const suelto = crudo.match(/\b\d{7,9}\b/);
    return suelto ? { ...VACIO, dni: suelto[0], crudo } : null;
  }

  return {
    nroTramite,
    apellido: aTitulo(apellido),
    nombre: aTitulo(nombre),
    sexo: sexo.toUpperCase(),
    dni: dniLimpio,
    ejemplar: ejemplar.toUpperCase(),
    fechaNacimiento: parseFecha(fNacTexto),
    fechaEmision: parseFecha(fEmiTexto),
    completo: true,
    crudo,
  };
}

export function formatearFecha(d: Date | null): string {
  return d ? d.toLocaleDateString("es-AR") : "—";
}

/** Edad en años cumplidos, o null si no hay fecha de nacimiento. */
export function calcularEdad(nacimiento: Date | null): number | null {
  if (!nacimiento) return null;
  const hoy = hoySinHora();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad >= 0 && edad < 130 ? edad : null;
}
