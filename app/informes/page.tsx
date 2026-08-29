"use client";

import { useState, useEffect } from "react";
import { getRegistros } from "@/app/actions";

export default function InformesPage() {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [dni, setDni] = useState("");
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Si hay DNI, prevalece la busqueda por persona (ignora la fecha).
      const data = await getRegistros(dni.trim() ? undefined : fecha, dni.trim() || undefined);
      setRecords(data);
    } catch {
      setError("No se pudieron obtener los registros.");
      setRecords([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [fecha]);

  const entradas = records.filter((r) => r.es_entrada).length;
  const salidas = records.length - entradas;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Informes</h1>
        <a href="/" style={styles.backLink}>← Volver</a>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <div style={styles.filters}>
          <div style={styles.field}>
            <label style={styles.label}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Buscar por DNI</label>
            <input
              type="text"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fetchData(); } }}
              placeholder="Ignora la fecha"
              style={styles.input}
            />
          </div>
          <button onClick={fetchData} disabled={loading} style={styles.searchBtn}>
            {loading ? "Buscando…" : "Buscar"}
          </button>
          {dni && (
            <button onClick={() => { setDni(""); setTimeout(fetchData, 0); }} style={styles.cancelBtn}>
              Limpiar
            </button>
          )}
        </div>

        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Movimientos</span>
            <span style={styles.summaryValue}>{records.length}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Entradas</span>
            <span style={styles.summaryValue}>{entradas}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Salidas</span>
            <span style={styles.summaryValue}>{salidas}</span>
          </div>
        </div>

        <p style={styles.nota}>
          Los movimientos no se pueden editar ni eliminar. Si alguno se cargó mal,
          registrá el correcto de nuevo: quedan asentados los dos.
        </p>

        {records.length === 0 ? (
          <p style={styles.empty}>No se encontraron registros.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Fecha/Hora</th>
                  <th style={styles.th}>Mov.</th>
                  <th style={styles.th}>Persona</th>
                  <th style={styles.th}>DNI</th>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>Lote</th>
                  <th style={styles.th}>Patente</th>
                  <th style={styles.th}>Autorizó</th>
                  <th style={styles.th}>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} style={styles.tr}>
                    <td style={styles.td}>{new Date(r.fecha_hora).toLocaleString("es-AR")}</td>
                    <td style={styles.td}>
                      <span style={r.es_entrada ? styles.badgeEntry : styles.badgeExit}>
                        {r.es_entrada ? "ENTRADA" : "SALIDA"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.persona}>
                        {r.foto_url && <img src={r.foto_url} alt="" style={styles.thumb} />}
                        <span>{r.apellido}, {r.nombre}</span>
                      </div>
                    </td>
                    <td style={styles.td}>{r.dni}</td>
                    <td style={styles.td}>{r.tipo || "—"}</td>
                    <td style={styles.td}>{r.lote_destino || "—"}</td>
                    <td style={styles.td}>{r.patente || "—"}</td>
                    <td style={styles.td}>
                      {r.autorizado_por ? (
                        <span style={styles.autorizoBadge}>
                          {r.autorizado_por}
                          {r.autorizacion_medio ? ` · ${r.autorizacion_medio}` : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={styles.tdObs}>
                      {r.es_manual && (
                        <span style={styles.manualBadge} title={r.motivo_manual || ""}>MANUAL</span>
                      )}
                      {r.observaciones || (r.es_manual ? r.motivo_manual : "") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" },
  title: { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  backLink: { color: "#2563eb", textDecoration: "none", fontWeight: 600 },
  card: { background: "#fff", borderRadius: "1rem", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" },
  filters: { display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1.25rem", flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: "0.3rem" },
  label: { fontSize: "0.85rem", fontWeight: 700, color: "#374151" },
  input: { padding: "0.75rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "0.95rem", outline: "none" },
  searchBtn: { padding: "0.75rem 1.2rem", borderRadius: "0.75rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" },
  cancelBtn: { padding: "0.75rem 1.2rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", color: "#475569", fontWeight: 700, cursor: "pointer" },
  summary: { display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" },
  summaryItem: { display: "flex", flexDirection: "column" },
  summaryLabel: { fontSize: "0.85rem", color: "#64748b" },
  summaryValue: { fontSize: "1.5rem", fontWeight: 800, color: "#0f172a" },
  nota: { fontSize: "0.85rem", color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "0.5rem", padding: "0.6rem 0.8rem", marginBottom: "1.25rem", lineHeight: 1.5 },
  empty: { color: "#94a3b8", fontStyle: "italic" },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "2px solid #e2e8f0", fontSize: "0.85rem", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "0.6rem 0.75rem", fontSize: "0.9rem", color: "#334155", whiteSpace: "nowrap" },
  tdObs: { padding: "0.6rem 0.75rem", fontSize: "0.85rem", color: "#64748b", maxWidth: 260 },
  persona: { display: "flex", alignItems: "center", gap: "0.5rem" },
  thumb: { width: 28, height: 28, borderRadius: "0.3rem", objectFit: "cover", flexShrink: 0 },
  badgeEntry: { padding: "0.15rem 0.5rem", borderRadius: "0.25rem", background: "#dcfce7", color: "#166534", fontWeight: 700, fontSize: "0.75rem" },
  badgeExit: { padding: "0.15rem 0.5rem", borderRadius: "0.25rem", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.75rem" },
  autorizoBadge: { padding: "0.15rem 0.5rem", borderRadius: "0.25rem", background: "#fff7ed", color: "#9a3412", fontWeight: 600, fontSize: "0.75rem", border: "1px solid #fed7aa" },
  manualBadge: { padding: "0.1rem 0.4rem", borderRadius: "0.25rem", background: "#eff6ff", color: "#1e40af", fontWeight: 700, fontSize: "0.68rem", border: "1px solid #bfdbfe", marginRight: "0.4rem" },
  error: { padding: "0.7rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600, marginBottom: "1rem" },
};
