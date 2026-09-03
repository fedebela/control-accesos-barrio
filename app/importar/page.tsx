"use client";

import { useState, useMemo, useRef } from "react";
import { importarPersonas, importarAutorizados, dnisExistentes, type ResultadoImportacion } from "@/app/actions";
import { parsearCsv, sugerirMapeo, separarNombre, limpiarDni, aTitulo } from "@/lib/csv";

type Destino = "personas" | "autorizados";

const CAMPOS: { id: string; titulo: string; ayuda: string; requerido: Destino[] }[] = [
  { id: "dni",            titulo: "DNI",              ayuda: "Se queda solo con los dígitos", requerido: ["personas", "autorizados"] },
  { id: "nombreCompleto", titulo: "Nombre y apellido", ayuda: "Si vienen juntos en una sola columna", requerido: [] },
  { id: "apellido",       titulo: "Apellido",         ayuda: "Si vienen en columnas separadas", requerido: [] },
  { id: "nombre",         titulo: "Nombre",           ayuda: "Si vienen en columnas separadas", requerido: [] },
  { id: "lote",           titulo: "Lote",             ayuda: "Obligatorio para autorizados", requerido: ["autorizados"] },
  { id: "patente",        titulo: "Patente",          ayuda: "Opcional", requerido: [] },
  { id: "observaciones",  titulo: "Observaciones",    ayuda: "Opcional", requerido: [] },
];

