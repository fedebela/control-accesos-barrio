"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMisAutorizados, buscarEnMiLote, autorizarDesdeResidente, revocarDesdeResidente,
  type PersonaDeMiLote,
} from "@/app/actions";
import { getSesionActual, cerrarSesion, cambiarMiClave, type SesionActual } from "@/app/actions-auth";
import { etiquetaRubro } from "@/lib/constantes";

export default function ResidentePage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<SesionActual | null>(null);
  const [autorizadas, setAutorizadas] = useState<PersonaDeMiLote[]>([]);
  const [cargando, setCargando] = useState(true);

  // La busqueda no arranca con nada cargado a proposito: el historial de
  // visitas del lote no tiene que quedar a la vista con solo abrir la app.
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<PersonaDeMiLote[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [busco, setBusco] = useState(false);

  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [tipo, setTipo] = useState<"temporal" | "permanente">("temporal");
  const [msg, setMsg] = useState<any>(null);
  const [verClave, setVerClave] = useState(false);

  const [estado, action, pendiente] = useActionState(autorizarDesdeResidente, null);
  const [claveState, claveAction, clavePending] = useActionState(cambiarMiClave, null);

  const cargar = async () => {
    setCargando(true);
    const [s, a] = await Promise.all([getSesionActual(), getMisAutorizados()]);
    setSesion(s);
    setAutorizadas(a);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (!estado?.success) return;
    setSeleccion([]);
    setResultados([]);
    setBusqueda("");
    setBusco(false);
    cargar();
  }, [estado]);

  async function buscar() {
    const q = busqueda.trim();
    if (q.length < 3) return;
    setBuscando(true);
    setResultados(await buscarEnMiLote(q));
    setBusco(true);
    setBuscando(false);
  }

  const alternar = (dni: string) =>
    setSeleccion((s) => (s.includes(dni) ? s.filter((x) => x !== dni) : [...s, dni]));

  if (cargando) {
    return <div style={styles.contenedor}><p style={styles.cargando}>Cargando…</p></div>;
  }

  return (
    <div style={styles.contenedor}>
      <header style={styles.encabezado}>
        <div>
          <h1 style={styles.titulo}>Mis autorizaciones</h1>
          <p style={styles.subtitulo}>
            {sesion?.descripcion || sesion?.usuario}
            {sesion?.lote ? ` · Lote ${sesion.lote}` : ""}
          </p>
        </div>
        <div style={styles.accionesEncabezado}>
          <button type="button" onClick={() => setVerClave((v) => !v)} style={styles.btnSuave}>
            Mi contraseña
          </button>
          <button
            type="button"
            onClick={async () => { await cerrarSesion(); router.replace("/login"); }}
            style={styles.btnSalir}
          >
            Salir
          </button>
        </div>
      </header>

      {verClave && (
        <form action={claveAction} style={styles.tarjeta}>
          <h2 style={styles.tarjetaTitulo}>Cambiar mi contraseña</h2>
          {claveState?.error && <div style={styles.error}>{claveState.error}</div>}
          {claveState?.success && <div style={styles.exito}>{claveState.message}</div>}
          <div style={styles.fila}>
            <input name="clave_actual" type="password" required placeholder="Actual" style={styles.input} />
            <input name="clave_nueva" type="password" required minLength={8} maxLength={8} placeholder="Nueva (8 caracteres)" style={styles.input} />
            <input name="clave_repetir" type="password" required minLength={8} maxLength={8} placeholder="Repetir nueva" style={styles.input} />
          </div>
          <button type="submit" disabled={clavePending} style={styles.btnPrincipal}>
            {clavePending ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </form>
      )}

      {estado?.error && <div style={styles.error}>{estado.error}</div>}
      {estado?.success && <div style={styles.exito}>{estado.message}</div>}
      {msg?.error && <div style={styles.error}>{msg.error}</div>}
      {msg?.success && <div style={styles.exito}>{msg.message}</div>}

      {/* ---------- Buscador ---------- */}
      <div style={styles.tarjeta}>
        <h2 style={styles.tarjetaTitulo}>Autorizar a alguien</h2>
        <p style={styles.ayuda}>
          Buscá por nombre, apellido, DNI o patente entre las personas que ya
          visitaron tu lote. Si alguien nunca vino, la primera vez tiene que
          registrarse en la guardia.
        </p>

        <div style={styles.filaBusqueda}>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
            placeholder="Nombre, DNI o patente…"
            style={styles.buscador}
          />
          <button
            type="button"
            onClick={buscar}
            disabled={buscando || busqueda.trim().length < 3}
            style={styles.btnBuscar}
          >
            {buscando ? "…" : "Buscar"}
          </button>
        </div>

        {busqueda.trim().length > 0 && busqueda.trim().length < 3 && (
          <p style={styles.vacio}>Escribí al menos 3 letras o números.</p>
        )}

        {busco && resultados.length === 0 && (
          <p style={styles.vacio}>
            No se encontró a nadie con ese dato entre quienes visitaron tu lote.
          </p>
        )}

        {resultados.length > 0 && (
          <div style={styles.lista}>
            {resultados.map((p) => {
              const elegida = seleccion.includes(p.dni);
              return (
                <button
                  key={p.dni}
                  type="button"
                  onClick={() => alternar(p.dni)}
                  style={elegida ? styles.itemElegido : styles.item}
                >
                  <div style={styles.persona}>
                    {p.foto_url
                      ? <img src={p.foto_url} alt="" style={styles.foto} />
                      : <div style={styles.fotoVacia}>—</div>}
                    <div style={{ textAlign: "left" }}>
                      <strong>{p.apellido}, {p.nombre}</strong>
                      {p.autorizadoAqui && <span style={styles.chipYa}>Ya autorizado</span>}
                      <div style={styles.meta}>
                        DNI {p.dni}
                        {p.subtipo ? ` · ${etiquetaRubro(p.subtipo)}` : p.tipo === "visita" ? " · Visita" : ""}
                        {p.patente ? ` · ${p.patente}` : ""}
                      </div>
                      <div style={styles.metaChica}>
                        {p.visitas === 1 ? "1 visita" : `${p.visitas} visitas`}
                        {" · última "}
                        {new Date(p.ultimaVisita).toLocaleDateString("es-AR")}
                      </div>
                    </div>
                  </div>
                  <span style={elegida ? styles.tildeOn : styles.tilde}>{elegida ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- Autorizadas hoy ---------- */}
      <div style={styles.tarjeta}>
        <h2 style={styles.tarjetaTitulo}>
          Con acceso habilitado {autorizadas.length > 0 && <span style={styles.contador}>{autorizadas.length}</span>}
        </h2>

        {autorizadas.length === 0 ? (
          <p style={styles.vacio}>
            Todavía no autorizaste a nadie. Buscá arriba a quien quieras habilitar
            para que entre sin necesidad de llamarte.
          </p>
        ) : (
          autorizadas.map((p) => (
            <div key={p.dni} style={styles.itemAutorizado}>
              <div style={styles.persona}>
                {p.foto_url
                  ? <img src={p.foto_url} alt="" style={styles.foto} />
                  : <div style={styles.fotoVacia}>—</div>}
                <div>
                  <strong>{p.apellido}, {p.nombre}</strong>
                  <span style={p.tipoAutorizacion === "permanente" ? styles.chipPermanente : styles.chipTemporal}>
                    {p.tipoAutorizacion === "permanente" ? "Permanente" : "Una sola vez"}
                  </span>
                  <div style={styles.meta}>
                    DNI {p.dni}
                    {p.subtipo ? ` · ${etiquetaRubro(p.subtipo)}` : ""}
                    {p.patente ? ` · ${p.patente}` : ""}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`¿Quitar la autorización de ${p.nombre} ${p.apellido}?`)) return;
                  const r = await revocarDesdeResidente(p.dni);
                  setMsg(r);
                  cargar();
                }}
                style={styles.btnQuitar}
              >
                Quitar
              </button>
            </div>
          ))
        )}
      </div>

      {/* ---------- Barra de accion ---------- */}
      {seleccion.length > 0 && (
        <form action={action} style={styles.barraAccion}>
          {seleccion.map((d) => <input key={d} type="hidden" name="dni" value={d} />)}
          <input type="hidden" name="tipo" value={tipo} />

          <div style={styles.barraTexto}>
            {seleccion.length === 1 ? "1 persona seleccionada" : `${seleccion.length} personas seleccionadas`}
          </div>

          <div style={styles.opcionesTipo}>
            <button
              type="button"
              onClick={() => setTipo("temporal")}
              style={tipo === "temporal" ? styles.opcionOn : styles.opcion}
            >
              Una sola vez
            </button>
            <button
              type="button"
              onClick={() => setTipo("permanente")}
              style={tipo === "permanente" ? styles.opcionOn : styles.opcion}
            >
              Permanente
            </button>
          </div>

          <p style={styles.barraAyuda}>
            {tipo === "temporal"
              ? "Entra una vez y vuelve a necesitar tu autorización."
              : "Puede entrar siempre, hasta que le quites el acceso."}
          </p>

          <div style={styles.barraBotones}>
            <button type="submit" disabled={pendiente} style={styles.btnPrincipal}>
              {pendiente ? "Autorizando…" : "Autorizar"}
            </button>
            <button type="button" onClick={() => setSeleccion([])} style={styles.btnSuave}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  contenedor: { maxWidth: 640, margin: "0 auto", padding: "1rem 0.9rem 8rem" },
  cargando: { color: "#94a3b8", textAlign: "center", padding: "3rem 0" },

  encabezado: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "1.1rem", flexWrap: "wrap" },
  titulo: { fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  subtitulo: { fontSize: "0.88rem", color: "#64748b", margin: "0.2rem 0 0", fontWeight: 600 },
  accionesEncabezado: { display: "flex", gap: "0.4rem" },

  tarjeta: { background: "#fff", borderRadius: "0.9rem", padding: "1.1rem", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.05)", marginBottom: "1rem" },
  tarjetaTitulo: { fontSize: "1.05rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.7rem", display: "flex", alignItems: "center", gap: "0.5rem" },
  contador: { background: "#16a34a", color: "#fff", fontSize: "0.78rem", fontWeight: 800, borderRadius: "999px", minWidth: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 0.4rem" },
  ayuda: { fontSize: "0.85rem", color: "#64748b", margin: "0 0 0.85rem", lineHeight: 1.55 },
  vacio: { fontSize: "0.9rem", color: "#94a3b8", margin: 0, lineHeight: 1.55 },

  filaBusqueda: { display: "flex", gap: "0.45rem", marginBottom: "0.7rem" },
  buscador: { flex: 1, minWidth: 0, padding: "0.8rem", borderRadius: "0.7rem", border: "1px solid #d1d5db", fontSize: "1rem", outline: "none", boxSizing: "border-box" },
  btnBuscar: { padding: "0.8rem 1.1rem", borderRadius: "0.7rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "0.92rem", cursor: "pointer", whiteSpace: "nowrap" },

  lista: { display: "flex", flexDirection: "column", gap: "0.4rem" },
  item: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", padding: "0.65rem 0.75rem", borderRadius: "0.6rem", background: "#f8fafc", border: "1px solid #e2e8f0", cursor: "pointer", width: "100%", font: "inherit", textAlign: "left" },
  itemElegido: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", padding: "0.65rem 0.75rem", borderRadius: "0.6rem", background: "#ecfdf5", border: "2px solid #16a34a", cursor: "pointer", width: "100%", font: "inherit", textAlign: "left" },
  itemAutorizado: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", padding: "0.65rem 0.75rem", borderRadius: "0.6rem", background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: "0.4rem", flexWrap: "wrap" },

  persona: { display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, minWidth: 0 },
  foto: { width: 42, height: 42, borderRadius: "0.4rem", objectFit: "cover", flexShrink: 0 },
  fotoVacia: { width: 42, height: 42, borderRadius: "0.4rem", background: "#e2e8f0", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  meta: { fontSize: "0.8rem", color: "#64748b", marginTop: "0.12rem" },
  metaChica: { fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.1rem" },

  chipPermanente: { marginLeft: "0.45rem", padding: "0.1rem 0.5rem", borderRadius: "999px", fontSize: "0.68rem", fontWeight: 800, background: "#dcfce7", color: "#166534" },
  chipTemporal: { marginLeft: "0.45rem", padding: "0.1rem 0.5rem", borderRadius: "999px", fontSize: "0.68rem", fontWeight: 800, background: "#fef3c7", color: "#92400e" },
  chipYa: { marginLeft: "0.45rem", padding: "0.1rem 0.5rem", borderRadius: "999px", fontSize: "0.68rem", fontWeight: 800, background: "#dcfce7", color: "#166534" },

  tilde: { width: 24, height: 24, borderRadius: "50%", border: "2px solid #cbd5e1", flexShrink: 0 },
  tildeOn: { width: 24, height: 24, borderRadius: "50%", background: "#16a34a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 },

  barraAccion: { position: "fixed", left: 0, right: 0, bottom: 0, background: "#0f172a", padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.55rem", boxShadow: "0 -8px 24px rgba(0,0,0,0.25)" },
  barraTexto: { color: "#fff", fontWeight: 700, fontSize: "0.92rem" },
  barraAyuda: { color: "#cbd5e1", fontSize: "0.8rem", margin: 0, lineHeight: 1.45 },
  barraBotones: { display: "flex", gap: "0.5rem" },
  opcionesTipo: { display: "flex", gap: "0.4rem" },
  opcion: { flex: 1, padding: "0.6rem", borderRadius: "0.55rem", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#cbd5e1", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer" },
  opcionOn: { flex: 1, padding: "0.6rem", borderRadius: "0.55rem", border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: "0.88rem", cursor: "pointer" },

  fila: { display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" },
  input: { flex: 1, minWidth: 140, padding: "0.7rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" },

  btnPrincipal: { flex: 1, padding: "0.85rem", borderRadius: "0.6rem", border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: "0.98rem", cursor: "pointer" },
  btnSuave: { padding: "0.55rem 0.85rem", borderRadius: "0.55rem", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" },
  btnSalir: { padding: "0.55rem 0.85rem", borderRadius: "0.55rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" },
  btnQuitar: { padding: "0.45rem 0.8rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" },

  error: { padding: "0.75rem", borderRadius: "0.6rem", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.85rem" },
  exito: { padding: "0.75rem", borderRadius: "0.6rem", background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.85rem" },
};
