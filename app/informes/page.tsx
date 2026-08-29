"use client";

import { useState, useEffect } from "react";
import { getRegistros, updateRegistro, deleteRegistro } from "@/app/actions";

export default function InformesPage() {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [dni, setDni] = useState("");
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ nombre: "", apellido: "", dni: "", tipo: "", vehiculo_tipo: "", patente: "", lote_destino: "", observaciones: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  function fillEditForm(r: any) {
    setEditForm({
      nombre: r.nombre, apellido: r.apellido, dni: r.dni, tipo: r.tipo,
      vehiculo_tipo: r.vehiculo_tipo || "", patente: r.patente || "",
      lote_destino: r.lote_destino || "", observaciones: r.observaciones || "",
    });
    setEditingId(r.id);
    setError(null); setSuccess(null);
  }

  async function handleUpdate() {
    if (!editingId) return;
    setError(null); setSuccess(null);
    const fd = new FormData();
    Object.entries(editForm).forEach(([k, v]) => fd.append(k, v));
    const result = await updateRegistro(editingId, null, fd);
    if (result.error) { setError(result.error); } else { setSuccess(result.message!); setEditingId(null); fetchData(); }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este registro?")) return;
    await deleteRegistro(id);
    fetchData();
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Informes</h1>
        <a href="/" style={styles.backLink}>← Volver</a>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}

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
                  <th style={styles.th}>Autorizó</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} style={styles.tr}>
                    {editingId === r.id ? (
                      <>
                        <td style={styles.td}>{new Date(r.fecha_hora).toLocaleString("es-AR")}</td>
                        <td style={styles.td}>
                          <select value={editForm.tipo} onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })} style={{ ...styles.input, padding: "0.3rem", fontSize: "0.8rem" }}>
                            <option value="visita">Visita</option>
                            <option value="proveedor">Proveedor</option>
                            <option value="residente">Residente</option>
                          </select>
                        </td>
                        <td style={styles.td}>
                          <input value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} style={{ ...styles.input, padding: "0.3rem", fontSize: "0.8rem" }} />
                          <input value={editForm.apellido} onChange={(e) => setEditForm({ ...editForm, apellido: e.target.value })} style={{ ...styles.input, padding: "0.3rem", fontSize: "0.8rem" }} />
                        </td>
                        <td style={styles.td}><input value={editForm.dni} onChange={(e) => setEditForm({ ...editForm, dni: e.target.value })} style={{ ...styles.input, padding: "0.3rem", fontSize: "0.8rem" }} /></td>
                        <td style={styles.td}><input value={editForm.lote_destino} onChange={(e) => setEditForm({ ...editForm, lote_destino: e.target.value })} style={{ ...styles.input, padding: "0.3rem", fontSize: "0.8rem" }} /></td>
                        <td style={styles.td}>
                          <select value={editForm.vehiculo_tipo} onChange={(e) => setEditForm({ ...editForm, vehiculo_tipo: e.target.value })} style={{ ...styles.input, padding: "0.3rem", fontSize: "0.8rem" }}>
                            <option value="">—</option>
                            <option value="si">Sí</option>
                            <option value="no">No</option>
                          </select>
                        </td>
                        <td style={styles.td}><input value={editForm.patente} onChange={(e) => setEditForm({ ...editForm, patente: e.target.value })} style={{ ...styles.input, padding: "0.3rem", fontSize: "0.8rem" }} /></td>
                        <td style={styles.td}>—</td>
                        <td style={styles.td}>
                          <div style={{ display: "flex", gap: "0.25rem" }}>
                            <button onClick={handleUpdate} style={{ padding: "0.25rem 0.5rem", borderRadius: "0.35rem", border: "none", background: "#16a34a", color: "#fff", fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>OK</button>
                            <button onClick={() => setEditingId(null)} style={{ padding: "0.25rem 0.5rem", borderRadius: "0.35rem", border: "1px solid #d1d5db", background: "#f8fafc", fontSize: "0.75rem", cursor: "pointer" }}>X</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={styles.td}>{new Date(r.fecha_hora).toLocaleString("es-AR")}</td>
                        <td style={styles.td}>
                          <span style={r.es_entrada ? styles.badgeEntry : styles.badgeExit}>
                            {r.es_entrada ? "ENTRADA" : "SALIDA"}
                          </span>
                        </td>
                        <td style={styles.td}>{r.nombre} {r.apellido}</td>
                        <td style={styles.td}>{r.dni}</td>
                        <td style={styles.td}>{r.lote_destino || "—"}</td>
                        <td style={styles.td}>{r.vehiculo_tipo === "si" ? "Sí" : r.vehiculo_tipo === "no" ? "No" : "—"}</td>
                        <td style={styles.td}>{r.patente || "—"}</td>
                        <td style={styles.td}>
                          {r.autorizado_por ? (
                            <span style={styles.autorizoBadge}>
                              {r.autorizado_por}
                              {r.autorizacion_medio ? ` · ${r.autorizacion_medio}` : ""}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: "flex", gap: "0.25rem" }}>
                            <button onClick={() => fillEditForm(r)} style={{ padding: "0.25rem 0.5rem", borderRadius: "0.35rem", border: "1px solid #fef3c7", background: "#fefce8", color: "#a16207", fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>Editar</button>
                            <button onClick={() => handleDelete(r.id)} style={{ padding: "0.25rem 0.5rem", borderRadius: "0.35rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>X</button>
                          </div>
                        </td>
                      </>
                    )}
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
  autorizoBadge: { padding: "0.15rem 0.5rem", borderRadius: "0.25rem", background: "#fff7ed", color: "#9a3412", fontWeight: 600, fontSize: "0.75rem", border: "1px solid #fed7aa" },
  error: { padding: "0.7rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600, marginBottom: "1rem" },
  success: { padding: "0.7rem", borderRadius: "0.75rem", background: "#ecfdf5", color: "#059669", fontWeight: 600, marginBottom: "1rem" },
};
