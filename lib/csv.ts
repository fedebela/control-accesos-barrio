/**
 * Lectura de CSV exportado desde Excel.
 *
 * Contempla lo que rompe en la practica:
 *  - Excel en español separa con ";" y no con ","; se detecta solo.
 *  - BOM UTF-8 al principio del archivo.
 *  - Campos entrecomillados con comillas dobles escapadas ("").
 *  - Saltos de linea dentro de un campo entrecomillado.
 *  - Finales de linea CRLF y LF.
 */

export type TablaCsv = {
  encabezados: string[];
  filas: string[][];
};

/** Detecta el separador contando ocurrencias fuera de comillas en la 1ª línea. */
function detectarSeparador(texto: string): string {
  let i = 0;
  let dentro = false;
  const cuenta: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };

  while (i < texto.length) {
    const c = texto[i];
    if (c === '"') {
      if (dentro && texto[i + 1] === '"') i++;
      else dentro = !dentro;
    } else if (!dentro && (c === "\n" || c === "\r")) {
      break;
    } else if (!dentro && c in cuenta) {
      cuenta[c]++;
    }
    i++;
  }

  const ganador = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  return ganador && ganador[1] > 0 ? ganador[0] : ";";
}

export function parsearCsv(entrada: string): TablaCsv {
  let texto = String(entrada || "");
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1); // BOM
  texto = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!texto.trim()) return { encabezados: [], filas: [] };

  const sep = detectarSeparador(texto);

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let dentro = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (dentro) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentro = false;
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') { dentro = true; continue; }

    if (c === sep) { fila.push(campo.trim()); campo = ""; continue; }

    if (c === "\n") {
      fila.push(campo.trim());
      // Ignora lineas totalmente vacias.
      if (fila.some((x) => x !== "")) filas.push(fila);
      fila = [];
      campo = "";
      continue;
    }

    campo += c;
  }

  fila.push(campo.trim());
  if (fila.some((x) => x !== "")) filas.push(fila);

  if (filas.length === 0) return { encabezados: [], filas: [] };

  const encabezados = filas[0].map((h, i) => h || `Columna ${i + 1}`);
  return { encabezados, filas: filas.slice(1) };
}

// ---------------------------------------------------------------- Mapeo

/** Quita acentos y baja a minusculas, para comparar encabezados. */
function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Nombres habituales de cada campo en planillas reales. */
const ALIAS: Record<string, string[]> = {
  dni: ["dni", "documento", "nrodocumento", "numerodocumento", "doc", "nrodni", "cedula", "ci"],
  nombre: ["nombre", "nombres", "primernombre"],
  apellido: ["apellido", "apellidos"],
  nombreCompleto: [
    "nombreyapellido", "apellidoynombre", "nombrecompleto", "apellidoynombres",
    "nombreyapellidos", "persona", "titular", "completo",
  ],
  lote: ["lote", "unidad", "casa", "domicilio", "manzanalote", "lotenro", "nrolote"],
  patente: ["patente", "dominio", "chapa", "vehiculo", "auto"],
  telefono: ["telefono", "tel", "celular", "cel", "movil", "contacto", "whatsapp"],
  observaciones: ["observaciones", "obs", "observacion", "detalle", "comentario", "comentarios", "notas"],
};

/** Sugiere para cada campo el indice de columna mas probable. */
export function sugerirMapeo(encabezados: string[]): Record<string, number> {
  const normalizados = encabezados.map(normalizar);
  const mapeo: Record<string, number> = {};

  const buscar = (alias: string[]) => {
    // Coincidencia exacta primero, despues por contenido.
    let idx = normalizados.findIndex((h) => alias.includes(h));
    if (idx === -1) idx = normalizados.findIndex((h) => h && alias.some((a) => h.includes(a)));
    return idx;
  };

  // "Apellido y Nombre" contiene las palabras nombre y apellido, asi que se
  // resuelve primero: si hay una columna combinada, no se usan las separadas.
  const idxCompleto = normalizados.findIndex((h) => ALIAS.nombreCompleto.includes(h));
  if (idxCompleto !== -1) mapeo.nombreCompleto = idxCompleto;

  for (const [campo, alias] of Object.entries(ALIAS)) {
    if (campo === "nombreCompleto") continue;
    const idx = buscar(alias);
    if (idx === -1) continue;
    // No se reutiliza la columna ya tomada como nombre completo.
    if (idx === mapeo.nombreCompleto) continue;
    mapeo[campo] = idx;
  }

  // Sin columna combinada explicita, pero tampoco nombre ni apellido por
  // separado: se busca una combinada por contenido.
  if (mapeo.nombreCompleto === undefined && mapeo.nombre === undefined && mapeo.apellido === undefined) {
    const idx = buscar(ALIAS.nombreCompleto);
    if (idx !== -1) mapeo.nombreCompleto = idx;
  }

  return mapeo;
}

/**
 * Separa "Perez, Juan Carlos" o "Perez Juan Carlos" en apellido y nombre.
 * Con coma es inequivoco. Sin coma se asume que la primera palabra es el
 * apellido, que es como suelen venir estos listados.
 */
export function separarNombre(completo: string): { nombre: string; apellido: string } {
  const t = String(completo || "").trim().replace(/\s+/g, " ");
  if (!t) return { nombre: "", apellido: "" };

  if (t.includes(",")) {
    const [ape, nom] = t.split(",");
    return { apellido: (ape || "").trim(), nombre: (nom || "").trim() };
  }

  const partes = t.split(" ");
  if (partes.length === 1) return { apellido: partes[0], nombre: "" };
  return { apellido: partes[0], nombre: partes.slice(1).join(" ") };
}

/** Deja el DNI en solo digitos. Devuelve "" si no parece un documento. */
export function limpiarDni(valor: string): string {
  const d = String(valor || "").replace(/\D/g, "").replace(/^0+/, "");
  return d.length >= 6 && d.length <= 9 ? d : "";
}

/** "juan carlos" -> "Juan Carlos" */
export function aTitulo(texto: string): string {
  return String(texto || "")
    .trim()
    .toLocaleLowerCase("es-AR")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toLocaleUpperCase("es-AR") + p.slice(1))
    .join(" ");
}
