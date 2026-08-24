"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { confirmInvitacion, getAutorizadoByToken } from "@/app/actions";

function ConfirmContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [state, action, pending] = useActionState(async () => confirmInvitacion(token), null);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Confirmación de Ingreso</h1>
        {token ? (
          <>
            {state?.success ? (
              <div style={styles.success}>{state.message}</div>
            ) : state?.error ? (
              <div style={styles.error}>{state.error}</div>
            ) : (
              <form action={action}>
                <p style={styles.text}>Hacé clic en el botón para confirmar tu ingreso al barrio.</p>
                <button type="submit" disabled={pending} style={styles.confirmBtn}>
                  {pending ? "Confirmando..." : "Confirmar Ingreso"}
                </button>
              </form>
            )}
          </>
        ) : (
          <div style={styles.error}>Link inválido.</div>
        )}
      </div>
    </div>
  );
}

export default function InviteConfirmPage() {
  return (
    <Suspense fallback={<div style={styles.container}><p>Cargando...</p></div>}>
      <ConfirmContent />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", background: "#f1f5f9" },
  card: { background: "#fff", borderRadius: "1rem", padding: "2rem", maxWidth: 500, width: "100%", border: "1px solid #e2e8f0", boxShadow: "0 12px 30px rgba(0,0,0,0.08)" },
  title: { fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: "0 0 1rem", textAlign: "center" as const },
  text: { color: "#475569", textAlign: "center" as const, marginBottom: "1.25rem" },
  confirmBtn: { width: "100%", padding: "0.95rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, fontSize: "1rem", cursor: "pointer" },
  success: { padding: "1rem", borderRadius: "0.75rem", background: "#ecfdf5", color: "#059669", fontWeight: 600, textAlign: "center" as const },
  error: { padding: "1rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600, textAlign: "center" as const },
};
