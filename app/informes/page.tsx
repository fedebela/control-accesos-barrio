"use client";

import { useState, useEffect, useMemo } from "react";
import { getRegistrosFiltrados, getLotesUsados, getOperadores, type FiltrosInforme } from "@/app/actions";
import { TIPOS, RUBROS_PROVEEDOR, etiquetaRubro, etiquetaTipo, etiquetaMedio } from "@/lib/constantes";
import BarraSesion from "@/app/components/BarraSesion";

// ---------------------------------------------------------------- Columnas

type Col = {
  id: string;
  titulo: string;
  ancho?: number;
  valor: (r: any) => string;
};

const COLUMNAS: Col[] = [
  { id: "fecha",     titulo: "Fecha/Hora",     valor: (r) => new Date(r.fecha_hora).toLocaleString("es-AR") },
  { id: "movimiento", titulo: "Movimiento",    valor: (r) => (r.es_entrada ? "Entrada" : "Salida") },
  { id: "apellido",  titulo: "Apellido",       valor: (r) => r.apellido || "" },
  { id: "nombre",    titulo: "Nombre",         valor: (r) => r.nombre || "" },
  { id: "dni",       titulo: "DNI",            valor: (r) => r.dni || "" },
  { id: "tipo",      titulo: "Motivo",         valor: (r) => etiquetaTipo(r.tipo) },
  { id: "subtipo",   titulo: "Rubro",          valor: (r) => etiquetaRubro(r.subtipo) },
  { id: "lotes",     titulo: "Lotes",          valor: (r) => r.lotes || r.lote_destino || "" },
  { id: "vehiculo",  titulo: "Vehículo",       valor: (r) => (r.vehiculo_tipo === "si" ? "Sí" : r.vehiculo_tipo === "no" ? "No" : "") },
  { id: "patente",   titulo: "Patente",        valor: (r) => r.patente || "" },
  { id: "operador",  titulo: "Registró",       valor: (r) => r.operador_nombre || "" },
  { id: "autorizo",  titulo: "Autorizó",       valor: (r) => (r.autorizado_por ? `${r.autorizado_por}${r.autorizacion_medio ? ` (${etiquetaMedio(r.autorizacion_medio)})` : ""}` : "") },
  { id: "manual",    titulo: "Manual",         valor: (r) => (r.es_manual ? "Sí" : "") },
  { id: "motivo",    titulo: "Motivo manual",  valor: (r) => r.motivo_manual || "", ancho: 220 },
  { id: "observaciones", titulo: "Observaciones", valor: (r) => r.observaciones || "", ancho: 220 },
];

const COLUMNAS_INICIALES = new Set([
  "fecha", "movimiento", "apellido", "nombre", "dni", "tipo", "subtipo",
  "lotes", "patente", "operador", "autorizo",
]);

const hoyISO = () => new Date().toISOString().slice(0, 10);

const FILTROS_VACIOS: FiltrosInforme = {
  desde: hoyISO(), hasta: hoyISO(), dni: "", texto: "", lote: "",
  tipo: "", subtipo: "", patente: "", operador: "", movimiento: "",
  soloManuales: false, soloSinAutorizacion: false,
};