export default function ImportarPage() {
  const [destino, setDestino] = useState<Destino>("personas");
  const [texto, setTexto] = useState("");
  const [mapeo, setMapeo] = useState<Record<string, number>>({});
  const [actualizar, setActualizar] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [procesando, setProcesando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const tabla = useMemo(() => parsearCsv(texto), [texto]);

  function cargarTexto(t: string) {
    setTexto(t);
    setResultado(null);
    setExistentes(new Set());
    const parsed = parsearCsv(t);
    setMapeo(sugerirMapeo(parsed.encabezados));
  }

  function alSubirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cargarTexto(String(reader.result || ""));
    reader.readAsText(file, "UTF-8");
  }

  // ---- Conversion de las filas del CSV al formato que espera el servidor ----
  const filas = useMemo(() => {
    if (tabla.filas.length === 0) return [];
    const val = (f: string[], campo: string) => {
      const i = mapeo[campo];
      return i === undefined || i < 0 ? "" : (f[i] || "").trim();
    };

    return tabla.filas.map((f, idx) => {
      let nombre = aTitulo(val(f, "nombre"));
      let apellido = aTitulo(val(f, "apellido"));

      if (!nombre && !apellido) {
        const partido = separarNombre(val(f, "nombreCompleto"));
        nombre = aTitulo(partido.nombre);
        apellido = aTitulo(partido.apellido);
      }

      const dniCrudo = val(f, "dni");
      const dni = limpiarDni(dniCrudo);

      const problemas: string[] = [];
      if (!dni) problemas.push(dniCrudo ? `DNI inválido: "${dniCrudo}"` : "Sin DNI");
      if (!nombre && !apellido) problemas.push("Sin nombre");
      if (destino === "autorizados" && !val(f, "lote")) problemas.push("Sin lote");

      return {
        linea: idx + 2, // +1 por el encabezado, +1 porque Excel empieza en 1
        dni,
        nombre,
        apellido,
        lote: val(f, "lote"),
        patente: val(f, "patente").toUpperCase(),
        observaciones: val(f, "observaciones"),
        problemas,
      };
    });
  }, [tabla, mapeo, destino]);

  const validas = filas.filter((f) => f.problemas.length === 0);
  const invalidas = filas.filter((f) => f.problemas.length > 0);

  // Duplicados dentro del propio archivo.
  const duplicadasEnArchivo = useMemo(() => {
    const vistos = new Set<string>();
    const dup = new Set<string>();
    for (const f of validas) {
      if (vistos.has(f.dni)) dup.add(f.dni);
      vistos.add(f.dni);
    }
    return dup;
  }, [validas]);

  async function verificarExistentes() {
    const dnis = Array.from(new Set(validas.map((f) => f.dni)));
    setExistentes(new Set(await dnisExistentes(dnis)));
  }

  async function importar() {
    if (validas.length === 0) return;
    setProcesando(true);
    setResultado(null);

    // Se manda una sola fila por DNI: la ultima gana.
    const porDni = new Map<string, any>();
    for (const f of validas) porDni.set(f.dni, f);
    const payload = Array.from(porDni.values()).map((f) => ({
      dni: f.dni, nombre: f.nombre, apellido: f.apellido,
      lote: f.lote, patente: f.patente, observaciones: f.observaciones,
    }));

    const r = destino === "personas"
      ? await importarPersonas(payload, { actualizarExistentes: actualizar })
      : await importarAutorizados(payload);

    setResultado(r);
    setProcesando(false);
  }

  const camposRequeridos = CAMPOS.filter((c) => c.requerido.includes(destino));
  const faltanRequeridos = camposRequeridos.filter((c) => mapeo[c.id] === undefined);
  const faltaNombre = mapeo.nombre === undefined && mapeo.apellido === undefined && mapeo.nombreCompleto === undefined;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Importar desde planilla</h1>
        <a href="/maestros" style={styles.backLink}>← Volver a Maestros</a>
      </header>

      {/* ---------------- Paso 1 ---------------- */}
      <div style={styles.card}>
        <h2 style={styles.paso}>1 · Qué vas a importar</h2>
        <div style={styles.opciones}>
          <label style={destino === "personas" ? styles.opcionActiva : styles.opcion}>
            <input type="radio" checked={destino === "personas"} onChange={() => { setDestino("personas"); setResultado(null); }} />
            <div>
              <strong>Personas</strong>
              <p style={styles.opcionTexto}>
                Gente que ya ingresó al barrio. Quedan registradas con su DNI, nombre y
                apellido, sin ningún permiso. La foto se saca en el primer ingreso.
              </p>
            </div>
          </label>
          <label style={destino === "autorizados" ? styles.opcionActiva : styles.opcion}>
            <input type="radio" checked={destino === "autorizados"} onChange={() => { setDestino("autorizados"); setResultado(null); }} />
            <div>
              <strong>Autorizados permanentes</strong>
              <p style={styles.opcionTexto}>
                Quedan habilitados a ingresar hasta que se los revoque. Necesita el lote
                que autoriza. Si la persona no existía, se crea.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* ---------------- Paso 2 ---------------- */}
      <div style={styles.card}>
        <h2 style={styles.paso}>2 · Pegá o subí el archivo</h2>
        <p style={styles.ayuda}>
          En Excel: <strong>Archivo → Guardar como → CSV UTF-8</strong>. También podés
          copiar las celdas (con la fila de títulos) y pegarlas acá directamente.
        </p>

        <div style={styles.acciones}>
          <button type="button" onClick={() => fileRef.current?.click()} style={styles.btnSecundario}>
            Subir archivo CSV
          </button>
          {texto && (
            <button type="button" onClick={() => { setTexto(""); setMapeo({}); setResultado(null); }} style={styles.btnSecundario}>
              Limpiar
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={alSubirArchivo} style={{ display: "none" }} />

        <textarea
          value={texto}
          onChange={(e) => cargarTexto(e.target.value)}
          placeholder={"DNI;Apellido;Nombre;Lote\n30588449;Maza;Juan Carlos;142"}
          style={styles.textarea}
          rows={6}
        />

        {texto && tabla.encabezados.length === 0 && (
          <div style={styles.error}>No se pudo interpretar el archivo. Verificá que tenga una fila de títulos.</div>
        )}
        {tabla.encabezados.length > 0 && (
          <p style={styles.okChico}>
            Se detectaron {tabla.encabezados.length} columnas y {tabla.filas.length} filas.
          </p>
        )}
      </div>

      {/* ---------------- Paso 3 ---------------- */}
      {tabla.encabezados.length > 0 && (
        <div style={styles.card}>
          <h2 style={styles.paso}>3 · Relacioná las columnas</h2>
          <p style={styles.ayuda}>
            Se intentó adivinar por los títulos. Corregí lo que haga falta y dejá en
            «No usar» lo que no corresponda.
          </p>

          <div style={styles.grid}>
            {CAMPOS.map((c) => {
              const requerido = c.requerido.includes(destino);
              return (
                <div key={c.id} style={styles.campo}>
                  <label style={styles.label}>
                    {c.titulo}{requerido ? " *" : ""}
                  </label>
                  <select
                    value={mapeo[c.id] ?? -1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMapeo((m) => {
                        const n = { ...m };
                        if (v < 0) delete n[c.id]; else n[c.id] = v;
                        return n;
                      });
                      setResultado(null);
                    }}
                    style={{ ...styles.input, ...(requerido && mapeo[c.id] === undefined ? styles.inputFalta : null) }}
                  >
                    <option value={-1}>— No usar —</option>
                    {tabla.encabezados.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                  <span style={styles.ayudaChica}>{c.ayuda}</span>
                </div>
              );
            })}
          </div>

          {faltaNombre && (
            <div style={styles.aviso}>
              Falta indicar el nombre: usá «Nombre y apellido» si vienen juntos, o las
              columnas separadas de nombre y apellido.
            </div>
          )}
          {faltanRequeridos.length > 0 && (
            <div style={styles.aviso}>
              Faltan columnas obligatorias: {faltanRequeridos.map((c) => c.titulo).join(", ")}.
            </div>
          )}
        </div>
      )}

      {/* ---------------- Paso 4 ---------------- */}
      {filas.length > 0 && (
        <div style={styles.card}>
          <h2 style={styles.paso}>4 · Revisá antes de importar</h2>

          <div style={styles.resumen}>
            <Total label="Listas para importar" valor={validas.length} color="#166534" />
            <Total label="Con problemas" valor={invalidas.length} color={invalidas.length ? "#b91c1c" : "#64748b"} />
            <Total label="Repetidas en el archivo" valor={duplicadasEnArchivo.size} color={duplicadasEnArchivo.size ? "#92400e" : "#64748b"} />
            <Total label="Ya en el sistema" valor={existentes.size} color="#1e40af" />
          </div>

          <div style={styles.acciones}>
            <button type="button" onClick={verificarExistentes} disabled={validas.length === 0} style={styles.btnSecundario}>
              Ver cuáles ya existen
            </button>
            {destino === "personas" && (
              <label style={styles.check}>
                <input type="checkbox" checked={actualizar} onChange={(e) => setActualizar(e.target.checked)} />
                Actualizar nombre y apellido de los que ya existen
              </label>
            )}
          </div>

          {destino === "personas" && !actualizar && (
            <p style={styles.ayuda}>
              Los DNI que ya están cargados se omiten. Es lo recomendado: el nombre que
              tiene hoy el sistema puede ser más confiable que el de una planilla vieja.
            </p>
          )}

          {duplicadasEnArchivo.size > 0 && (
            <div style={styles.aviso}>
              Hay DNI repetidos dentro del archivo. Se va a importar una sola vez cada uno,
              con los datos de la última fila.
            </div>
          )}

          {invalidas.length > 0 && (
            <details style={styles.detalles}>
              <summary style={styles.summary}>Ver las {invalidas.length} filas con problemas</summary>
              <div style={styles.listaProblemas}>
                {invalidas.slice(0, 100).map((f) => (
                  <div key={f.linea} style={styles.problema}>
                    <strong>Fila {f.linea}</strong> — {f.problemas.join(" · ")}
                  </div>
                ))}
                {invalidas.length > 100 && <div style={styles.problema}>… y {invalidas.length - 100} más.</div>}
              </div>
            </details>
          )}

          <div style={styles.tablaWrap}>
            <table style={styles.tabla}>
              <thead>
                <tr>
                  <th style={styles.th}>Fila</th>
                  <th style={styles.th}>DNI</th>
                  <th style={styles.th}>Apellido</th>
                  <th style={styles.th}>Nombre</th>
                  {destino === "autorizados" && <th style={styles.th}>Lote</th>}
                  <th style={styles.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 50).map((f) => {
                  const yaEsta = existentes.has(f.dni);
                  return (
                    <tr key={f.linea} style={styles.tr}>
                      <td style={styles.td}>{f.linea}</td>
                      <td style={styles.td}>{f.dni || "—"}</td>
                      <td style={styles.td}>{f.apellido || "—"}</td>
                      <td style={styles.td}>{f.nombre || "—"}</td>
                      {destino === "autorizados" && <td style={styles.td}>{f.lote || "—"}</td>}
                      <td style={styles.td}>
                        {f.problemas.length > 0
                          ? <span style={styles.badgeError}>{f.problemas[0]}</span>
                          : yaEsta
                            ? <span style={styles.badgeInfo}>Ya existe</span>
                            : <span style={styles.badgeOk}>Lista</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filas.length > 50 && (
              <p style={styles.ayudaChica}>Se muestran las primeras 50 de {filas.length} filas.</p>
            )}
          </div>

          <button
            type="button"
            onClick={importar}
            disabled={procesando || validas.length === 0 || faltanRequeridos.length > 0 || faltaNombre}
            style={validas.length > 0 && faltanRequeridos.length === 0 && !faltaNombre ? styles.btnImportar : styles.btnBloqueado}
          >
            {procesando
              ? "Importando…"
              : `Importar ${validas.length} ${destino === "personas" ? "personas" : "autorizados"}`}
          </button>
        </div>
      )}

      {/* ---------------- Resultado ---------------- */}
      {resultado && (
        <div style={styles.card}>
          <h2 style={styles.paso}>Resultado</h2>
          {resultado.error && <div style={styles.error}>{resultado.error}</div>}
          {resultado.success && (
            <div style={styles.exito}>
              Se crearon <strong>{resultado.creados}</strong>
              {resultado.actualizados > 0 && <> · se actualizaron <strong>{resultado.actualizados}</strong></>}
              {resultado.omitidos > 0 && <> · se omitieron <strong>{resultado.omitidos}</strong></>}
            </div>
          )}
          {resultado.detalleOmitidos.length > 0 && (
            <details style={styles.detalles}>
              <summary style={styles.summary}>Ver los {resultado.detalleOmitidos.length} omitidos</summary>
              <div style={styles.listaProblemas}>
                {resultado.detalleOmitidos.slice(0, 200).map((d, i) => (
                  <div key={i} style={styles.problema}>{d}</div>
                ))}
              </div>
            </details>
          )}
          <div style={styles.acciones}>
            <a href="/maestros" style={styles.btnPrimario}>Ir a Maestros</a>
            <button type="button" onClick={() => { setTexto(""); setMapeo({}); setResultado(null); setExistentes(new Set()); }} style={styles.btnSecundario}>
              Importar otra planilla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Total({ label, valor, color }: { label: string; valor: number; color: string }) {
  return (
    <div style={styles.totalItem}>
      <span style={styles.totalLabel}>{label}</span>
      <span style={{ ...styles.totalValor, color }}>{valor}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 1000, margin: "0 auto", padding: "1.5rem 1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" },
  title: { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  backLink: { color: "#2563eb", textDecoration: "none", fontWeight: 600 },

  card: { background: "#fff", borderRadius: "1rem", padding: "1.35rem", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.05)", marginBottom: "1.25rem" },
  paso: { fontSize: "0.85rem", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 0.85rem" },

  opciones: { display: "flex", gap: "0.75rem", flexWrap: "wrap" },
  opcion: { flex: 1, minWidth: 260, display: "flex", gap: "0.6rem", alignItems: "flex-start", padding: "0.9rem", border: "1px solid #e2e8f0", borderRadius: "0.75rem", cursor: "pointer", background: "#fff" },
  opcionActiva: { flex: 1, minWidth: 260, display: "flex", gap: "0.6rem", alignItems: "flex-start", padding: "0.9rem", border: "2px solid #2563eb", borderRadius: "0.75rem", cursor: "pointer", background: "#eff6ff" },
  opcionTexto: { fontSize: "0.85rem", color: "#64748b", margin: "0.25rem 0 0", lineHeight: 1.5 },

  ayuda: { fontSize: "0.88rem", color: "#64748b", margin: "0 0 0.85rem", lineHeight: 1.55 },
  ayudaChica: { fontSize: "0.75rem", color: "#94a3b8" },
  okChico: { fontSize: "0.85rem", color: "#166534", fontWeight: 600, margin: "0.6rem 0 0" },

  textarea: { width: "100%", padding: "0.75rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.85rem", fontFamily: "ui-monospace, monospace", outline: "none", boxSizing: "border-box", marginTop: "0.75rem", resize: "vertical" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem" },
  campo: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  label: { fontSize: "0.82rem", fontWeight: 700, color: "#374151" },
  input: { padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.9rem", outline: "none", width: "100%", boxSizing: "border-box" },
  inputFalta: { borderColor: "#fca5a5", background: "#fef2f2" },

  resumen: { display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "1rem" },
  totalItem: { display: "flex", flexDirection: "column" },
  totalLabel: { fontSize: "0.78rem", color: "#64748b" },
  totalValor: { fontSize: "1.6rem", fontWeight: 800 },

  acciones: { display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.85rem" },
  check: { fontSize: "0.85rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" },

  btnPrimario: { padding: "0.7rem 1.3rem", borderRadius: "0.6rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-block" },
  btnSecundario: { padding: "0.7rem 1.1rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", background: "#f8fafc", color: "#475569", fontWeight: 700, cursor: "pointer" },
  btnImportar: { width: "100%", padding: "0.95rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, fontSize: "1.02rem", cursor: "pointer", marginTop: "1rem" },
  btnBloqueado: { width: "100%", padding: "0.95rem", borderRadius: "0.75rem", border: "none", background: "#cbd5e1", color: "#64748b", fontWeight: 800, fontSize: "1.02rem", cursor: "not-allowed", marginTop: "1rem" },

  aviso: { padding: "0.7rem 0.85rem", borderRadius: "0.6rem", background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", fontSize: "0.85rem", fontWeight: 600, marginTop: "0.85rem" },
  error: { padding: "0.7rem 0.85rem", borderRadius: "0.6rem", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: "0.88rem", fontWeight: 600, marginTop: "0.85rem" },
  exito: { padding: "0.85rem", borderRadius: "0.6rem", background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", fontSize: "0.95rem", fontWeight: 600 },

  detalles: { marginTop: "0.85rem" },
  summary: { cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, color: "#475569" },
  listaProblemas: { maxHeight: 220, overflowY: "auto", marginTop: "0.5rem", padding: "0.6rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "0.5rem" },
  problema: { fontSize: "0.82rem", color: "#475569", padding: "0.15rem 0" },

  tablaWrap: { overflowX: "auto", marginTop: "0.85rem" },
  tabla: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "0.45rem 0.6rem", borderBottom: "2px solid #e2e8f0", fontSize: "0.78rem", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "0.45rem 0.6rem", fontSize: "0.85rem", color: "#334155", whiteSpace: "nowrap" },
  badgeOk: { padding: "0.1rem 0.45rem", borderRadius: "0.25rem", background: "#dcfce7", color: "#166534", fontWeight: 700, fontSize: "0.72rem" },
  badgeInfo: { padding: "0.1rem 0.45rem", borderRadius: "0.25rem", background: "#eff6ff", color: "#1e40af", fontWeight: 700, fontSize: "0.72rem" },
  badgeError: { padding: "0.1rem 0.45rem", borderRadius: "0.25rem", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.72rem" },
};
