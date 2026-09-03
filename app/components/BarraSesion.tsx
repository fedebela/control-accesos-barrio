"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getSesionActual, cerrarSesion, desbloquearGestion, bloquearGestion,
  type SesionActual,
} from "@/app/actions-auth";

/**
 * Barra superior con la sesion del puesto.
 *
 * Maestros, informes e importacion piden una clave adicional que se ingresa
 * dentro de la misma sesion del guardia: el supervisor no entra con otro
 * usuario, desbloquea la gestion y despues la vuelve a bloquear.
 */
export default function BarraSesion({
  abrirGestion = false,
  destino = "",
}: {
  abrirGestion?: boolean;
  destino?: string;
}) {
  const router = useRouter();
  const [sesion, setSesion] = useState<SesionActual | null>(null);
  const [mostrarClave, setMostrarClave] = useState(abrirGestion);
  const [estado, action, pendiente] = useActionState(desbloquearGestion, null);

  const cargar = () => getSesionActual().then(setSesion);
  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (!estado?.success) return;
    setMostrarClave(false);
    cargar();
    router.replace(destino || "/maestros");
  }, [estado]);

  if (!sesion) return null;

  const gestion = sesion.gestionHabilitada;

  return (
    <div style={styles.barra}>
      <div style={styles.izquierda}>
        <span style={styles.punto} />
        <span style={styles.usuario}>{sesion.descripcion || sesion.usuario}</span>
        {gestion && <span style={styles.chipGestion}>Gestión desbloqueada</span>}
      </div>

      <div style={styles.derecha}>
        {gestion ? (
          <>
            <a href="/maestros" style={styles.enlace}>Maestros</a>
            <a href="/informes" style={styles.enlace}>Informes</a>
            <button
              type="button"
              onClick={async () => { await bloquearGestion(); await cargar(); router.push("/"); }}
              style={styles.btnSuave}
            >
              Bloquear
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setMostrarClave((v) => !v)} style={styles.btnSuave}>
            Maestros e informes
          </button>
        )}

        <button
          type="button"
          onClick={async () => { await cerrarSesion(); router.replace("/login"); }}
          style={styles.btnSalir}
        >
          Cerrar sesión
        </button>
      </div>

      {mostrarClave && !gestion && (
        <form action={action} style={styles.panelClave}>
          <p style={styles.panelTexto}>
            Ingresá la clave de gestión para acceder a maestros, informes e importación.
            La sesión del puesto sigue siendo la misma.
          </p>
          <div style={styles.filaClave}>
            <input
              name="clave_gestion"
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="4 caracteres"
              autoFocus
              style={styles.input}
            />
            <button type="submit" disabled={pendiente} style={styles.btnDesbloquear}>
              {pendiente ? "Verificando…" : "Desbloquear"}
            </button>
            <button type="button" onClick={() => setMostrarClave(false)} style={styles.btnSuave}>
              Cancelar
            </button>
          </div>
          {estado?.error && <div style={styles.error}>{estado.error}</div>}
        </form>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  barra: {
    background: "#0f172a",
    color: "#fff",
    borderRadius: "0.75rem",
    padding: "0.6rem 0.9rem",
    marginBottom: "1rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.6rem",
  },
  izquierda: { display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" },
  punto: { width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" },
  usuario: { fontWeight: 700, fontSize: "0.9rem" },
  chipGestion: {
    fontSize: "0.7rem",
    fontWeight: 800,
    background: "#fbbf24",
    color: "#78350f",
    padding: "0.1rem 0.5rem",
    borderRadius: "999px",
  },

  derecha: { display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" },
  enlace: { color: "#93c5fd", textDecoration: "none", fontWeight: 700, fontSize: "0.85rem", padding: "0.35rem 0.5rem" },
  btnSuave: {
    background: "rgba(255,255,255,0.12)",
    border: "none",
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: "0.82rem",
    padding: "0.4rem 0.75rem",
    borderRadius: "0.5rem",
    cursor: "pointer",
  },
  btnSalir: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.3)",
    color: "#fca5a5",
    fontWeight: 700,
    fontSize: "0.82rem",
    padding: "0.4rem 0.75rem",
    borderRadius: "0.5rem",
    cursor: "pointer",
  },

  panelClave: {
    width: "100%",
    background: "rgba(255,255,255,0.08)",
    borderRadius: "0.6rem",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  panelTexto: { fontSize: "0.82rem", color: "#cbd5e1", margin: 0, lineHeight: 1.5 },
  filaClave: { display: "flex", gap: "0.4rem", flexWrap: "wrap" },
  input: {
    padding: "0.55rem 0.7rem",
    borderRadius: "0.5rem",
    border: "1px solid #475569",
    fontSize: "0.95rem",
    outline: "none",
    width: 170,
    letterSpacing: "0.2em",
  },
  btnDesbloquear: {
    background: "#16a34a",
    border: "none",
    color: "#fff",
    fontWeight: 800,
    fontSize: "0.85rem",
    padding: "0.55rem 1rem",
    borderRadius: "0.5rem",
    cursor: "pointer",
  },
  error: {
    fontSize: "0.82rem",
    color: "#fecaca",
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: "0.5rem",
    padding: "0.45rem 0.6rem",
    fontWeight: 600,
  },
};
