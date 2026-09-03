"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import {
  getResidentes, createResidente, updateResidente, deleteResidente,
  getAutorizados, deleteAutorizado,
  searchPersona, buscarPersonas, autorizarPersonas, revocarAutorizacion,
  getOperadores, createOperador, updateOperador, deleteOperador,
  type ResultadoBusqueda, type EstadoAutorizacion,
} from "@/app/actions";
import {
  getUsuarios, crearUsuario, cambiarClaveUsuario, activarUsuario, cambiarClaveGestion,
  crearAccesoResidente, blanquearAccesoResidente, quitarAccesoResidente, getAccesosResidentes,
} from "@/app/actions-auth";
import BarraSesion from "@/app/components/BarraSesion";
import { TURNOS, etiquetaTurno } from "@/lib/constantes";

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
  residente:     { text: "RESIDENTE",                            color: "#166534", bg: "#dcfce7" },
  permanente:    { text: "AUTORIZADO PERMANENTE",                color: "#166534", bg: "#dcfce7" },
  temporal:      { text: "AUTORIZADO TEMPORAL · única vez",      color: "#166534", bg: "#dcfce7" },
  pendiente:     { text: "AUTORIZACIÓN PENDIENTE",               color: "#92400e", bg: "#fef3c7" },
  usada:         { text: "NO AUTORIZADO · temporal ya usada",    color: "#991b1b", bg: "#fee2e2" },
  vencida:       { text: "NO AUTORIZADO · vencida",              color: "#991b1b", bg: "#fee2e2" },
  previo:        { text: "NO AUTORIZADO",                        color: "#991b1b", bg: "#fee2e2" },
  no_registrado: { text: "NO REGISTRADO",                        color: "#991b1b", bg: "#fee2e2" },
};

function Badge({ estado }: { estado: EstadoAutorizacion }) {
  const b = BADGES[estado];
  return <span style={{ ...styles.badge, background: b.bg, color: b.color }}>{b.text}</span>;
}

function estadoDeFila(a: any): EstadoAutorizacion {
  if (a.usada) return "usada";
  if (!a.autorizado) return "pendiente";
  if (a.tipo === "permanente") return "permanente";
  return "temporal";
}

// ---------------------------------------------------------------- Página

export default function MaestrosPage() {
  const [tab, setTab] = useState<"autorizados" | "residentes" | "operadores" | "usuarios">("autorizados");
  const [residentes, setResidentes] = useState<any[]>([]);
  const [autorizados, setAutorizados] = useState<any[]>([]);
  const [operadores, setOperadores] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);

  const loadData = async () => {
    const [r, a, o, u] = await Promise.all([
      getResidentes(), getAutorizados(), getOperadores(), getUsuarios(),
    ]);
    setResidentes(r);
    setAutorizados(a);
    setOperadores(o);
    setUsuarios(u);
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div style={styles.container}>
      <BarraSesion />

      <header style={styles.header}>
        <h1 style={styles.title}>Maestros</h1>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <a href="/importar" style={styles.backLink}>Importar planilla</a>
          <a href="/" style={styles.backLink}>← Volver</a>
        </div>
      </header>

      <div style={styles.tabs}>
        <button onClick={() => setTab("autorizados")} style={tab === "autorizados" ? styles.tabActive : styles.tabInactive}>Autorizados</button>
        <button onClick={() => setTab("residentes")} style={tab === "residentes" ? styles.tabActive : styles.tabInactive}>Residentes</button>
        <button onClick={() => setTab("operadores")} style={tab === "operadores" ? styles.tabActive : styles.tabInactive}>Operadores</button>
        <button onClick={() => setTab("usuarios")} style={tab === "usuarios" ? styles.tabActive : styles.tabInactive}>Usuarios y claves</button>
      </div>

      {tab === "autorizados" && <TabAutorizados autorizados={autorizados} reload={loadData} />}
      {tab === "residentes" && <TabResidentes residentes={residentes} reload={loadData} />}
      {tab === "operadores" && <TabOperadores operadores={operadores} reload={loadData} />}
      {tab === "usuarios" && <TabUsuarios usuarios={usuarios} reload={loadData} />}
    </div>
  );
}

// ============================ USUARIOS Y CLAVES ============================