export default function InformesPage() {
  const [filtros, setFiltros] = useState<FiltrosInforme>({ ...FILTROS_VACIOS });
  const [registros, setRegistros] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibles, setVisibles] = useState<Set<string>>(new Set(COLUMNAS_INICIALES));
  const [lotes, setLotes] = useState<string[]>([]);
  const [operadores, setOperadores] = useState<any[]>([]);
  const [panelColumnas, setPanelColumnas] = useState(false);

  useEffect(() => {
    getLotesUsados().then(setLotes);
    getOperadores().then(setOperadores);
    consultar({ ...FILTROS_VACIOS });
  }, []);

  const set = <K extends keyof FiltrosInforme>(k: K, v: FiltrosInforme[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }));

  async function consultar(f: FiltrosInforme = filtros) {
    setCargando(true);
    setError(null);
    try {
      setRegistros(await getRegistrosFiltrados(f));
    } catch {
      setError("No se pudieron obtener los registros.");
      setRegistros([]);
    }
    setCargando(false);
  }

  function limpiar() {
    const f = { ...FILTROS_VACIOS };
    setFiltros(f);
    consultar(f);
  }

  const cols = useMemo(() => COLUMNAS.filter((c) => visibles.has(c.id)), [visibles]);

  const totales = useMemo(() => ({
    total: registros.length,
    entradas: registros.filter((r) => r.es_entrada).length,
    salidas: registros.filter((r) => !r.es_entrada).length,
    proveedores: registros.filter((r) => r.tipo === "proveedor").length,
  }), [registros]);

  function toggleCol(id: string) {
    setVisibles((prev) => {
      const s = new Set(prev);
      if (s.has(id)) { if (s.size > 1) s.delete(id); } else { s.add(id); }
      return s;
    });
  }

  /**
   * Exporta a CSV compatible con Excel en español:
   *  - separador ";" (Excel es-AR usa la coma como decimal)
   *  - BOM UTF-8 para que los acentos no salgan mal
   */
  function exportar() {
    const sep = ";";
    const escapar = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const lineas = [
      cols.map((c) => escapar(c.titulo)).join(sep),
      ...registros.map((r) => cols.map((c) => escapar(c.valor(r))).join(sep)),
    ];

    const blob = new Blob(["\uFEFF" + lineas.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accesos_${filtros.desde || "inicio"}_a_${filtros.hasta || "hoy"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.container}>
      <style>{ESTILOS_IMPRESION}</style>

      <div className="no-print"><BarraSesion /></div>

      <header style={styles.header} className="no-print">
        <h1 style={styles.title}>Informes</h1>
        <a href="/" style={styles.backLink}>← Volver</a>
      </header>

      {/* Encabezado que solo aparece al imprimir */}
      <div className="solo-print" style={styles.encabezadoPrint}>
        <h2 style={{ margin: 0 }}>Registro de accesos</h2>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
          Período: {filtros.desde || "inicio"} a {filtros.hasta || "hoy"} · {totales.total} movimientos
          · Emitido {new Date().toLocaleString("es-AR")}
        </p>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* ---------------- Filtros ---------------- */}
      <div style={styles.card} className="no-print">
        <h3 style={styles.seccion}>Filtros</h3>

        <div style={styles.grid}>
          <Campo label="Desde">
            <input type="date" value={filtros.desde || ""} onChange={(e) => set("desde", e.target.value)} style={styles.input} />
          </Campo>
          <Campo label="Hasta">
            <input type="date" value={filtros.hasta || ""} onChange={(e) => set("hasta", e.target.value)} style={styles.input} />
          </Campo>
          <Campo label="Movimiento">
            <select value={filtros.movimiento || ""} onChange={(e) => set("movimiento", e.target.value)} style={styles.input}>
              <option value="">Entradas y salidas</option>
              <option value="entrada">Solo entradas</option>
              <option value="salida">Solo salidas</option>
            </select>
          </Campo>
          <Campo label="DNI">
            <input value={filtros.dni || ""} onChange={(e) => set("dni", e.target.value)} placeholder="Exacto" style={styles.input} />
          </Campo>
          <Campo label="Nombre o apellido">
            <input value={filtros.texto || ""} onChange={(e) => set("texto", e.target.value)} placeholder="Parcial" style={styles.input} />
          </Campo>
          <Campo label="Lote">
            <input
              value={filtros.lote || ""}
              onChange={(e) => set("lote", e.target.value)}
              placeholder="Exacto"
              list="lotes-usados"
              style={styles.input}
            />
            <datalist id="lotes-usados">
              {lotes.map((l) => <option key={l} value={l} />)}
            </datalist>
          </Campo>
          <Campo label="Motivo">
            <select
              value={filtros.tipo || ""}
              onChange={(e) => { set("tipo", e.target.value); if (e.target.value !== "proveedor") set("subtipo", ""); }}
              style={styles.input}
            >
              <option value="">Todos</option>
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
            </select>
          </Campo>
          <Campo label="Rubro">
            <select
              value={filtros.subtipo || ""}
              onChange={(e) => set("subtipo", e.target.value)}
              style={styles.input}
              disabled={filtros.tipo === "visita"}
            >
              <option value="">Todos</option>
              {RUBROS_PROVEEDOR.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
            </select>
          </Campo>
          <Campo label="Patente">
            <input value={filtros.patente || ""} onChange={(e) => set("patente", e.target.value.toUpperCase())} placeholder="Parcial" style={styles.input} />
          </Campo>
          <Campo label="Registró">
            <select value={filtros.operador || ""} onChange={(e) => set("operador", e.target.value)} style={styles.input}>
              <option value="">Todos</option>
              {operadores.map((o) => (
                <option key={o.id} value={`${o.nombre} ${o.apellido}`}>{o.apellido}, {o.nombre}</option>
              ))}
            </select>
          </Campo>
        </div>

        <div style={styles.checksRow}>
          <label style={styles.check}>
            <input type="checkbox" checked={!!filtros.soloManuales} onChange={(e) => set("soloManuales", e.target.checked)} />
            Solo cargas manuales
          </label>
          <label style={styles.check}>
            <input type="checkbox" checked={!!filtros.soloSinAutorizacion} onChange={(e) => set("soloSinAutorizacion", e.target.checked)} />
            Solo ingresos autorizados por excepción
          </label>
        </div>

        <div style={styles.acciones}>
          <button onClick={() => consultar()} disabled={cargando} style={styles.btnPrimario}>
            {cargando ? "Consultando…" : "Consultar"}
          </button>
          <button onClick={limpiar} style={styles.btnSecundario}>Limpiar filtros</button>
          <button onClick={() => setPanelColumnas((v) => !v)} style={styles.btnSecundario}>
            Columnas ({cols.length}/{COLUMNAS.length})
          </button>
          <button onClick={exportar} disabled={registros.length === 0} style={styles.btnExcel}>
            Exportar a Excel
          </button>
          <button onClick={() => window.print()} disabled={registros.length === 0} style={styles.btnSecundario}>
            Imprimir
          </button>
        </div>

        {panelColumnas && (
          <div style={styles.panelCols}>
            {COLUMNAS.map((c) => (
              <label key={c.id} style={styles.check}>
                <input type="checkbox" checked={visibles.has(c.id)} onChange={() => toggleCol(c.id)} />
                {c.titulo}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- Resultados ---------------- */}
      <div style={styles.card}>
        <div style={styles.resumen}>
          <Total label="Movimientos" valor={totales.total} />
          <Total label="Entradas" valor={totales.entradas} />
          <Total label="Salidas" valor={totales.salidas} />
          <Total label="Proveedores" valor={totales.proveedores} />
        </div>

        <p style={styles.nota} className="no-print">
          Los movimientos no se pueden editar ni eliminar. Si alguno se cargó mal,
          registrá el correcto de nuevo: quedan asentados los dos.
        </p>

        {registros.length === 0 ? (
          <p style={styles.empty}>No hay movimientos que cumplan con los filtros.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {cols.map((c) => <th key={c.id} style={styles.th}>{c.titulo}</th>)}
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} style={styles.tr}>
                    {cols.map((c) => (
                      <td key={c.id} style={c.ancho ? { ...styles.td, maxWidth: c.ancho, whiteSpace: "normal" } : styles.td}>
                        {c.id === "movimiento" ? (
                          <span style={r.es_entrada ? styles.badgeEntry : styles.badgeExit}>
                            {r.es_entrada ? "ENTRADA" : "SALIDA"}
                          </span>
                        ) : (
                          c.valor(r) || "—"
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {registros.length >= 2000 && (
          <p style={styles.avisoLimite}>
            Se muestran los primeros 2000 movimientos. Acotá el rango de fechas para ver el resto.
          </p>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.campo}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function Total({ label, valor }: { label: string; valor: number }) {
  return (
    <div style={styles.totalItem}>
      <span style={styles.totalLabel}>{label}</span>
      <span style={styles.totalValor}>{valor}</span>
    </div>
  );
}

const ESTILOS_IMPRESION = `
  .solo-print { display: none; }
  @media print {
    .no-print { display: none !important; }
    .solo-print { display: block !important; }
    body { background: #fff; }
    table { font-size: 9pt; }
    th, td { padding: 3pt 4pt !important; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    @page { size: landscape; margin: 10mm; }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 1400, margin: "0 auto", padding: "1.5rem 1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" },
  title: { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  backLink: { color: "#2563eb", textDecoration: "none", fontWeight: 600 },
  encabezadoPrint: { marginBottom: "0.75rem", borderBottom: "1px solid #000", paddingBottom: "0.4rem" },

  card: { background: "#fff", borderRadius: "1rem", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.05)", marginBottom: "1.25rem" },
  seccion: { fontSize: "0.8rem", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 0.85rem" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" },
  campo: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  label: { fontSize: "0.8rem", fontWeight: 700, color: "#374151" },
  input: { padding: "0.6rem 0.7rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.9rem", outline: "none", width: "100%", boxSizing: "border-box" },

  checksRow: { display: "flex", gap: "1.25rem", flexWrap: "wrap", marginTop: "0.85rem" },
  check: { fontSize: "0.85rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" },

  acciones: { display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" },
  btnPrimario: { padding: "0.7rem 1.3rem", borderRadius: "0.6rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" },
  btnSecundario: { padding: "0.7rem 1.1rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", background: "#f8fafc", color: "#475569", fontWeight: 700, cursor: "pointer" },
  btnExcel: { padding: "0.7rem 1.1rem", borderRadius: "0.6rem", border: "none", background: "#15803d", color: "#fff", fontWeight: 700, cursor: "pointer" },

  panelCols: { display: "flex", flexWrap: "wrap", gap: "0.6rem 1.25rem", marginTop: "0.85rem", padding: "0.85rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "0.6rem" },

  resumen: { display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "0.85rem" },
  totalItem: { display: "flex", flexDirection: "column" },
  totalLabel: { fontSize: "0.8rem", color: "#64748b" },
  totalValor: { fontSize: "1.5rem", fontWeight: 800, color: "#0f172a" },

  nota: { fontSize: "0.82rem", color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "0.5rem", padding: "0.55rem 0.75rem", marginBottom: "1rem", lineHeight: 1.5 },
  empty: { color: "#94a3b8", fontStyle: "italic" },
  avisoLimite: { fontSize: "0.82rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "0.5rem", padding: "0.55rem 0.75rem", marginTop: "0.85rem", fontWeight: 600 },

  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "0.5rem 0.65rem", borderBottom: "2px solid #e2e8f0", fontSize: "0.8rem", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "0.5rem 0.65rem", fontSize: "0.85rem", color: "#334155", whiteSpace: "nowrap" },
  badgeEntry: { padding: "0.1rem 0.45rem", borderRadius: "0.25rem", background: "#dcfce7", color: "#166534", fontWeight: 700, fontSize: "0.72rem" },
  badgeExit: { padding: "0.1rem 0.45rem", borderRadius: "0.25rem", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.72rem" },
  error: { padding: "0.7rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600, marginBottom: "1rem" },
};
