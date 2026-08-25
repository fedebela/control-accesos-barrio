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
        <button type="button" onClick={() => fileRef.current?.click()} style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", background: "#f8fafc", cursor: "pointer" }}>Seleccionar archivo</button>
        <button type="button" onClick={startCamera} style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", background: "#f8fafc", cursor: "pointer" }}>Usar cámara</button>
        {value && <button type="button" onClick={() => onChange("")} style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", cursor: "pointer" }}>Quitar</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} style={{ display: "none" }} />
      {cameraMode && (
        <div style={{ marginBottom: "0.5rem" }}>
          <video ref={videoRef} autoPlay playsInline style={{ width: 100, height: 100, borderRadius: "0.5rem", border: "1px solid #d1d5db", objectFit: "cover" }} />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <button type="button" onClick={capture} style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem", borderRadius: "0.5rem", border: "none", background: "#16a34a", color: "#fff", cursor: "pointer" }}>Capturar</button>
            <button type="button" onClick={stopCamera} style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem", borderRadius: "0.5rem", border: "none", background: "#94a3b8", color: "#fff", cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}
      {value && !cameraMode && (
        <img src={value} alt="Foto" style={{ width: 60, height: 60, borderRadius: "0.5rem", objectFit: "cover", border: "1px solid #e2e8f0" }} />
      )}
    </div>
  );
}

export default function MaestrosPage() {
  const [tab, setTab] = useState<"residentes" | "autorizados" | "invitaciones">("residentes");
  const [residentes, setResidentes] = useState<any[]>([]);
  const [autorizados, setAutorizados] = useState<any[]>([]);
  const [resState, resAction, resPending] = useActionState(createResidente, null);
  const [authState, authAction, authPending] = useActionState(createAutorizado, null);
  const [invState, invAction, invPending] = useActionState(createInvitacion, null);

  const [editingR, setEditingR] = useState<number | null>(null);
  const [rFoto, setRFoto] = useState("");
  const [rRol, setRRol] = useState("propietario");
  const [editingA, setEditingA] = useState<number | null>(null);
  const [aFoto, setAFoto] = useState("");

  const loadData = async () => {
    const [r, a] = await Promise.all([getResidentes(), getAutorizados()]);
    setResidentes(r);
    setAutorizados(a);
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (resState?.success) { loadData(); setEditingR(null); setRFoto(""); setRRol("propietario"); } }, [resState]);
  useEffect(() => { if (authState?.success) { loadData(); setEditingA(null); setAFoto(""); } }, [authState]);
  useEffect(() => { if (invState?.success) { loadData(); } }, [invState]);

  function startEditR(r: any) {
    setEditingR(r.id);
    setRFoto(r.foto_url || "");
    setRRol(r.rol || "propietario");
  }

  function startEditA(a: any) {
    setEditingA(a.id);
    setAFoto(a.foto_url || "");
  }

  function buildResidenteFormData(fd: FormData) {
    fd.append("rol", rRol);
    fd.append("foto_url", rFoto);
    return fd;
  }

  function buildAutorizadoFormData(fd: FormData) {
    fd.append("foto_url", aFoto);
    return fd;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Maestros</h1>
        <a href="/" style={styles.backLink}>← Volver</a>
      </header>

      <div style={styles.tabs}>
        <button onClick={() => { setTab("residentes"); setEditingR(null); }} style={tab === "residentes" ? styles.tabActive : styles.tabInactive}>Residentes</button>
        <button onClick={() => { setTab("autorizados"); setEditingA(null); }} style={tab === "autorizados" ? styles.tabActive : styles.tabInactive}>Autorizados</button>
        <button onClick={() => setTab("invitaciones")} style={tab === "invitaciones" ? styles.tabActive : styles.tabInactive}>Invitaciones</button>
      </div>

      {tab === "residentes" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>{editingR ? "Editar Residente" : "Nuevo Residente"}</h2>
          {resState?.error && <div style={styles.error}>{resState.error}</div>}
          {resState?.success && <div style={styles.success}>{resState.message}</div>}
          <form action={(fd) => { buildResidenteFormData(fd); if (editingR) { updateResidente(editingR, null, fd).then(r => { if (r.success) { loadData(); setEditingR(null); setRFoto(""); setRRol("propietario"); } }); } else { resAction(fd); } }} style={styles.form}>
            <PhotoInput value={rFoto} onChange={setRFoto} label="Foto del residente" />
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Nombre</label><input name="nombre" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Apellido</label><input name="apellido" required style={styles.input} /></div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}><label style={styles.label}>Lote</label><input name="lote" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>DNI</label><input name="dni" required style={styles.input} /></div>
              <div style={styles.field}><label style={styles.label}>Teléfono</label><input name="telefono" style={styles.input} /></div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Rol</label>
              <select name="rol" value={rRol} onChange={(e) => setRRol(e.target.value)} style={styles.input}>
                <option value="propietario">Propietario</option>
                <option value="inquilino">Inquilino</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" disabled={resPending} style={styles.submitBtn}>{resPending ? "Guardando..." : editingR ? "Guardar cambios" : "Guardar Residente"}</button>
              {editingR && <button type="button" onClick={() => { setEditingR(null); setRFoto(""); setRRol("propietario"); }} style={{ padding: "0.85rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", fontWeight: 700, cursor: "pointer" }}>Cancelar</button>}
            </div>
          </form>
          <h3 style={styles.listTitle}>Residentes ({residentes.length})</h3>
          {residentes.map((r) => (
            <div key={r.id} style={styles.listItem}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
                {r.foto_url && <img src={r.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: "0.35rem", objectFit: "cover" }} />}
                <div>
                  <strong>{r.apellido}, {r.nombre}</strong> — Lote {r.lote} — DNI {r.dni}
                  <span style={{ fontSize: "0.8rem", color: "#64748b", marginLeft: "0.5rem" }}>({r.rol === "inquilino" ? "Inquilino" : "Propietario"})</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button onClick={() => startEditR(r)} style={{ padding: "0.35rem 0.5rem", borderRadius: "0.5rem", border: "1px solid #fef3c7", background: "#fefce8", color: "#a16207", fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>Editar</button>
                <button onClick={async () => { await deleteResidente(r.id); loadData(); }} style={styles.deleteBtn}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "autorizados" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>{editingA ? "Editar Autorizado" : "Nuevo Autorizado"}</h2>
          {authState?.error && <div style={styles.error}>{authState.error}</div>}
          {authState?.success && <div style={styles.success}>{authState.message}</div>}
          <form action={(fd) => { buildAutorizadoFormData(fd); if (editingA) { updateAutorizado(editingA, null, fd).then(r => { if (r.success) { loadData(); setEditingA(null); setAFoto(""); } }); } else { authAction(fd); } }} style={styles.form}>
            <PhotoInput value={aFoto} onChange={setAFoto} label="Foto del autorizado" />
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
              <div style={styles.field}>
                <label style={styles.label}>Tiene vehículo</label>
                <select name="vehiculo_tipo" style={styles.input}>
                  <option value="">Seleccionar...</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div style={styles.field}><label style={styles.label}>Patente</label><input name="patente" style={styles.input} placeholder="Ingresar patente" /></div>
              <div style={styles.field}><label style={styles.label}>Observaciones</label><input name="observaciones" style={styles.input} /></div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" disabled={authPending} style={styles.submitBtn}>{authPending ? "Guardando..." : editingA ? "Guardar cambios" : "Guardar Autorizado"}</button>
              {editingA && <button type="button" onClick={() => { setEditingA(null); setAFoto(""); }} style={{ padding: "0.85rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", fontWeight: 700, cursor: "pointer" }}>Cancelar</button>}
            </div>
          </form>
          <h3 style={styles.listTitle}>Autorizados ({autorizados.length})</h3>
          {autorizados.map((a) => (
            <div key={a.id} style={styles.listItem}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
                {a.foto_url && <img src={a.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: "0.35rem", objectFit: "cover" }} />}
                <div>
                  <strong>{a.apellido}, {a.nombre}</strong> — DNI {a.dni} — {a.tipo}
                  {a.lote && ` — Lote ${a.lote}`}
                  {a.residente_nombre && ` — Residente: ${a.residente_nombre}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button onClick={() => startEditA(a)} style={{ padding: "0.35rem 0.5rem", borderRadius: "0.5rem", border: "1px solid #fef3c7", background: "#fefce8", color: "#a16207", fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>Editar</button>
                <button onClick={async () => { await deleteAutorizado(a.id); loadData(); }} style={styles.deleteBtn}>Eliminar</button>
              </div>
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
