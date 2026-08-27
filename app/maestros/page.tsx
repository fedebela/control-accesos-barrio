"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import {
  getResidentes, createResidente, updateResidente, deleteResidente,
  getAutorizados, deleteAutorizado,
  createInvitacion,
  searchPersona, promoverAPermanente, revocarAutorizacion,
  type ResultadoBusqueda, type EstadoAutorizacion,
} from "@/app/actions";

// ---------------------------------------------------------------- PhotoInput

function PhotoInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraMode, setCameraMode] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    return () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [stream]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 300;
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = (h * max) / w; w = max; }
        else if (h > max) { w = (w * max) / h; h = max; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        onChange(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 300, height: 300 } });
      setStream(s); setCameraMode(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch { alert("No se pudo acceder a la cámara."); }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    onChange(canvas.toDataURL("image/jpeg", 0.7));
    stopCamera();
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    setStream(null); setCameraMode(false);
  }

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <label style={styles.label}>{label}</label>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", marginTop: "0.25rem" }}>
        <button type="button" onClick={() => fileRef.current?.click()} style={styles.miniBtn}>Seleccionar archivo</button>
        <button type="button" onClick={startCamera} style={styles.miniBtn}>Usar cámara</button>
        {value && <button type="button" onClick={() => onChange("")} style={styles.miniBtnDanger}>Quitar</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
      {cameraMode && (
        <div style={{ marginBottom: "0.5rem" }}>
          <video ref={videoRef} autoPlay playsInline style={{ width: 120, height: 120, borderRadius: "0.5rem", border: "1px solid #d1d5db", objectFit: "cover" }} />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <button type="button" onClick={capture} style={{ ...styles.miniBtn, background: "#16a34a", color: "#fff", border: "none" }}>Capturar</button>
            <button type="button" onClick={stopCamera} style={{ ...styles.miniBtn, background: "#94a3b8", color: "#fff", border: "none" }}>Cancelar</button>
          </div>
        </div>
      )}
      {value && !cameraMode && (
        <img src={value} alt="Foto" style={{ width: 60, height: 60, borderRadius: "0.5rem", objectFit: "cover", border: "1px solid #e2e8f0" }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Badges

const BADGES: Record<EstadoAutorizacion, { text: string; color: string; bg: string }> = {
  residente:     { text: "RESIDENTE",                           color: "#166534", bg: "#dcfce7" },
  permanente:    { text: "AUTORIZADO PERMANENTE",               color: "#166534", bg: "#dcfce7" },
  temporal:      { text: "AUTORIZADO TEMPORAL",                 color: "#166534", bg: "#dcfce7" },
  pendiente:     { text: "AUTORIZACIÓN PENDIENTE",              color: "#92400e", bg: "#fef3c7" },
  usada:         { text: "NO AUTORIZADO · invitación ya usada", color: "#991b1b", bg: "#fee2e2" },
  vencida:       { text: "NO AUTORIZADO · invitación vencida",  color: "#991b1b", bg: "#fee2e2" },
  previo:        { text: "NO AUTORIZADO · con registro previo", color: "#991b1b", bg: "#fee2e2" },
  no_registrado: { text: "NO REGISTRADO",                       color: "#991b1b", bg: "#fee2e2" },
};

function Badge({ estado }: { estado: EstadoAutorizacion }) {
  const b = BADGES[estado];
  return <span style={{ ...styles.badge, background: b.bg, color: b.color }}>{b.text}</span>;
}

function estadoDeFila(a: any): EstadoAutorizacion {
  if (a.tipo === "permanente") return "permanente";
  if (a.usada) return "usada";
  if (!a.autorizado) return "pendiente";
  return "temporal";
}

// ---------------------------------------------------------------- Página

export default function MaestrosPage() {
  const [tab, setTab] = useState<"residentes" | "autorizados" | "invitaciones">("residentes");
  const [residentes, setResidentes] = useState<any[]>([]);
  const [autorizados, setAutorizados] = useState<any[]>([]);

  const loadData = async () => {
    const [r, a] = await Promise.all([getResidentes(), getAutorizados()]);
    setResidentes(r);
    setAutorizados(a);
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Maestros</h1>
        <a href="/" style={styles.backLink}>← Volver</a>
      </header>

      <div style={styles.tabs}>
        <button onClick={() => setTab("residentes")} style={tab === "residentes" ? styles.tabActive : styles.tabInactive}>Residentes</button>
        <button onClick={() => setTab("autorizados")} style={tab === "autorizados" ? styles.tabActive : styles.tabInactive}>Autorizados permanentes</button>
        <button onClick={() => setTab("invitaciones")} style={tab === "invitaciones" ? styles.tabActive : styles.tabInactive}>Invitaciones</button>
      </div>

      {tab === "residentes" && <TabResidentes residentes={residentes} reload={loadData} />}
      {tab === "autorizados" && <TabAutorizados autorizados={autorizados} reload={loadData} />}
      {tab === "invitaciones" && <TabInvitaciones reload={loadData} />}
    </div>
  );
}

// ============================ RESIDENTES ============================

function TabResidentes({ residentes, reload }: { residentes: any[]; reload: () => Promise<void> }) {
  const [resState, resAction, resPending] = useActionState(createResidente, null);
  const [editR, setEditR] = useState<any>(null);
  const [rFoto, setRFoto] = useState("");
  const [msg, setMsg] = useState<any>(null);

  useEffect(() => { if (resState?.success) { reload(); cancelar(); } }, [resState]);

  function editar(r: any) { setEditR(r); setRFoto(r.foto_url || ""); setMsg(null); }
  function cancelar() { setEditR(null); setRFoto(""); }

  async function submit(fd: FormData) {
    fd.set("foto_url", rFoto);
    if (editR) {
      const r = await updateResidente(editR.id, null, fd);
      setMsg(r);
      if (r.success) { await reload(); cancelar(); }
    } else {
      resAction(fd);
    }
  }

  const aviso = msg || resState;

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>{editR ? "Editar Residente" : "Nuevo Residente"}</h2>
      <p style={styles.helper}>Personas que viven en el barrio. Siempre tienen ingreso habilitado.</p>
      {aviso?.error && <div style={styles.error}>{aviso.error}</div>}
      {aviso?.success && <div style={styles.success}>{aviso.message}</div>}

      <form key={editR?.id ?? "nuevo"} action={submit} style={styles.form}>
        <PhotoInput value={rFoto} onChange={setRFoto} label="Foto del residente" />
        <div style={styles.formRow}>
          <div style={styles.field}><label style={styles.label}>Nombre *</label><input name="nombre" required defaultValue={editR?.nombre || ""} style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Apellido *</label><input name="apellido" required defaultValue={editR?.apellido || ""} style={styles.input} /></div>
        </div>
        <div style={styles.formRow}>
          <div style={styles.field}><label style={styles.label}>Lote *</label><input name="lote" required defaultValue={editR?.lote || ""} style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>DNI *</label><input name="dni" required inputMode="numeric" defaultValue={editR?.dni || ""} style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Teléfono</label><input name="telefono" defaultValue={editR?.telefono || ""} style={styles.input} /></div>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Rol</label>
          <select name="rol" defaultValue={editR?.rol || "propietario"} style={styles.input}>
            <option value="propietario">Propietario</option>
            <option value="inquilino">Inquilino</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" disabled={resPending} style={styles.submitBtn}>{resPending ? "Guardando…" : editR ? "Guardar cambios" : "Guardar Residente"}</button>
          {editR && <button type="button" onClick={cancelar} style={styles.cancelBtn}>Cancelar</button>}
        </div>
      </form>

      <h3 style={styles.listTitle}>Residentes ({residentes.length})</h3>
      {residentes.length === 0 && <p style={styles.empty}>Todavía no hay residentes cargados.</p>}
      {residentes.map((r) => (
        <div key={r.id} style={styles.listItem}>
          <div style={styles.listMain}>
            {r.foto_url ? <img src={r.foto_url} alt="" style={styles.thumb} /> : <div style={styles.thumbEmpty}>—</div>}
            <div>
              <strong>{r.apellido}, {r.nombre}</strong>
              <div style={styles.listMeta}>
                Lote {r.lote} · DNI {r.dni} · {r.rol === "inquilino" ? "Inquilino" : "Propietario"}
                {r.telefono ? ` · ${r.telefono}` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button onClick={() => editar(r)} style={styles.editBtn}>Editar</button>
            <button onClick={async () => { if (confirm(`¿Eliminar a ${r.nombre} ${r.apellido}?`)) { await deleteResidente(r.id); reload(); } }} style={styles.deleteBtn}>Eliminar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================ AUTORIZADOS ============================

function TabAutorizados({ autorizados, reload }: { autorizados: any[]; reload: () => Promise<void> }) {
  const [dni, setDni] = useState("");
  const [resultado, setResultado] = useState<ResultadoBusqueda | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState<any>(null);
  const [estado, action, pending] = useActionState(promoverAPermanente, null);

  useEffect(() => {
    if (estado?.success) {
      reload();
      setResultado(null);
      setDni("");
    }
  }, [estado]);

  async function buscar() {
    const limpio = dni.trim();
    if (!limpio) return;
    setBuscando(true);
    setMsg(null);
    const r = await searchPersona(limpio);
    setResultado(r);
    setDni(limpio);
    setBuscando(false);
  }

  function limpiar() {
    setDni("");
    setResultado(null);
    setMsg(null);
  }

  const persona = resultado?.persona;
  const est = resultado?.estado;
  const puedePromover = Boolean(persona) && est !== "residente" && est !== "permanente";

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Autorizados permanentes</h2>
      <p style={styles.helper}>
        Buscá por DNI para <strong>consultar el estado</strong> de una persona o para
        <strong> marcarla como autorizada permanente</strong>. Los datos y la foto se toman
        de lo que quedó grabado en su primer ingreso: no hace falta volver a cargarlos.
      </p>

      <div style={styles.searchRow}>
        <input
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          placeholder="Número de DNI…"
          inputMode="numeric"
          style={styles.input}
        />
        <button type="button" onClick={buscar} disabled={buscando || !dni.trim()} style={styles.searchBtn}>
          {buscando ? "Buscando…" : "Buscar"}
        </button>
        {resultado && <button type="button" onClick={limpiar} style={styles.cancelBtn}>Limpiar</button>}
      </div>

      {estado?.error && <div style={styles.error}>{estado.error}</div>}
      {estado?.success && <div style={styles.success}>{estado.message}</div>}
      {msg?.error && <div style={styles.error}>{msg.error}</div>}
      {msg?.success && <div style={styles.success}>{msg.message}</div>}

      {/* ---- Sin datos ---- */}
      {resultado && !persona && (
        <div style={styles.preview}>
          <Badge estado="no_registrado" />
          <p style={styles.previewDanger}>
            El DNI {dni} no existe en el sistema. Para poder marcarlo como autorizado
            permanente, primero tiene que registrar un ingreso desde la pantalla principal
            usando <strong>Carga manual</strong>.
          </p>
        </div>
      )}

      {/* ---- Persona encontrada ---- */}
      {resultado && persona && (
        <div style={styles.preview}>
          <Badge estado={est!} />

          <div style={styles.previewBody}>
            {persona.foto_url
              ? <img src={persona.foto_url} alt="" style={styles.previewFoto} />
              : <div style={styles.previewFotoEmpty}>Sin foto</div>}

            <div style={{ flex: 1, minWidth: 200 }}>
              <Row label="Nombre" value={`${persona.nombre} ${persona.apellido}`} />
              <Row label="DNI" value={persona.dni} />
              <Row label="Tipo" value={persona.tipo} />
              <Row label="Lote" value={persona.lote} />
              <Row label="Patente" value={persona.patente} />
              <Row label="Observaciones" value={persona.observaciones} />
              {resultado.ultimoRegistro && (
                <Row
                  label="Último ingreso"
                  value={`${new Date(resultado.ultimoRegistro.fecha_hora).toLocaleString("es-AR")} · ${resultado.ultimoRegistro.es_entrada ? "Entrada" : "Salida"}`}
                />
              )}
            </div>
          </div>

          {est === "residente" && (
            <p style={styles.previewOk}>Es residente del barrio: ya tiene ingreso permanente.</p>
          )}

          {est === "permanente" && (
            <div style={styles.acciones}>
              <p style={styles.previewOk}>Ya está marcada como autorizada permanente.</p>
              <button
                type="button"
                style={styles.deleteBtnLg}
                onClick={async () => {
                  if (!confirm(`¿Quitar la autorización permanente de ${persona.nombre} ${persona.apellido}?`)) return;
                  const r = await revocarAutorizacion(persona.dni);
                  setMsg(r);
                  if (r.success) { await reload(); setResultado(null); setDni(""); }
                }}
              >
                Revocar autorización permanente
              </button>
            </div>
          )}

          {puedePromover && (
            <form action={action} style={styles.confirmForm}>
              <input type="hidden" name="dni" value={persona.dni} />
              <h4 style={styles.confirmTitle}>Marcar como autorizado permanente</h4>
              {est === "pendiente" || est === "temporal" || est === "usada" || est === "vencida" ? (
                <p style={styles.previewWarn}>
                  Tiene una invitación cargada. Al confirmar, se reemplaza por una
                  autorización permanente.
                </p>
              ) : null}

              <div style={styles.formRow}>
                <div style={styles.field}>
                  <label style={styles.label}>Lote que autoriza *</label>
                  <input name="lote" required defaultValue={persona.lote || ""} style={styles.input} placeholder="Ej: 142" />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Patente habitual</label>
                  <input name="patente" defaultValue={persona.patente || ""} style={styles.input} placeholder="Opcional" />
                </div>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Observaciones</label>
                <input name="observaciones" defaultValue={persona.observaciones || ""} style={styles.input} placeholder="Ej: jardinero, viene los martes" />
              </div>

              <button type="submit" disabled={pending} style={styles.submitBtn}>
                {pending ? "Guardando…" : "Confirmar autorizado permanente"}
              </button>
            </form>
          )}
        </div>
      )}

      <h3 style={styles.listTitle}>Autorizaciones vigentes ({autorizados.length})</h3>
      {autorizados.length === 0 && <p style={styles.empty}>Todavía no hay autorizaciones cargadas.</p>}
      {autorizados.map((a) => (
        <div key={a.id} style={styles.listItem}>
          <div style={styles.listMain}>
            {a.foto_url ? <img src={a.foto_url} alt="" style={styles.thumb} /> : <div style={styles.thumbEmpty}>—</div>}
            <div>
              <strong>{a.apellido}, {a.nombre}</strong>
              <Badge estado={estadoDeFila(a)} />
              <div style={styles.listMeta}>
                DNI {a.dni}
                {a.lote ? ` · Lote ${a.lote}` : ""}
                {a.patente ? ` · ${a.patente}` : ""}
                {a.residente_nombre ? ` · Invita: ${a.residente_nombre}` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button
              onClick={() => { setDni(a.dni); searchPersona(a.dni).then(setResultado); }}
              style={styles.editBtn}
            >
              Ver
            </button>
            <button
              onClick={async () => { if (confirm(`¿Eliminar la autorización de ${a.nombre} ${a.apellido}?`)) { await deleteAutorizado(a.id); reload(); } }}
              style={styles.deleteBtn}
            >
              Eliminar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================ INVITACIONES ============================

function TabInvitaciones({ reload }: { reload: () => Promise<void> }) {
  const [invState, invAction, invPending] = useActionState(createInvitacion, null);
  const [unSoloUso, setUnSoloUso] = useState(true);

  useEffect(() => { if (invState?.success) reload(); }, [invState]);

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Nueva Invitación</h2>
      <p style={styles.helper}>
        Para visitas puntuales. Generá el link y enviáselo al residente por WhatsApp.
        La persona queda <strong>PENDIENTE</strong> hasta que el residente confirme.
      </p>
      {invState?.error && <div style={styles.error}>{invState.error}</div>}
      {invState?.success && (
        <div style={styles.success}>
          <div>{invState.message}</div>
          {invState.inviteLink && <div style={styles.linkBox}>{invState.inviteLink}</div>}
          {invState.whatsappLink && (
            <a href={invState.whatsappLink} target="_blank" rel="noopener noreferrer" style={styles.whatsappBtn}>
              Enviar por WhatsApp
            </a>
          )}
        </div>
      )}

      <form action={invAction} style={styles.form}>
        <div style={styles.formRow}>
          <div style={styles.field}><label style={styles.label}>Nombre *</label><input name="nombre" required style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Apellido *</label><input name="apellido" required style={styles.input} /></div>
        </div>
        <div style={styles.formRow}>
          <div style={styles.field}><label style={styles.label}>DNI *</label><input name="dni" required inputMode="numeric" style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Lote *</label><input name="lote" required style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Residente que invita *</label><input name="residente_nombre" required style={styles.input} /></div>
        </div>
        <div style={styles.formRow}>
          <div style={styles.field}><label style={styles.label}>Patente</label><input name="patente" style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Vence el</label><input name="fecha_expiracion" type="date" style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Observaciones</label><input name="observaciones" style={styles.input} /></div>
        </div>
        <label style={styles.checkboxLabel}>
          <input type="checkbox" name="un_solo_uso" checked={unSoloUso} onChange={(e) => setUnSoloUso(e.target.checked)} />
          Autorización por <strong>única vez</strong> — se consume al registrar la primera entrada
        </label>
        <button type="submit" disabled={invPending} style={styles.submitBtn}>{invPending ? "Creando…" : "Crear Invitación"}</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- Auxiliares

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}:</span>
      <span>{value || "—"}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" },
  title: { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  backLink: { color: "#2563eb", textDecoration: "none", fontWeight: 600 },
  tabs: { display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" },
  tabActive: { padding: "0.7rem 1.1rem", borderRadius: "0.75rem", border: "none", background: "#0f172a", color: "#fff", fontWeight: 700, cursor: "pointer" },
  tabInactive: { padding: "0.7rem 1.1rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", color: "#475569", fontWeight: 700, cursor: "pointer" },
  card: { background: "#fff", borderRadius: "1rem", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" },
  cardTitle: { fontSize: "1.2rem", fontWeight: 800, margin: "0 0 0.4rem", color: "#0f172a" },
  helper: { fontSize: "0.9rem", color: "#64748b", marginBottom: "1rem", marginTop: 0, lineHeight: 1.5 },

  form: { display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" },
  formRow: { display: "flex", gap: "0.75rem", flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1, minWidth: 150 },
  label: { fontSize: "0.85rem", fontWeight: 700, color: "#374151" },
  input: { padding: "0.75rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "0.95rem", outline: "none", width: "100%", boxSizing: "border-box" },
  checkboxLabel: { fontSize: "0.9rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer" },

  searchRow: { display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" },
  searchBtn: { padding: "0.75rem 1.3rem", borderRadius: "0.75rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },

  preview: { background: "#f8fafc", borderRadius: "0.85rem", padding: "1rem", marginBottom: "1.25rem", border: "1px solid #e2e8f0" },
  previewBody: { display: "flex", gap: "1rem", marginTop: "0.75rem", flexWrap: "wrap" },
  previewFoto: { width: 90, height: 90, borderRadius: "0.5rem", objectFit: "cover", border: "2px solid #e2e8f0", flexShrink: 0 },
  previewFotoEmpty: { width: 90, height: 90, borderRadius: "0.5rem", background: "#fef2f2", color: "#dc2626", fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid #fecaca" },
  previewOk: { fontSize: "0.9rem", color: "#166534", fontWeight: 600, marginTop: "0.75rem" },
  previewWarn: { fontSize: "0.9rem", color: "#92400e", fontWeight: 600, marginBottom: "0.5rem" },
  previewDanger: { fontSize: "0.9rem", color: "#dc2626", fontWeight: 600, marginTop: "0.75rem", lineHeight: 1.5 },
  row: { display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.25rem 0", fontSize: "0.92rem" },
  rowLabel: { fontWeight: 600, color: "#475569", whiteSpace: "nowrap" },

  acciones: { marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e2e8f0" },
  confirmForm: { display: "flex", flexDirection: "column", gap: "0.7rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" },
  confirmTitle: { margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0f172a" },

  badge: { marginLeft: "0.5rem", padding: "0.15rem 0.6rem", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 700, display: "inline-block", verticalAlign: "middle" },

  submitBtn: { padding: "0.85rem 1.2rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, cursor: "pointer", alignSelf: "flex-start" },
  cancelBtn: { padding: "0.75rem 1.2rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  miniBtn: { fontSize: "0.8rem", padding: "0.35rem 0.65rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", background: "#f8fafc", cursor: "pointer" },
  miniBtnDanger: { fontSize: "0.8rem", padding: "0.35rem 0.65rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", cursor: "pointer" },
  editBtn: { padding: "0.35rem 0.7rem", borderRadius: "0.5rem", border: "1px solid #fde68a", background: "#fefce8", color: "#a16207", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" },
  deleteBtn: { padding: "0.35rem 0.7rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" },
  deleteBtnLg: { padding: "0.7rem 1.1rem", borderRadius: "0.75rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer" },

  error: { padding: "0.7rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600, marginBottom: "0.75rem" },
  success: { padding: "0.7rem", borderRadius: "0.75rem", background: "#ecfdf5", color: "#059669", fontWeight: 600, marginBottom: "0.75rem" },

  listTitle: { fontSize: "1rem", fontWeight: 700, margin: "1.25rem 0 0.75rem", color: "#334155" },
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "0.5rem", background: "#f8fafc", border: "1px solid #f1f5f9", marginBottom: "0.4rem", fontSize: "0.9rem", flexWrap: "wrap" },
  listMain: { display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, minWidth: 200 },
  listMeta: { fontSize: "0.8rem", color: "#64748b", marginTop: "0.15rem" },
  thumb: { width: 40, height: 40, borderRadius: "0.35rem", objectFit: "cover", flexShrink: 0 },
  thumbEmpty: { width: 40, height: 40, borderRadius: "0.35rem", background: "#e2e8f0", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },

  whatsappBtn: { display: "inline-block", marginTop: "0.5rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", background: "#25d366", color: "#fff", fontWeight: 700, textDecoration: "none" },
  linkBox: { marginTop: "0.5rem", padding: "0.5rem", background: "#f1f5f9", borderRadius: "0.5rem", fontSize: "0.8rem", color: "#334155", wordBreak: "break-all", fontWeight: 400 },
  empty: { color: "#94a3b8", fontStyle: "italic" },
};
