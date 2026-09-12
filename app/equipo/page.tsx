"use client";

import { useActionState, useEffect, useState } from "react";
import {
  abrirPanelEquipos, autorizarEsteEquipo, cambiarEstadoEquipo, cambiarClaveEquipos,
  getAuditoria,
  type Dispositivo, type EventoAuditoria,
} from "@/app/actions-auth";
import { ETIQUETAS_AUDITORIA, ACCIONES_SENSIBLES } from "@/lib/auditoria-constantes";

/**
 * Administracion de equipos autorizados.
 *
 * No esta en Maestros a proposito: no la maneja la guardia ni el supervisor.
 * Tiene su propia clave, separada de la de gestion, para que dar de alta una
 * maquina nueva sea una decision de quien mantiene el sistema.
 */
export default function EquipoPage() {
  const [clave, setClave] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<any>(null);
  const [verClave, setVerClave] = useState(false);

  const [altaState, altaAction, altaPending] = useActionState(autorizarEsteEquipo, null);
  const [claveState, claveAction, clavePending] = useActionState(cambiarClaveEquipos, null);

  async function entrar() {
    if (!clave) return;
    setVerificando(true);
    setError(null);
    const r = await abrirPanelEquipos(clave);
    if (r.error) setError(r.error);
    else {
      setAbierto(true);
      setDispositivos(r.dispositivos || []);
    }
    setVerificando(false);
  }

  const recargar = async () => {
    const r = await abrirPanelEquipos(clave);
    if (!r.error) setDispositivos(r.dispositivos || []);
  };

  useEffect(() => { if (altaState?.success) recargar(); }, [altaState]);

  const esteEquipo = dispositivos.find((d) => d.esteEquipo);
  const activos = dispositivos.filter((d) => d.activo).length;

  // ---------------- Puerta ----------------
  if (!abierto) {
    return (
      <div style={styles.pantalla}>
        <div style={styles.caja}>
          <div style={styles.marca}>
            <h1 style={styles.titulo}>Equipos autorizados</h1>
            <p style={styles.barrio}>Registro de Accesos · Altos de la Horqueta</p>
          </div>

          <p style={styles.ayuda}>
            Esta pantalla define desde qué computadoras se puede operar el puesto de
            guardia. Requiere la clave de equipos, distinta de la de gestión.
          </p>

          <div style={styles.campo}>
            <label style={styles.label}>Clave de equipos</label>
            <input
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); entrar(); } }}
              autoFocus
              style={styles.input}
              placeholder="8 caracteres"
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="button" onClick={entrar} disabled={verificando || !clave} style={styles.boton}>
            {verificando ? "Verificando…" : "Entrar"}
          </button>
        </div>
      </div>
    );
  }

  // ---------------- Panel ----------------
  return (
    <div style={styles.contenedor}>
      <header style={styles.encabezado}>
        <div>
          <h1 style={styles.tituloPanel}>Equipos autorizados</h1>
          <p style={styles.barrio}>Registro de Accesos · Altos de la Horqueta</p>
        </div>
        <a href="/" style={styles.enlace}>Ir a la aplicación →</a>
      </header>

      <div style={activos === 0 ? styles.tarjetaAviso : styles.tarjetaOk}>
        {activos === 0 ? (
          <>
            <strong>El control está desactivado.</strong>
            <p style={styles.avisoTexto}>
              No hay ningún equipo autorizado, así que la aplicación se puede abrir desde
              cualquier computadora. Al autorizar el primero, el control se activa y el
              resto queda bloqueado.
            </p>
          </>
        ) : (
          <>
            <strong>El control está activo.</strong>
            <p style={styles.avisoTexto}>
              Solo se puede operar el puesto desde {activos === 1 ? "el equipo autorizado" : `los ${activos} equipos autorizados`}.
              Los residentes no están afectados: entran desde su celular.
            </p>
          </>
        )}
      </div>

      {/* ---------- Este equipo ---------- */}
      <div style={styles.tarjeta}>
        <h2 style={styles.tarjetaTitulo}>Este equipo</h2>

        {esteEquipo?.activo ? (
          <p style={styles.ok}>
            Ya está autorizado como <strong>{esteEquipo.nombre}</strong>.
          </p>
        ) : (
          <>
            <p style={styles.ayuda}>
              {esteEquipo
                ? "Este equipo figura dado de baja. Volvé a autorizarlo si corresponde."
                : "Esta computadora todavía no está autorizada."}
            </p>
            <form action={altaAction} style={styles.fila}>
              <input type="hidden" name="clave" value={clave} />
              <input
                name="nombre"
                required
                defaultValue={esteEquipo?.nombre || ""}
                placeholder="Ej: PC guardia principal"
                style={styles.input}
              />
              <button type="submit" disabled={altaPending} style={styles.botonChico}>
                {altaPending ? "Autorizando…" : "Autorizar"}
              </button>
            </form>
          </>
        )}

        {altaState?.error && <div style={styles.error}>{altaState.error}</div>}
        {altaState?.success && <div style={styles.exito}>{altaState.message}</div>}
      </div>

      {/* ---------- Listado ---------- */}
      <div style={styles.tarjeta}>
        <h2 style={styles.tarjetaTitulo}>Todos los equipos ({dispositivos.length})</h2>

        {msg?.error && <div style={styles.error}>{msg.error}</div>}
        {msg?.success && <div style={styles.exito}>{msg.message}</div>}

        {dispositivos.length === 0 ? (
          <p style={styles.ayuda}>Todavía no hay equipos cargados.</p>
        ) : (
          dispositivos.map((d) => (
            <div key={d.id} style={{ ...styles.item, opacity: d.activo ? 1 : 0.55 }}>
              <div>
                <strong>{d.nombre}</strong>
                {d.esteEquipo && <span style={styles.chipEste}>Este equipo</span>}
                {!d.activo && <span style={styles.chipBaja}>De baja</span>}
                <div style={styles.meta}>
                  Alta {new Date(d.creado_en).toLocaleDateString("es-AR")}
                  {d.ultimo_uso ? ` · Último uso ${new Date(d.ultimo_uso).toLocaleString("es-AR")}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (d.activo && !confirm(`¿Dar de baja "${d.nombre}"? No va a poder operar el puesto.`)) return;
                  const r = await cambiarEstadoEquipo(d.id, !d.activo, clave);
                  setMsg(r);
                  if (r.success && r.dispositivos) setDispositivos(r.dispositivos);
                }}
                style={d.activo ? styles.btnBaja : styles.btnAlta}
              >
                {d.activo ? "Dar de baja" : "Reactivar"}
              </button>
            </div>
          ))
        )}
      </div>

      {/* ---------- Actividad ---------- */}
      <Actividad clave={clave} />

      {/* ---------- Clave ---------- */}
      <div style={styles.tarjeta}>
        <button type="button" onClick={() => setVerClave((v) => !v)} style={styles.linkBoton}>
          {verClave ? "Ocultar" : "Cambiar la clave de equipos"}
        </button>

        {verClave && (
          <form action={claveAction} style={styles.formClave}>
            <p style={styles.ayuda}>
              Son 8 caracteres, letras y números. Es la clave que protege esta pantalla.
            </p>
            {claveState?.error && <div style={styles.error}>{claveState.error}</div>}
            {claveState?.success && <div style={styles.exito}>{claveState.message}</div>}
            <div style={styles.fila}>
              <input name="clave_actual" type="password" required placeholder="Actual" style={styles.input} />
              <input name="clave_nueva" type="password" required minLength={8} maxLength={8} placeholder="Nueva" style={styles.input} />
              <input name="clave_repetir" type="password" required minLength={8} maxLength={8} placeholder="Repetir" style={styles.input} />
            </div>
            <button type="submit" disabled={clavePending} style={styles.botonChico}>
              {clavePending ? "Guardando…" : "Cambiar clave"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Actividad registrada: autenticacion y administracion.
 * Los movimientos de entrada y salida no aparecen acá; están en Informes.
 */
function Actividad({ clave }: { clave: string }) {
  const hoy = () => new Date().toISOString().slice(0, 10);
  const haceUnaSemana = () =>
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [desde, setDesde] = useState(haceUnaSemana());
  const [hasta, setHasta] = useState(hoy());
  const [accion, setAccion] = useState("");
  const [usuario, setUsuario] = useState("");
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  async function consultar() {
    setCargando(true);
    setError(null);
    const r = await getAuditoria(clave, { desde, hasta, accion, usuario });
    if (r.error) setError(r.error);
    else setEventos(r.eventos || []);
    setCargando(false);
  }

  useEffect(() => {
    if (abierto && eventos.length === 0) consultar();
  }, [abierto]);

  const fallidos = eventos.filter((e) => e.accion === "login_fallido").length;

  return (
    <div style={styles.tarjeta}>
      <button type="button" onClick={() => setAbierto((v) => !v)} style={styles.linkBoton}>
        {abierto ? "Ocultar actividad" : "Ver actividad del sistema"}
      </button>

      {abierto && (
        <div style={{ marginTop: "0.9rem" }}>
          <p style={styles.ayuda}>
            Quién entró, quién desbloqueó la gestión y quién tocó los maestros. Las
            entradas y salidas de personas no están acá: van en Informes.
          </p>

          <div style={styles.fila}>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={styles.input} />
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={styles.input} />
            <select value={accion} onChange={(e) => setAccion(e.target.value)} style={styles.input}>
              <option value="">Todas las acciones</option>
              {Object.entries(ETIQUETAS_AUDITORIA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Usuario"
              style={styles.input}
            />
            <button type="button" onClick={consultar} disabled={cargando} style={styles.botonChico}>
              {cargando ? "Buscando…" : "Buscar"}
            </button>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {fallidos > 0 && (
            <div style={styles.alerta}>
              Hay {fallidos} intento{fallidos > 1 ? "s" : ""} de inicio de sesión fallido
              {fallidos > 1 ? "s" : ""} en el período.
            </div>
          )}

          {eventos.length === 0 && !cargando ? (
            <p style={styles.ayuda}>Sin actividad registrada en el período.</p>
          ) : (
            <div style={styles.tablaWrap}>
              <table style={styles.tabla}>
                <thead>
                  <tr>
                    <th style={styles.th}>Fecha</th>
                    <th style={styles.th}>Acción</th>
                    <th style={styles.th}>Usuario</th>
                    <th style={styles.th}>Equipo</th>
                    <th style={styles.th}>IP</th>
                    <th style={styles.th}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((e) => (
                    <tr key={e.id} style={styles.tr}>
                      <td style={styles.td}>{new Date(e.fecha_hora).toLocaleString("es-AR")}</td>
                      <td style={styles.td}>
                        <span style={ACCIONES_SENSIBLES.has(e.accion) ? styles.chipSensible : styles.chipNormal}>
                          {ETIQUETAS_AUDITORIA[e.accion] || e.accion}
                        </span>
                      </td>
                      <td style={styles.td}>{e.usuario.trim() || "—"}</td>
                      <td style={styles.td}>{e.equipo || "—"}</td>
                      <td style={styles.td}>{e.ip || "—"}</td>
                      <td style={styles.tdDetalle}>{e.detalle || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {eventos.length >= 500 && (
                <p style={styles.ayuda}>
                  Se muestran los 500 eventos más recientes. Acotá el período para ver el resto.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pantalla: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", background: "linear-gradient(160deg, #0f172a 0%, #1e293b 100%)" },
  caja: { background: "#fff", borderRadius: "1.1rem", padding: "2rem 1.75rem", width: "100%", maxWidth: 400, boxShadow: "0 20px 50px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", gap: "1rem" },
  marca: { textAlign: "center" },
  titulo: { fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  tituloPanel: { fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  barrio: { fontSize: "0.85rem", color: "#64748b", margin: "0.3rem 0 0", fontWeight: 600 },

  contenedor: { maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem 4rem" },
  encabezado: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" },
  enlace: { color: "#2563eb", textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" },

  tarjeta: { background: "#fff", borderRadius: "0.9rem", padding: "1.15rem", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.05)", marginBottom: "1rem" },
  tarjetaOk: { background: "#ecfdf5", borderRadius: "0.9rem", padding: "1rem 1.15rem", border: "1px solid #a7f3d0", color: "#065f46", marginBottom: "1rem" },
  tarjetaAviso: { background: "#fffbeb", borderRadius: "0.9rem", padding: "1rem 1.15rem", border: "1px solid #fcd34d", color: "#92400e", marginBottom: "1rem" },
  avisoTexto: { fontSize: "0.88rem", margin: "0.35rem 0 0", lineHeight: 1.55 },
  tarjetaTitulo: { fontSize: "1.05rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.7rem" },

  ayuda: { fontSize: "0.88rem", color: "#64748b", lineHeight: 1.55, margin: "0 0 0.85rem" },
  ok: { fontSize: "0.92rem", color: "#166534", fontWeight: 600, margin: 0 },

  campo: { display: "flex", flexDirection: "column", gap: "0.3rem" },
  label: { fontSize: "0.85rem", fontWeight: 700, color: "#374151" },
  fila: { display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" },
  formClave: { marginTop: "0.85rem" },
  input: { flex: 1, minWidth: 150, padding: "0.75rem", borderRadius: "0.6rem", border: "1px solid #d1d5db", fontSize: "0.98rem", outline: "none", boxSizing: "border-box" },

  boton: { padding: "0.9rem", borderRadius: "0.7rem", border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: "1rem", cursor: "pointer" },
  botonChico: { padding: "0.75rem 1.2rem", borderRadius: "0.6rem", border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: "0.92rem", cursor: "pointer", whiteSpace: "nowrap" },
  linkBoton: { background: "none", border: "none", color: "#2563eb", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", padding: 0 },

  item: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.7rem 0.8rem", borderRadius: "0.6rem", background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: "0.45rem", flexWrap: "wrap" },
  meta: { fontSize: "0.78rem", color: "#64748b", marginTop: "0.15rem" },
  chipEste: { marginLeft: "0.5rem", padding: "0.1rem 0.5rem", borderRadius: "999px", fontSize: "0.68rem", fontWeight: 800, background: "#dbeafe", color: "#1e40af" },
  chipBaja: { marginLeft: "0.5rem", padding: "0.1rem 0.5rem", borderRadius: "999px", fontSize: "0.68rem", fontWeight: 800, background: "#fee2e2", color: "#991b1b" },

  btnBaja: { padding: "0.45rem 0.85rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" },
  btnAlta: { padding: "0.45rem 0.85rem", borderRadius: "0.5rem", border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" },

  alerta: { padding: "0.7rem 0.85rem", borderRadius: "0.6rem", background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", fontSize: "0.88rem", fontWeight: 700, marginBottom: "0.8rem" },
  tablaWrap: { overflowX: "auto" },
  tabla: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "0.45rem 0.6rem", borderBottom: "2px solid #e2e8f0", fontSize: "0.76rem", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "0.45rem 0.6rem", fontSize: "0.82rem", color: "#334155", whiteSpace: "nowrap" },
  tdDetalle: { padding: "0.45rem 0.6rem", fontSize: "0.8rem", color: "#64748b", maxWidth: 260 },
  chipNormal: { padding: "0.1rem 0.45rem", borderRadius: "0.25rem", background: "#f1f5f9", color: "#475569", fontWeight: 600, fontSize: "0.72rem", whiteSpace: "nowrap" },
  chipSensible: { padding: "0.1rem 0.45rem", borderRadius: "0.25rem", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.72rem", whiteSpace: "nowrap" },

  error: { padding: "0.7rem 0.85rem", borderRadius: "0.6rem", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: "0.88rem", fontWeight: 600, marginTop: "0.6rem" },
  exito: { padding: "0.7rem 0.85rem", borderRadius: "0.6rem", background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", fontSize: "0.88rem", fontWeight: 600, marginTop: "0.6rem" },
};
