"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { iniciarSesion } from "@/app/actions-auth";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [estado, action, pendiente] = useActionState(iniciarSesion, null);
  const [forzar, setForzar] = useState(false);

  useEffect(() => {
    // Cada rol arranca en su pantalla.
    if (estado?.success) router.replace(estado.rol === "residente" ? "/residente" : "/");
  }, [estado, router]);

  // Al fallar por sesion ocupada se ofrece el cierre forzado.
  useEffect(() => {
    if (estado?.sesionOcupada === undefined) setForzar(false);
  }, [estado]);

  const motivo = params.get("motivo");

  return (
    <div style={styles.pantalla}>
      <div style={styles.caja}>
        <div style={styles.marca}>
          <h1 style={styles.titulo}>Registro de Accesos</h1>
          <p style={styles.barrio}>Altos de la Horqueta</p>
        </div>

        {motivo === "vencida" && (
          <div style={styles.aviso}>
            La sesión se cerró por vencimiento. Volvé a ingresar.
          </div>
        )}

        <form action={action} style={styles.form}>
          <div style={styles.campo}>
            <label style={styles.label}>Usuario</label>
            <input
              name="usuario"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
              style={styles.input}
              placeholder="guardiadia"
            />
          </div>

          <div style={styles.campo}>
            <label style={styles.label}>Contraseña</label>
            <input
              name="clave"
              type="password"
              autoComplete="current-password"
              required
              style={styles.input}
              placeholder="8 caracteres"
            />
          </div>

          {estado?.error && <div style={styles.error}>{estado.error}</div>}

          {estado?.sesionOcupada && (
            <div style={styles.bloqueForzar}>
              <label style={styles.check}>
                <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />
                Cerrar la sesión de «{estado.usuarioOcupa}» y entrar
              </label>
              <p style={styles.ayuda}>
                Usalo solo si el turno anterior se fue sin cerrar sesión.
                Requiere la clave de gestión.
              </p>
              {forzar && (
                <input
                  name="clave_gestion"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Clave de gestión (4 caracteres)"
                  style={styles.input}
                />
              )}
            </div>
          )}

          <input type="hidden" name="forzar" value={forzar ? "true" : "false"} />

          <button type="submit" disabled={pendiente} style={pendiente ? styles.botonEsperando : styles.boton}>
            {pendiente ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={styles.pantalla} />}>
      <Formulario />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pantalla: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem",
    background: "linear-gradient(160deg, #0f172a 0%, #1e293b 100%)",
  },
  caja: {
    background: "#fff",
    borderRadius: "1.1rem",
    padding: "2rem 1.75rem",
    width: "100%",
    maxWidth: 380,
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
  },
  marca: { textAlign: "center", marginBottom: "1.75rem" },
  titulo: { fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.01em" },
  barrio: { fontSize: "0.95rem", color: "#64748b", margin: "0.35rem 0 0", fontWeight: 600 },

  form: { display: "flex", flexDirection: "column", gap: "1rem" },
  campo: { display: "flex", flexDirection: "column", gap: "0.35rem" },
  label: { fontSize: "0.85rem", fontWeight: 700, color: "#374151" },
  input: {
    padding: "0.85rem",
    borderRadius: "0.7rem",
    border: "1px solid #d1d5db",
    fontSize: "1rem",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },

  boton: {
    padding: "0.95rem",
    borderRadius: "0.7rem",
    border: "none",
    background: "#16a34a",
    color: "#fff",
    fontWeight: 800,
    fontSize: "1.02rem",
    cursor: "pointer",
    marginTop: "0.25rem",
  },
  botonEsperando: {
    padding: "0.95rem",
    borderRadius: "0.7rem",
    border: "none",
    background: "#94a3b8",
    color: "#fff",
    fontWeight: 800,
    fontSize: "1.02rem",
    cursor: "wait",
    marginTop: "0.25rem",
  },

  error: {
    padding: "0.7rem 0.85rem",
    borderRadius: "0.6rem",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: "0.88rem",
    fontWeight: 600,
    lineHeight: 1.5,
  },
  aviso: {
    padding: "0.7rem 0.85rem",
    borderRadius: "0.6rem",
    background: "#fffbeb",
    border: "1px solid #fcd34d",
    color: "#92400e",
    fontSize: "0.88rem",
    fontWeight: 600,
    marginBottom: "1rem",
  },
  bloqueForzar: {
    padding: "0.85rem",
    borderRadius: "0.6rem",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  check: { fontSize: "0.88rem", color: "#334155", display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer", fontWeight: 600 },
  ayuda: { fontSize: "0.8rem", color: "#64748b", margin: 0, lineHeight: 1.45 },
};
