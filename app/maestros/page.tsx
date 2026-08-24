"use client";

import { useActionState, useState, useEffect } from "react";
import {
  getResidentes, createResidente, deleteResidente,
  getAutorizados, createAutorizado, deleteAutorizado,
  createInvitacion,
} from "@/app/actions";

export default function MaestrosPage() {
  const [tab, setTab] = useState<"residentes" | "autorizados" | "invitaciones">("residentes");
  const [residentes, setResidentes] = useState<any[]>([]);
  const [autorizados, setAutorizados] = useState<any[]>([]);
  const [resState, resAction, resPending] = useActionState(createResidente, null);
  const [authState, authAction, authPending] = useActionState(createAutorizado, null);
  const [invState, invAction, invPending] = useActionState(createInvitacion, null);

  const loadData = async () => {
    const [r, a] = await Promise.all([getResidentes(), getAutorizados()]);
    setResidentes(r);
    setAutorizados(a);
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (resState?.success) { loadData(); } }, [resState]);
  useEffect(() => { if (authState?.success) { loadData(); } }, [authState]);
  useEffect(() => { if (invState?.success) { loadData(); } }, [invState]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Maestros</h1>
        <a href="/" style={styles.backLink}>← Volver</a>
      </header>

      <div style={styles.tabs}>
        <button onClick={() => setTab("residentes")} style={tab === "residentes" ? styles.tabActive : styles.tabInactive}>Residentes</button>
        <button onClick={() => setTab("autorizados")} style={tab === "autorizados" ? styles.tabActive : styles.tabInactive}>Autorizados</button>
        <button onClick={() => setTab("invitaciones")} style={tab === "invitaciones" ? styles.tabActive : styles.tabInactive}>Invitaciones</button>
      </div>

      {tab === "residentes" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Nuevo Residente</h2>
          {resState?.error && <div style={styles.error}>{resState.error}</div>}
          {resState?.success && <div style={styles.success}>{resState.message}</div>}
          <form action={resAction} style={styles.form}>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Nombre</label><input name="nombre" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Apellido</label><input name="apellido" required style={styles.input} /></div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Lote</label><input name="lote" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>DNI</label><input name="dni" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Teléfono</label><input name="telefono" style={styles.input} /></div>
            </div>
            <button type="submit" disabled={resPending} style={styles.submitBtn}>{resPending ? "Guardando..." : "Guardar Residente"}</button>
          </form>
          <h3 style={styles.listTitle}>Residentes ({residentes.length})</h3>
          {residentes.map((r) => (
            <div key={r.id} style={styles.listItem}>
              <div><strong>{r.apellido}, {r.nombre}</strong> — Lote {r.lote} — DNI {r.dni}</div>
              <button onClick={async () => { await deleteResidente(r.id); loadData(); }} style={styles.deleteBtn}>Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {tab === "autorizados" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Nuevo Autorizado</h2>
          {authState?.error && <div style={styles.error}>{authState.error}</div>}
          {authState?.success && <div style={styles.success}>{authState.message}</div>}
          <form action={authAction} style={styles.form}>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Nombre</label><input name="nombre" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Apellido</label><input name="apellido" required style={styles.input} /></div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>DNI</label><input name="dni" required style={styles.input} /></div>
              <div style={styles.field}>
                <label style={styles.label}>Tipo</label>
                <select name="tipo" style={styles.input}>
                  <option value="permanente">Permanente</option>
                  <option value="habitual">Habitual</option>
                </select>
              </div>
              <div style={styles.field}><label style={styles.label}>Lote</label><input name="lote" style={styles.input} /></div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Patente</label><input name="patente" style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Observaciones</label><input name="observaciones" style={styles.input} /></div>
            </div>
            <button type="submit" disabled={authPending} style={styles.submitBtn}>{authPending ? "Guardando..." : "Guardar Autorizado"}</button>
          </form>
          <h3 style={styles.listTitle}>Autorizados ({autorizados.length})</h3>
          {autorizados.map((a) => (
            <div key={a.id} style={styles.listItem}>
              <div>
                <strong>{a.apellido}, {a.nombre}</strong> — DNI {a.dni} — {a.tipo}
                {a.lote && ` — Lote ${a.lote}`}
                {a.residente_nombre && ` — Residente: ${a.residente_nombre}`}
              </div>
              <button onClick={async () => { await deleteAutorizado(a.id); loadData(); }} style={styles.deleteBtn}>Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {tab === "invitaciones" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Nueva Invitación Única</h2>
          <p style={styles.helper}>Creá la invitación y enviá el link por WhatsApp al visitante para que cargue sus datos.</p>
          {invState?.error && <div style={styles.error}>{invState.error}</div>}
          {invState?.success && (
            <div style={styles.success}>
              <div>{invState.message}</div>
              {invState.whatsappLink && (
                <a href={invState.whatsappLink} target="_blank" rel="noopener noreferrer" style={styles.whatsappBtn}>
                  Enviar por WhatsApp
                </a>
              )}
            </div>
          )}
          <form action={invAction} style={styles.form}>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Nombre</label><input name="nombre" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Apellido</label><input name="apellido" required style={styles.input} /></div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>DNI</label><input name="dni" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Lote</label><input name="lote" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Residente que invita</label><input name="residente_nombre" required style={styles.input} /></div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Patente</label><input name="patente" style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Observaciones</label><input name="observaciones" style={styles.input} /></div>
            </div>
            <button type="submit" disabled={invPending} style={styles.submitBtn}>{invPending ? "Creando..." : "Crear Invitación"}</button>
          </form>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" },
  title: { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  backLink: { color: "#2563eb", textDecoration: "none", fontWeight: 600 },
  tabs: { display: "flex", gap: "0.5rem", marginBottom: "1.25rem" },
  tabActive: { padding: "0.7rem 1.2rem", borderRadius: "0.75rem", border: "none", background: "#0f172a", color: "#fff", fontWeight: 700, cursor: "pointer" },
  tabInactive: { padding: "0.7rem 1.2rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", color: "#475569", fontWeight: 700, cursor: "pointer" },
  card: { background: "#fff", borderRadius: "1rem", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" },
  cardTitle: { fontSize: "1.2rem", fontWeight: 800, margin: "0 0 1rem", color: "#0f172a" },
  form: { display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" },
  formRow: { display: "flex", gap: "0.75rem", flexWrap: "wrap" as const },
  field: { display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1, minWidth: 150 },
  label: { fontSize: "0.85rem", fontWeight: 700, color: "#374151" },
  input: { padding: "0.75rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "0.95rem", outline: "none" },
  submitBtn: { padding: "0.85rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, cursor: "pointer", alignSelf: "flex-start" },
  error: { padding: "0.7rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600 },
  success: { padding: "0.7rem", borderRadius: "0.75rem", background: "#ecfdf5", color: "#059669", fontWeight: 600 },
  helper: { fontSize: "0.9rem", color: "#64748b", marginBottom: "1rem" },
  listTitle: { fontSize: "1rem", fontWeight: 700, margin: "0 0 0.75rem", color: "#334155" },
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.75rem", borderRadius: "0.5rem", background: "#f8fafc", border: "1px solid #f1f5f9", marginBottom: "0.4rem", fontSize: "0.9rem" },
  deleteBtn: { padding: "0.35rem 0.7rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" },
  whatsappBtn: { display: "inline-block", marginTop: "0.5rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", background: "#25d366", color: "#fff", fontWeight: 700, textDecoration: "none" },
};