function TabUsuarios({ usuarios, reload }: { usuarios: any[]; reload: () => Promise<void> }) {
  const [crearState, crearAction, crearPending] = useActionState(crearUsuario, null);
  const [claveState, claveAction, clavePending] = useActionState(cambiarClaveUsuario, null);
  const [gestionState, gestionAction, gestionPending] = useActionState(cambiarClaveGestion, null);
  const [cambiando, setCambiando] = useState<any>(null);
  const [msg, setMsg] = useState<any>(null);

  useEffect(() => { if (crearState?.success) reload(); }, [crearState]);
  useEffect(() => { if (claveState?.success) { reload(); setCambiando(null); } }, [claveState]);

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Usuarios del puesto</h2>
      <p style={styles.helper}>
        Con estos usuarios se entra a la aplicación. Solo puede haber
        <strong> una sesión abierta a la vez</strong>: para que entre otro turno, el
        anterior tiene que cerrar sesión. La contraseña es de {8} caracteres,
        letras y números.
      </p>

      {(msg || crearState)?.error && <div style={styles.error}>{(msg || crearState).error}</div>}
      {(msg || crearState)?.success && <div style={styles.success}>{(msg || crearState).message}</div>}
      {claveState?.error && <div style={styles.error}>{claveState.error}</div>}
      {claveState?.success && <div style={styles.success}>{claveState.message}</div>}

      {usuarios.map((u) => (
        <div key={u.id} style={{ ...styles.listItem, opacity: u.activo ? 1 : 0.55 }}>
          <div style={styles.listMain}>
            <div>
              <strong>{u.usuario}</strong>
              {!u.activo && <span style={{ ...styles.badge, background: "#fee2e2", color: "#991b1b" }}>INACTIVO</span>}
              <div style={styles.listMeta}>
                {u.descripcion || "—"}
                {u.ultimo_acceso ? ` · Último acceso ${new Date(u.ultimo_acceso).toLocaleString("es-AR")}` : " · Nunca ingresó"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
            <button onClick={() => { setCambiando(u); setMsg(null); }} style={styles.editBtn}>Cambiar contraseña</button>
            <button
              onClick={async () => {
                const r = await activarUsuario(u.id, !u.activo);
                setMsg(r);
                reload();
              }}
              style={u.activo ? styles.deleteBtn : styles.addBtn}
            >
              {u.activo ? "Desactivar" : "Activar"}
            </button>
          </div>
        </div>
      ))}

      {cambiando && (
        <form action={claveAction} style={styles.formEmbebido}>
          <input type="hidden" name="id" value={cambiando.id} />
          <h3 style={styles.listTitle}>Nueva contraseña para «{cambiando.usuario}»</h3>
          <div style={styles.formRow}>
            <div style={styles.field}>
              <input name="clave" type="password" required minLength={8} maxLength={8} placeholder="8 caracteres" style={styles.input} />
            </div>
            <button type="submit" disabled={clavePending} style={styles.submitBtn}>
              {clavePending ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={() => setCambiando(null)} style={styles.cancelBtn}>Cancelar</button>
          </div>
        </form>
      )}

      <h3 style={styles.listTitle}>Nuevo usuario</h3>
      <form action={crearAction} style={styles.form}>
        <div style={styles.formRow}>
          <div style={styles.field}>
            <label style={styles.label}>Usuario *</label>
            <input name="usuario" required placeholder="sin espacios ni acentos" style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Descripción</label>
            <input name="descripcion" placeholder="Puesto de guardia — Turno…" style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Contraseña *</label>
            <input name="clave" type="password" required minLength={8} maxLength={8} placeholder="8 caracteres" style={styles.input} />
          </div>
        </div>
        <button type="submit" disabled={crearPending} style={styles.submitBtn}>
          {crearPending ? "Creando…" : "Crear usuario"}
        </button>
      </form>

      <h2 style={{ ...styles.cardTitle, marginTop: "2rem" }}>Clave de gestión</h2>
      <p style={styles.helper}>
        Es única y compartida. Se usa dentro de la sesión del puesto para entrar a
        maestros, informes e importación, y también para forzar el cierre de una sesión
        que quedó abierta. Son 4 caracteres.
      </p>

      {gestionState?.error && <div style={styles.error}>{gestionState.error}</div>}
      {gestionState?.success && <div style={styles.success}>{gestionState.message}</div>}

      <form action={gestionAction} style={styles.form}>
        <div style={styles.formRow}>
          <div style={styles.field}>
            <label style={styles.label}>Clave actual *</label>
            <input name="clave_actual" type="password" required maxLength={4} style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Clave nueva *</label>
            <input name="clave_nueva" type="password" required minLength={4} maxLength={4} style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Repetir nueva *</label>
            <input name="clave_repetir" type="password" required minLength={4} maxLength={4} style={styles.input} />
          </div>
        </div>
        <button type="submit" disabled={gestionPending} style={styles.submitBtn}>
          {gestionPending ? "Guardando…" : "Cambiar clave de gestión"}
        </button>
      </form>
    </div>
  );
}

// ============================ OPERADORES ============================

function TabOperadores({ operadores, reload }: { operadores: any[]; reload: () => Promise<void> }) {
  const [opState, opAction, opPending] = useActionState(createOperador, null);
  const [edit, setEdit] = useState<any>(null);
  const [msg, setMsg] = useState<any>(null);

  useEffect(() => { if (opState?.success) { reload(); cancelar(); } }, [opState]);

  function editar(o: any) { setEdit(o); setMsg(null); }
  function cancelar() { setEdit(null); }

  async function submit(fd: FormData) {
    if (edit) {
      const r = await updateOperador(edit.id, null, fd);
      setMsg(r);
      if (r.success) { await reload(); cancelar(); }
    } else {
      opAction(fd);
    }
  }

  const aviso = msg || opState;

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>{edit ? "Editar Operador" : "Nuevo Operador"}</h2>
      <p style={styles.helper}>
        Vigiladores y personal que opera la guardia. Cada entrada y salida queda firmada
        por quien la registró. En la pantalla de accesos viene preseleccionado el
        <strong> último que registró un movimiento</strong>, así al cambiar el turno se
        ajusta solo con el primer registro.
      </p>

      {aviso?.error && <div style={styles.error}>{aviso.error}</div>}
      {aviso?.success && <div style={styles.success}>{aviso.message}</div>}

      <form key={edit?.id ?? "nuevo"} action={submit} style={styles.form}>
        <div style={styles.formRow}>
          <div style={styles.field}><label style={styles.label}>Nombre *</label><input name="nombre" required defaultValue={edit?.nombre || ""} style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>Apellido *</label><input name="apellido" required defaultValue={edit?.apellido || ""} style={styles.input} /></div>
          <div style={styles.field}><label style={styles.label}>DNI *</label><input name="dni" required inputMode="numeric" defaultValue={edit?.dni || ""} style={styles.input} /></div>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Turno</label>
          <select name="turno" defaultValue={edit?.turno || ""} style={styles.input}>
            <option value="">Sin especificar</option>
            {TURNOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>
        </div>
        {edit && (
          <label style={styles.checkboxLabel}>
            <input type="checkbox" name="activo" value="true" defaultChecked={edit.activo} />
            Activo
          </label>
        )}
        <input type="hidden" name="activo" value={edit ? "" : "true"} />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" disabled={opPending} style={styles.submitBtn}>
            {opPending ? "Guardando…" : edit ? "Guardar cambios" : "Guardar Operador"}
          </button>
          {edit && <button type="button" onClick={cancelar} style={styles.cancelBtn}>Cancelar</button>}
        </div>
      </form>

      <h3 style={styles.listTitle}>Operadores ({operadores.length})</h3>
      {operadores.length === 0 && (
        <p style={styles.empty}>
          Todavía no hay operadores. Hay que cargar al menos uno para poder registrar movimientos.
        </p>
      )}
      {operadores.map((o) => (
        <div key={o.id} style={{ ...styles.listItem, opacity: o.activo ? 1 : 0.55 }}>
          <div style={styles.listMain}>
            <div>
              <strong>{o.apellido}, {o.nombre}</strong>
              {!o.activo && <span style={{ ...styles.badge, background: "#fee2e2", color: "#991b1b" }}>INACTIVO</span>}
              <div style={styles.listMeta}>
                DNI {o.dni}
                {o.turno ? ` · Turno ${etiquetaTurno(o.turno)}` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
            <button onClick={() => editar(o)} style={styles.editBtn}>Editar</button>
            {o.activo && (
              <button
                onClick={async () => {
                  if (!confirm(`¿Dar de baja a ${o.nombre} ${o.apellido}?`)) return;
                  const r = await deleteOperador(o.id);
                  setMsg(r);
                  reload();
                }}
                style={styles.deleteBtn}
              >
                Dar de baja
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================ AUTORIZADOS ============================

type EnLista = { dni: string; nombre: string; apellido: string; foto_url: string; lote: string; estado: EstadoAutorizacion };

function TabAutorizados({ autorizados, reload }: { autorizados: any[]; reload: () => Promise<void> }) {
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<EnLista[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [busco, setBusco] = useState(false);

  const [lista, setLista] = useState<EnLista[]>([]);
  const [lote, setLote] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [tipo, setTipo] = useState<"permanente" | "temporal">("temporal");

  const [detalle, setDetalle] = useState<ResultadoBusqueda | null>(null);
  const [msg, setMsg] = useState<any>(null);
  const [estado, action, pending] = useActionState(autorizarPersonas, null);

  useEffect(() => {
    if (estado?.success) {
      reload();
      setLista([]);
      setObservaciones("");
      if (consulta.trim()) buscar();
    }
  }, [estado]);

  async function buscar() {
    const q = consulta.trim();
    if (q.length < 2) return;
    setBuscando(true);
    setMsg(null);
    const r = await buscarPersonas(q);
    setResultados(r);
    setBusco(true);
    setBuscando(false);
  }

  function agregar(p: EnLista) {
    setLista((l) => (l.some((x) => x.dni === p.dni) ? l : [...l, p]));
    if (!lote && p.lote) setLote(p.lote);
  }

  function quitar(dni: string) {
    setLista((l) => l.filter((x) => x.dni !== dni));
  }

  const enLista = (dni: string) => lista.some((x) => x.dni === dni);

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Autorizados</h2>
      <p style={styles.helper}>
        Buscá por <strong>DNI, nombre o apellido</strong> entre las personas que ya ingresaron
        alguna vez al barrio. Armá una lista y otorgales la autorización de una sola vez.
      </p>

      <div style={styles.searchRow}>
        <input
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          placeholder="DNI, nombre o apellido…"
          style={styles.input}
        />
        <button type="button" onClick={buscar} disabled={buscando || consulta.trim().length < 2} style={styles.searchBtn}>
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {estado?.error && <div style={styles.error}>{estado.error}</div>}
      {estado?.success && <div style={styles.success}>{estado.message}</div>}
      {msg?.error && <div style={styles.error}>{msg.error}</div>}
      {msg?.success && <div style={styles.success}>{msg.message}</div>}

      {/* ---- Resultados de la busqueda ---- */}
      {busco && resultados.length === 0 && (
        <p style={styles.empty}>
          No se encontró a nadie con “{consulta}”. Recordá que la persona tiene que haber
          ingresado al menos una vez para poder autorizarla.
        </p>
      )}

      {resultados.length > 0 && (
        <div style={styles.resultados}>
          {resultados.map((p) => (
            <div key={p.dni} style={styles.resultado}>
              <div style={styles.listMain}>
                {p.foto_url ? <img src={p.foto_url} alt="" style={styles.thumb} /> : <div style={styles.thumbEmpty}>—</div>}
                <div>
                  <strong>{p.apellido}, {p.nombre}</strong>
                  <Badge estado={p.estado} />
                  <div style={styles.listMeta}>DNI {p.dni}{p.lote ? ` · Lote ${p.lote}` : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button type="button" onClick={() => searchPersona(p.dni).then(setDetalle)} style={styles.editBtn}>Ver</button>
                {p.estado === "residente" ? (
                  <span style={styles.notaChica}>No aplica</span>
                ) : enLista(p.dni) ? (
                  <button type="button" onClick={() => quitar(p.dni)} style={styles.deleteBtn}>Quitar</button>
                ) : (
                  <button type="button" onClick={() => agregar(p)} style={styles.addBtn}>Agregar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Detalle de una persona ---- */}
      {detalle?.persona && (
        <div style={styles.preview}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
            <Badge estado={detalle.estado} />
            <button type="button" onClick={() => setDetalle(null)} style={styles.cerrarBtn}>Cerrar</button>
          </div>
          <div style={styles.previewBody}>
            {detalle.persona.foto_url
              ? <img src={detalle.persona.foto_url} alt="" style={styles.previewFoto} />
              : <div style={styles.previewFotoEmpty}>Sin foto</div>}
            <div style={{ flex: 1, minWidth: 200 }}>
              <Row label="Nombre" value={`${detalle.persona.nombre} ${detalle.persona.apellido}`} />
              <Row label="DNI" value={detalle.persona.dni} />
              <Row label="Lote" value={detalle.persona.lote} />
              <Row label="Patente" value={detalle.persona.patente} />
              {detalle.ultimoRegistro && (
                <Row
                  label="Último movimiento"
                  value={`${new Date(detalle.ultimoRegistro.fecha_hora).toLocaleString("es-AR")} · ${detalle.ultimoRegistro.es_entrada ? "Entrada" : "Salida"}`}
                />
              )}
            </div>
          </div>
          {detalle.estado !== "residente" && detalle.autorizado && (
            <button
              type="button"
              style={styles.deleteBtnLg}
              onClick={async () => {
                if (!confirm(`¿Revocar la autorización de ${detalle.persona!.nombre} ${detalle.persona!.apellido}?`)) return;
                const r = await revocarAutorizacion(detalle.persona!.dni);
                setMsg(r);
                if (r.success) { await reload(); setDetalle(null); if (consulta.trim()) buscar(); }
              }}
            >
              Revocar autorización
            </button>
          )}
        </div>
      )}

      {/* ---- Lista armada + accion masiva ---- */}
      {lista.length > 0 && (
        <form action={action} style={styles.listaBox}>
          <h3 style={styles.listaTitulo}>Lista para autorizar ({lista.length})</h3>

          {lista.map((p) => (
            <div key={p.dni} style={styles.listaItem}>
              <input type="hidden" name="dni" value={p.dni} />
              <span>
                <strong>{p.apellido}, {p.nombre}</strong>
                <span style={styles.listMeta}> · DNI {p.dni}</span>
              </span>
              <button type="button" onClick={() => quitar(p.dni)} style={styles.deleteBtn}>Quitar</button>
            </div>
          ))}

          <div style={styles.formRow}>
            <div style={styles.field}>
              <label style={styles.label}>Tipo de autorización *</label>
              <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as any)} style={styles.input}>
                <option value="temporal">Temporal — una sola vez</option>
                <option value="permanente">Permanente</option>
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Lote que autoriza *</label>
              <input name="lote" required value={lote} onChange={(e) => setLote(e.target.value)} style={styles.input} placeholder="Ej: 142" />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Observaciones</label>
              <input name="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} style={styles.input} />
            </div>
          </div>

          <p style={tipo === "temporal" ? styles.notaTemporal : styles.notaPermanente}>
            {tipo === "temporal"
              ? "Al registrarse la entrada, la autorización se consume y la persona vuelve a quedar sin permiso."
              : "La persona queda habilitada a ingresar indefinidamente, hasta que se revoque."}
          </p>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="submit" disabled={pending} style={styles.submitBtn}>
              {pending ? "Otorgando…" : `Autorizar ${lista.length} persona${lista.length > 1 ? "s" : ""}`}
            </button>
            <button type="button" onClick={() => setLista([])} style={styles.cancelBtn}>Vaciar lista</button>
          </div>
        </form>
      )}

      {/* ---- Autorizaciones vigentes ---- */}
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
                DNI {a.dni}{a.lote ? ` · Lote ${a.lote}` : ""}{a.patente ? ` · ${a.patente}` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button onClick={() => searchPersona(a.dni).then(setDetalle)} style={styles.editBtn}>Ver</button>
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

// ============================ RESIDENTES ============================

function TabResidentes({ residentes, reload }: { residentes: any[]; reload: () => Promise<void> }) {
  const [resState, resAction, resPending] = useActionState(createResidente, null);
  const [editR, setEditR] = useState<any>(null);
  const [rFoto, setRFoto] = useState("");
  const [msg, setMsg] = useState<any>(null);
  const [accesos, setAccesos] = useState<Record<number, string>>({});
  // La contraseña se muestra una sola vez, apenas se genera.
  const [credencial, setCredencial] = useState<{ nombre: string; usuario: string; clave: string } | null>(null);

  const cargarAccesos = () => getAccesosResidentes().then(setAccesos);
  useEffect(() => { cargarAccesos(); }, [residentes.length]);

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
      <p style={styles.helper}>
        Personas que viven en el barrio. Siempre tienen ingreso habilitado y son quienes
        pueden autorizar visitas a su lote.
      </p>
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
          <div style={styles.field}><label style={styles.label}>Teléfono</label><input name="telefono" defaultValue={editR?.telefono || ""} style={styles.input} placeholder="549341..." /></div>
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

      {credencial && (
        <div style={styles.credencial}>
          <strong>Acceso de {credencial.nombre}</strong>
          <p style={styles.credencialAviso}>
            Anotá la contraseña ahora: no se puede volver a ver. Si se pierde,
            se genera una nueva con «Blanquear».
          </p>
          <div style={styles.credencialDatos}>
            <div><span style={styles.credencialLabel}>Usuario</span><code style={styles.code}>{credencial.usuario}</code></div>
            <div><span style={styles.credencialLabel}>Contraseña</span><code style={styles.code}>{credencial.clave}</code></div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(
                `Acceso a Registro de Accesos — Altos de la Horqueta\nUsuario: ${credencial.usuario}\nContraseña: ${credencial.clave}`
              )}
              style={styles.editBtn}
            >
              Copiar para WhatsApp
            </button>
            <button type="button" onClick={() => setCredencial(null)} style={styles.cancelBtn}>Cerrar</button>
          </div>
        </div>
      )}

      <h3 style={styles.listTitle}>Residentes ({residentes.length})</h3>
      {residentes.length === 0 && <p style={styles.empty}>Todavía no hay residentes cargados.</p>}
      {residentes.map((r) => {
        const acceso = accesos[r.id];
        return (
          <div key={r.id} style={styles.listItem}>
            <div style={styles.listMain}>
              {r.foto_url ? <img src={r.foto_url} alt="" style={styles.thumb} /> : <div style={styles.thumbEmpty}>—</div>}
              <div>
                <strong>{r.apellido}, {r.nombre}</strong>
                {acceso && <span style={{ ...styles.badge, background: "#dbeafe", color: "#1e40af" }}>ACCESO: {acceso}</span>}
                <div style={styles.listMeta}>
                  Lote {r.lote} · DNI {r.dni} · {r.rol === "inquilino" ? "Inquilino" : "Propietario"}
                  {r.telefono ? ` · ${r.telefono}` : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
              {acceso ? (
                <>
                  <button
                    onClick={async () => {
                      if (!confirm(`¿Generar una contraseña nueva para ${r.nombre}? La actual deja de servir.`)) return;
                      const res = await blanquearAccesoResidente(r.id);
                      if (res.success) setCredencial({ nombre: `${r.nombre} ${r.apellido}`, usuario: res.usuario!, clave: res.clave! });
                      else setMsg(res);
                    }}
                    style={styles.editBtn}
                  >
                    Blanquear
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`¿Quitarle el acceso a ${r.nombre}?`)) return;
                      const res = await quitarAccesoResidente(r.id);
                      setMsg(res);
                      cargarAccesos();
                    }}
                    style={styles.deleteBtn}
                  >
                    Quitar acceso
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    const res = await crearAccesoResidente(r.id);
                    if (res.success) {
                      setCredencial({ nombre: `${r.nombre} ${r.apellido}`, usuario: res.usuario!, clave: res.clave! });
                      cargarAccesos();
                    } else setMsg(res);
                  }}
                  style={styles.addBtn}
                >
                  Crear acceso
                </button>
              )}
              <button onClick={() => editar(r)} style={styles.editBtn}>Editar</button>
              <button onClick={async () => { if (confirm(`¿Eliminar a ${r.nombre} ${r.apellido}?`)) { await deleteResidente(r.id); reload(); } }} style={styles.deleteBtn}>Eliminar</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  formEmbebido: { display: "flex", flexDirection: "column", gap: "0.5rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "0.6rem", padding: "0.85rem", marginBottom: "1rem" },
  credencial: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "0.7rem", padding: "1rem", marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" },
  credencialAviso: { fontSize: "0.85rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "0.5rem", padding: "0.5rem 0.7rem", margin: 0, fontWeight: 600 },
  credencialDatos: { display: "flex", gap: "1.5rem", flexWrap: "wrap" },
  credencialLabel: { display: "block", fontSize: "0.75rem", color: "#64748b", fontWeight: 700, marginBottom: "0.15rem" },
  code: { fontFamily: "ui-monospace, monospace", fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", background: "#fff", padding: "0.3rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #cbd5e1", letterSpacing: "0.05em" },
  formRow: { display: "flex", gap: "0.75rem", flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1, minWidth: 150 },
  label: { fontSize: "0.85rem", fontWeight: 700, color: "#374151" },
  input: { padding: "0.75rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "0.95rem", outline: "none", width: "100%", boxSizing: "border-box" },

  searchRow: { display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" },
  searchBtn: { padding: "0.75rem 1.3rem", borderRadius: "0.75rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },

  resultados: { display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1.25rem" },
  resultado: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "0.5rem", background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "0.9rem", flexWrap: "wrap" },

  listaBox: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "0.85rem", padding: "1rem", marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" },
  listaTitulo: { margin: 0, fontSize: "1rem", fontWeight: 800, color: "#166534" },
  listaItem: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", background: "#fff", border: "1px solid #bbf7d0", borderRadius: "0.5rem", padding: "0.45rem 0.7rem", fontSize: "0.88rem" },
  notaTemporal: { fontSize: "0.85rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "0.5rem", padding: "0.5rem 0.7rem", margin: 0, fontWeight: 600 },
  notaPermanente: { fontSize: "0.85rem", color: "#166534", background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: "0.5rem", padding: "0.5rem 0.7rem", margin: 0, fontWeight: 600 },
  notaChica: { fontSize: "0.78rem", color: "#94a3b8", fontStyle: "italic", alignSelf: "center" },

  preview: { background: "#f8fafc", borderRadius: "0.85rem", padding: "1rem", marginBottom: "1.25rem", border: "1px solid #e2e8f0" },
  previewBody: { display: "flex", gap: "1rem", marginTop: "0.75rem", flexWrap: "wrap" },
  previewFoto: { width: 90, height: 90, borderRadius: "0.5rem", objectFit: "cover", border: "2px solid #e2e8f0", flexShrink: 0 },
  previewFotoEmpty: { width: 90, height: 90, borderRadius: "0.5rem", background: "#fef2f2", color: "#dc2626", fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid #fecaca" },
  row: { display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.25rem 0", fontSize: "0.92rem" },
  rowLabel: { fontWeight: 600, color: "#475569", whiteSpace: "nowrap" },

  badge: { marginLeft: "0.5rem", padding: "0.15rem 0.6rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700, display: "inline-block", verticalAlign: "middle" },
  checkboxLabel: { fontSize: "0.9rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer" },

  submitBtn: { padding: "0.85rem 1.2rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, cursor: "pointer" },
  cancelBtn: { padding: "0.75rem 1.2rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  cerrarBtn: { padding: "0.3rem 0.7rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", background: "#fff", color: "#475569", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" },
  miniBtn: { fontSize: "0.8rem", padding: "0.35rem 0.65rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", background: "#f8fafc", cursor: "pointer" },
  miniBtnDanger: { fontSize: "0.8rem", padding: "0.35rem 0.65rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", cursor: "pointer" },
  addBtn: { padding: "0.35rem 0.8rem", borderRadius: "0.5rem", border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" },
  editBtn: { padding: "0.35rem 0.7rem", borderRadius: "0.5rem", border: "1px solid #fde68a", background: "#fefce8", color: "#a16207", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" },
  deleteBtn: { padding: "0.35rem 0.7rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" },
  deleteBtnLg: { marginTop: "0.75rem", padding: "0.7rem 1.1rem", borderRadius: "0.75rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer" },

  error: { padding: "0.7rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600, marginBottom: "0.75rem" },
  success: { padding: "0.7rem", borderRadius: "0.75rem", background: "#ecfdf5", color: "#059669", fontWeight: 600, marginBottom: "0.75rem" },

  listTitle: { fontSize: "1rem", fontWeight: 700, margin: "1.25rem 0 0.75rem", color: "#334155" },
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "0.5rem", background: "#f8fafc", border: "1px solid #f1f5f9", marginBottom: "0.4rem", fontSize: "0.9rem", flexWrap: "wrap" },
  listMain: { display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, minWidth: 200 },
  listMeta: { fontSize: "0.8rem", color: "#64748b", marginTop: "0.15rem" },
  thumb: { width: 40, height: 40, borderRadius: "0.35rem", objectFit: "cover", flexShrink: 0 },
  thumbEmpty: { width: 40, height: 40, borderRadius: "0.35rem", background: "#e2e8f0", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  empty: { color: "#94a3b8", fontStyle: "italic" },
};
