"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useEffect, useState } from "react";
import { confirmInvitacion, getAutorizadoByToken } from "@/app/actions";

function ConfirmContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [state, action, pending] = useActionState(async () => confirmInvitacion(token), null);
  const [persona, setPersona] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!token) { setCargando(false); return; }
    getAutorizadoByToken(token)
      .then(setPersona)
      .finally(() => setCargando(false));
  }, [token]);

  if (!token) {
    return <div style={styles.card}><div style={styles.error}>Link inválido.</div></div>;
  }

  if (cargando) {
    return <div style={styles.card}><p style={styles.text}>Cargando…</p></div>;
  }

  if (!persona) {
    return <div style={styles.card}><div style={styles.error}>Esta invitación no existe o fue eliminada.</div></div>;
  }

  const yaResuelta = persona.usada || persona.autorizado;

  return (
    <div style={styles.card}>
      <h1 style={styles.title}>Confirmación de Ingreso</h1>

      <div style={styles.datos}>
        <div style={styles.row}><span style={styles.rowLabel}>Nombre</span><span>{persona.nombre} {persona.apellido}</span></div>
        <div style={styles.row}><span style={styles.rowLabel}>DNI</span><span>{persona.dni}</span></div>
        <div style={styles.row}><span style={styles.rowLabel}>Lote</span><span>{persona.lote}</span></div>
        <div style={styles.row}>
          <span style={styles.rowLabel}>Tipo</span>
          <span>{persona.un_solo_uso ? "Ingreso por única vez" : "Ingreso temporal"}</span>
        </div>
      </div>

      {state?.success ? (
        <div style={styles.success}>{state.message}</div>
      ) : state?.error ? (
        <div style={styles.error}>{state.error}</div>
      ) : persona.usada ? (
        <div style={styles.error}>Esta invitación ya fue utilizada.</div>
      ) : persona.autorizado ? (
        <div style={styles.success}>Esta invitación ya está confirmada.</div>
      ) : (
        <form action={action}>
          <p style={styles.text}>
            Al confirmar, se autoriza el ingreso de esta persona al barrio
            {persona.un_solo_uso ? " por única vez" : ""}.
          </p>
          <button type="submit" disabled={pending} style={styles.confirmBtn}>
            {pending ? "Confirmando…" : "Confirmar Ingreso"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function InviteConfirmPage() {
  return (
    <div style={styles.container}>
      <Suspense fallback={<div style={styles.card}><p style={styles.text}>Cargando…</p></div>}>
        <ConfirmContent />
      </Suspense>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", background: "#f1f5f9" },
  card: { background: "#fff", borderRadius: "1rem", padding: "2rem", maxWidth: 500, width: "100%", border: "1px solid #e2e8f0", boxShadow: "0 12px 30px rgba(0,0,0,0.08)" },
  title: { fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: "0 0 1rem", textAlign: "center" },
  datos: { background: "#f8fafc", borderRadius: "0.75rem", padding: "1rem", marginBottom: "1.25rem", border: "1px solid #e2e8f0" },
  row: { display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.3rem 0", fontSize: "0.95rem" },
  rowLabel: { fontWeight: 600, color: "#475569" },
  text: { color: "#475569", textAlign: "center", marginBottom: "1.25rem" },
  confirmBtn: { width: "100%", padding: "0.95rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, fontSize: "1rem", cursor: "pointer" },
  success: { padding: "1rem", borderRadius: "0.75rem", background: "#ecfdf5", color: "#059669", fontWeight: 600, textAlign: "center" },
  error: { padding: "1rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600, textAlign: "center" },
};
