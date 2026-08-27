"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import {
  getResidentes, createResidente, updateResidente, deleteResidente,
  getAutorizados, createAutorizado, updateAutorizado, deleteAutorizado,
  createInvitacion,
} from "@/app/actions";

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

function estadoInvitacion(a: any): { text: string; color: string; bg: string } {
  if (a.tipo === "permanente") return { text: "PERMANENTE", color: "#166534", bg: "#dcfce7" };
  if (a.usada) return { text: "USADA", color: "#991b1b", bg: "#fee2e2" };
  if (!a.autorizado) return { text: "PENDIENTE", color: "#92400e", bg: "#fef3c7" };
  if (a.un_solo_uso) return { text: "ÚNICA VEZ · CONFIRMADA", color: "#166534", bg: "#dcfce7" };
  return { text: "TEMPORAL · CONFIRMADA", color: "#166534", bg: "#dcfce7" };
}

export default function MaestrosPage() {
  const [tab, setTab] = useState<"residentes" | "autorizados" | "invitaciones">("residentes");
  const [residentes, setResidentes] = useState<any[]>([]);
  const [autorizados, setAutorizados] = useState<any[]>([]);
  const [resState, resAction, resPending] = useActionState(createResidente, null);
  const [authState, authAction, authPending] = useActionState(createAutorizado, null);
  const [invState, invAction, invPending] = useActionState(createInvitacion, null);

  const [editR, setEditR] = useState<any>(null);
  const [rFoto, setRFoto] = useState("");
  const [editA, setEditA] = useState<any>(null);
  const [aFoto, setAFoto] = useState("");
  const [msgR, setMsgR] = useState<any>(null);
  const [msgA, setMsgA] = useState<any>(null);
  const [unSoloUso, setUnSoloUso] = useState(true);

  const loadData = async () => {
    const [r, a] = await Promise.all([getResidentes(), getAutorizados()]);
    setResidentes(r);
    setAutorizados(a);
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (resState?.success) { loadData(); cancelR(); } }, [resState]);
  useEffect(() => { if (authState?.success) { loadData(); cancelA(); } }, [authState]);
  useEffect(() => { if (invState?.success) { loadData(); } }, [invState]);

  function startEditR(r: any) { setEditR(r); setRFoto(r.foto_url || ""); setMsgR(null); }
  function cancelR() { setEditR(null); setRFoto(""); }
  function startEditA(a: any) { setEditA(a); setAFoto(a.foto_url || ""); setMsgA(null); }
  function cancelA() { setEditA(null); setAFoto(""); }

  async function submitResidente(fd: FormData) {
    fd.set("foto_url", rFoto);
    if (editR) {
      const r = await updateResidente(editR.id, null, fd);
      setMsgR(r);
      if (r.success) { await loadData(); cancelR(); }
    } else {
      resAction(fd);
    }
  }

  async function submitAutorizado(fd: FormData) {
    fd.set("foto_url", aFoto);
    if (editA) {
      const r = await updateAutorizado(editA.id, null, fd);
      setMsgA(r);
      if (r.success) { await loadData(); cancelA(); }
    } else {
      authAction(fd);
    }
  }

  const avisoR = msgR || resState;
  const avisoA = msgA || authState;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Maestros</h1>
        <a href="/" style={styles.backLink}>← Volver</a>
      </header>

      <div style={styles.tabs}>
        <button onClick={() => { setTab("residentes"); cancelR(); }} style={tab === "residentes" ? styles.tabActive : styles.tabInactive}>Residentes</button>
        <button onClick={() => { setTab("autorizados"); cancelA(); }} style={tab === "autorizados" ? styles.tabActive : styles.tabInactive}>Autorizados permanentes</button>
        <button onClick={() => setTab("invitaciones")} style={tab === "invitaciones" ? styles.tabActive : styles.tabInactive}>Invitaciones</button>
      </div>

      {/* ============================ RESIDENTES ============================ */}
      {tab === "residentes" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>{editR ? "Editar Residente" : "Nuevo Residente"}</h2>
          <p style={styles.helper}>Personas que viven en el barrio. Siempre tienen ingreso habilitado.</p>
          {avisoR?.error && <div style={styles.error}>{avisoR.error}</div>}
          {avisoR?.success && <div style={styles.success}>{avisoR.message}</div>}

          <form key={editR?.id ?? "nuevo"} action={submitResidente} style={styles.form}>
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
              {editR && <button type="button" onClick={cancelR} style={styles.cancelBtn}>Cancelar</button>}
            </div>
          </form>

          <h3 style={styles.listTitle}>Residentes ({residentes.length})</h3>
          {residentes.length === 0 && <p style={styles.empty}>Todavía no hay residentes cargados.</p>}
          {residentes.map((r) => (
            <div key={r.id} style={styles.listItem}>
              <div style={styles.listMain}>
                {r.foto_url
                  ? <img src={r.foto_url} alt="" style={styles.thumb} />
                  : <div style={styles.thumbEmpty}>—</div>}
                <div>
                  <strong>{r.apellido}, {r.nombre}</strong>
                  <div style={styles.listMeta}>
                    Lote {r.lote} · DNI {r.dni} · {r.rol === "inquilino" ? "Inquilino" : "Propietario"}
                    {r.telefono ? ` · ${r.telefono}` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button onClick={() => startEditR(r)} style={styles.editBtn}>Editar</button>
                <button onClick={async () => { if (confirm(`¿Eliminar a ${r.nombre} ${r.apellido}?`)) { await deleteResidente(r.id); loadData(); } }} style={styles.deleteBtn}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============================ AUTORIZADOS ============================ */}
      {tab === "autorizados" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>{editA ? "Editar Autorizado" : "Nuevo Autorizado Permanente"}</h2>
          <p style={styles.helper}>
            Personas con ingreso habilitado de forma permanente (personal doméstico, jardinero, familiares).
            Para un ingreso puntual usá la solapa <strong>Invitaciones</strong>.
          </p>
          {avisoA?.error && <div style={styles.error}>{avisoA.error}</div>}
          {avisoA?.success && <div style={styles.success}>{avisoA.message}</div>}

          <form key={editA?.id ?? "nuevo"} action={submitAutorizado} style={styles.form}>
            <PhotoInput value={aFoto} onChange={setAFoto} label="Foto del autorizado" />
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Nombre *</label><input name="nombre" required defaultValue={editA?.nombre || ""} style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Apellido *</label><input name="apellido" required defaultValue={editA?.apellido || ""} style={styles.input} /></div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>DNI *</label><input name="dni" required inputMode="numeric" defaultValue={editA?.dni || ""} style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Lote que autoriza *</label><input name="lote" required defaultValue={editA?.lote || ""} style={styles.input} /></div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Patente habitual</label><input name="patente" defaultValue={editA?.patente || ""} style={styles.input} placeholder="Opcional" /></div>
              <div style={styles.field}><label style={styles.label}>Observaciones</label><input name="observaciones" defaultValue={editA?.observaciones || ""} style={styles.input} /></div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" disabled={authPending} style={styles.submitBtn}>{authPending ? "Guardando…" : editA ? "Guardar cambios" : "Guardar Autorizado"}</button>
              {editA && <button type="button" onClick={cancelA} style={styles.cancelBtn}>Cancelar</button>}
            </div>
          </form>

          <h3 style={styles.listTitle}>Autorizados e invitaciones ({autorizados.length})</h3>
          {autorizados.length === 0 && <p style={styles.empty}>Todavía no hay autorizados cargados.</p>}
          {autorizados.map((a) => {
            const est = estadoInvitacion(a);
            return (
              <div key={a.id} style={styles.listItem}>
                <div style={styles.listMain}>
                  {a.foto_url
                    ? <img src={a.foto_url} alt="" style={styles.thumb} />
                    : <div style={styles.thumbEmpty}>—</div>}
                  <div>
                    <strong>{a.apellido}, {a.nombre}</strong>
                    <span style={{ ...styles.pill, background: est.bg, color: est.color }}>{est.text}</span>
                    <div style={styles.listMeta}>
                      DNI {a.dni}
                      {a.lote ? ` · Lote ${a.lote}` : ""}
                      {a.patente ? ` · ${a.patente}` : ""}
                      {a.residente_nombre ? ` · Invita: ${a.residente_nombre}` : ""}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  <button onClick={() => startEditA(a)} style={styles.editBtn}>Editar</button>
                  <button onClick={async () => { if (confirm(`¿Eliminar la autorización de ${a.nombre} ${a.apellido}?`)) { await deleteAutorizado(a.id); loadData(); } }} style={styles.deleteBtn}>Eliminar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================ INVITACIONES ============================ */}
      {tab === "invitaciones" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Nueva Invitación</h2>
          <p style={styles.helper}>
            Generá el link y enviáselo al residente por WhatsApp. La persona queda en estado
            <strong> PENDIENTE</strong> hasta que el residente confirme desde el link.
          </p>
          {invState?.error && <div style={styles.error}>{invState.error}</div>}
          {invState?.success && (
            <div style={styles.success}>
              <div>{invState.message}</div>
              {invState.inviteLink && (
                <div style={styles.linkBox}>{invState.inviteLink}</div>
              )}
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
              <input
                type="checkbox"
                name="un_solo_uso"
                checked={unSoloUso}
                onChange={(e) => setUnSoloUso(e.target.checked)}
              />
              Autorización por <strong>única vez</strong> — se consume al registrar la primera entrada
            </label>
            <button type="submit" disabled={invPending} style={styles.submitBtn}>{invPending ? "Creando…" : "Crear Invitación"}</button>
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
  tabs: { display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" },
  tabActive: { padding: "0.7rem 1.1rem", borderRadius: "0.75rem", border: "none", background: "#0f172a", color: "#fff", fontWeight: 700, cursor: "pointer" },
  tabInactive: { padding: "0.7rem 1.1rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", color: "#475569", fontWeight: 700, cursor: "pointer" },
  card: { background: "#fff", borderRadius: "1rem", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" },
  cardTitle: { fontSize: "1.2rem", fontWeight: 800, margin: "0 0 0.4rem", color: "#0f172a" },
  form: { display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" },
  formRow: { display: "flex", gap: "0.75rem", flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1, minWidth: 150 },
  label: { fontSize: "0.85rem", fontWeight: 700, color: "#374151" },
  input: { padding: "0.75rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "0.95rem", outline: "none", width: "100%", boxSizing: "border-box" },
  checkboxLabel: { fontSize: "0.9rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer" },
  submitBtn: { padding: "0.85rem 1.2rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, cursor: "pointer", alignSelf: "flex-start" },
  cancelBtn: { padding: "0.85rem 1.2rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", fontWeight: 700, cursor: "pointer" },
  miniBtn: { fontSize: "0.8rem", padding: "0.35rem 0.65rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", background: "#f8fafc", cursor: "pointer" },
  miniBtnDanger: { fontSize: "0.8rem", padding: "0.35rem 0.65rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", cursor: "pointer" },
  error: { padding: "0.7rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600, marginBottom: "0.75rem" },
  success: { padding: "0.7rem", borderRadius: "0.75rem", background: "#ecfdf5", color: "#059669", fontWeight: 600, marginBottom: "0.75rem" },
  helper: { fontSize: "0.9rem", color: "#64748b", marginBottom: "1rem", marginTop: 0 },
  listTitle: { fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.75rem", color: "#334155" },
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "0.5rem", background: "#f8fafc", border: "1px solid #f1f5f9", marginBottom: "0.4rem", fontSize: "0.9rem", flexWrap: "wrap" },
  listMain: { display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, minWidth: 200 },
  listMeta: { fontSize: "0.8rem", color: "#64748b", marginTop: "0.15rem" },
  thumb: { width: 40, height: 40, borderRadius: "0.35rem", objectFit: "cover", flexShrink: 0 },
  thumbEmpty: { width: 40, height: 40, borderRadius: "0.35rem", background: "#e2e8f0", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  pill: { marginLeft: "0.5rem", padding: "0.1rem 0.5rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700, verticalAlign: "middle" },
  editBtn: { padding: "0.35rem 0.7rem", borderRadius: "0.5rem", border: "1px solid #fde68a", background: "#fefce8", color: "#a16207", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" },
  deleteBtn: { padding: "0.35rem 0.7rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" },
  whatsappBtn: { display: "inline-block", marginTop: "0.5rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", background: "#25d366", color: "#fff", fontWeight: 700, textDecoration: "none" },
  linkBox: { marginTop: "0.5rem", padding: "0.5rem", background: "#f1f5f9", borderRadius: "0.5rem", fontSize: "0.8rem", color: "#334155", wordBreak: "break-all", fontWeight: 400 },
  empty: { color: "#94a3b8", fontStyle: "italic" },
};
