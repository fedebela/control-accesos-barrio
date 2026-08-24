"use client";

import { useState, useEffect } from "react";
import { getRegistros } from "@/app/actions";

export default function InformesPage() {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [dni, setDni] = useState("");
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const data = await getRegistros(dni || undefined, dni || undefined);
    if (dni) {
      setRecords(data);
    } else {
      const filtered = data.filter((r: any) => r.fecha_hora.startsWith(fecha));
      setRecords(filtered);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [fecha]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Informes</h1>
        <a href="/" style={styles.backLink}>← Volver</a>
      </header>

      <div style={styles.card}>
        <div style={styles.filters}>
          <div style={styles.field}>
            <label style={styles.label}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Buscar por DNI</label>
            <input type="text" value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI" style={styles.input} />
          </div>
          <button onClick={fetchData} disabled={loading} style={styles.searchBtn}>{loading ? "Buscando..." : "Buscar"}</button>
        </div>

        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Total registros</span>
            <span style={styles.summaryValue}>{records.length}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Entradas</span>
            <span style={styles.summaryValue}>{records.filter(r => r.es_entrada).length}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Salidas</span>
            <span style={styles.summaryValue}>{records.filter(r => !r.es_entrada).length}</span>
          </div>
        </div>

        {records.length === 0 ? (
          <p style={styles.empty}>No se encontraron registros.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Fecha/Hora</th>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>Nombre</th>
                  <th style={styles.th}>DNI</th>
                  <th style={styles.th}>Lote</th>
                  <th style={styles.th}>Vehículo</th>
                  <th style={styles.th}>Patente</th>
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
                    <td style={styles.td}>{r.nombre} {r.apellido}</td>
                    <td style={styles.td}>{r.dni}</td>
                    <td style={styles.td}>{r.lote_destino}</td>
                    <td style={styles.td}>{r.vehiculo_tipo || "—"}</td>
                    <td style={styles.td}>{r.patente || "—"}</td>
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
  container: { maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" },
  title: { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  backLink: { color: "#2563eb", textDecoration: "none", fontWeight: 600 },
  card: { background: "#fff", borderRadius: "1rem", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" },
  filters: { display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1.25rem", flexWrap: "wrap" as const },
  field: { display: "flex", flexDirection: "column", gap: "0.3rem" },
  label: { fontSize: "0.85rem", fontWeight: 700, color: "#374151" },
  input: { padding: "0.75rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "0.95rem", outline: "none" },
  searchBtn: { padding: "0.75rem 1.2rem", borderRadius: "0.75rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" },
  summary: { display: "flex", gap: "1.5rem", marginBottom: "1.25rem", flexWrap: "wrap" as const },
  summaryItem: { display: "flex", flexDirection: "column" as const },
  summaryLabel: { fontSize: "0.85rem", color: "#64748b" },
  summaryValue: { fontSize: "1.5rem", fontWeight: 800, color: "#0f172a" },
  empty: { color: "#94a3b8", fontStyle: "italic" },
  tableWrapper: { overflowX: "auto" as const },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left" as const, padding: "0.6rem 0.75rem", borderBottom: "2px solid #e2e8f0", fontSize: "0.85rem", fontWeight: 700, color: "#475569" },
  tr: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "0.6rem 0.75rem", fontSize: "0.9rem", color: "#334155" },
  badgeEntry: { padding: "0.15rem 0.5rem", borderRadius: "0.25rem", background: "#dcfce7", color: "#166534", fontWeight: 700, fontSize: "0.75rem" },
  badgeExit: { padding: "0.15rem 0.5rem", borderRadius: "0.25rem", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.75rem" },
};
