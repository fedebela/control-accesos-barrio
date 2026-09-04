"use client";

import { useActionState, useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BarraSesion from "@/app/components/BarraSesion";
import {
  searchPersona, registrarMovimiento, getResidentesDeLote, getOperadores, getUltimoOperadorUsado,
  getApellidosPorLote, getProveedoresSinSalida,
  type ResultadoBusqueda, type EstadoAutorizacion, type Operador,
} from "@/app/actions";
import { parseDniEscaneado, formatearFecha, calcularEdad, type DniEscaneado } from "@/lib/dni";
import { TIPOS, RUBROS_PROVEEDOR, MEDIOS_AUTORIZACION, etiquetaRubro, etiquetaMedio } from "@/lib/constantes";

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
  return (
    <div style={{ display: "inline-block", padding: "0.35rem 0.8rem", borderRadius: "999px", background: b.bg, color: b.color, fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.6rem" }}>
      {b.text}
    </div>
  );
}

// ---------------------------------------------------------------- Página

const FORM_VACIO = {
  nombre: "", apellido: "", dni: "", tipo: "visita", subtipo: "",
  patente: "", vehiculo: "", residenteNombre: "",
  observaciones: "", fotoUrl: "",
};

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <PantallaAccesos />
    </Suspense>
  );
}

function PantallaAccesos() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"entrada" | "salida">("entrada");
  const [dniInput, setDniInput] = useState("");
  const [resultado, setResultado] = useState<ResultadoBusqueda | null>(null);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [motivoManual, setMotivoManual] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [escaneado, setEscaneado] = useState<DniEscaneado | null>(null);
  const [errorScan, setErrorScan] = useState<string | null>(null);
  const [authQuien, setAuthQuien] = useState("");
  const [authMedio, setAuthMedio] = useState("");
  const [estado, action, pending] = useActionState(registrarMovimiento, null);

  const [form, setForm] = useState({ ...FORM_VACIO });
  const [lotes, setLotes] = useState<string[]>([]);

  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [operadorId, setOperadorId] = useState("");

  // Apellidos de los residentes de cada lote cargado, para que el operador
  // confirme que el lote es el correcto.
  const [apellidosLote, setApellidosLote] = useState<Record<string, string>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const setField = (k: keyof typeof FORM_VACIO, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // ---- Operadores ----
  // Viene preseleccionado el ultimo que registro un movimiento: al cambiar el
  // turno, con el primer registro del operador entrante el desplegable ya queda
  // apuntando a el para todos los siguientes.
  useEffect(() => {
    Promise.all([getOperadores(), getUltimoOperadorUsado()]).then(([ops, ultimoId]) => {
      const activos = ops.filter((o) => o.activo);
      setOperadores(activos);

      const sugerido =
        activos.find((o) => o.id === ultimoId) || activos[0];
      if (sugerido) setOperadorId(String(sugerido.id));
    });
  }, [refreshKey]);

  const limpiarTodo = useCallback(() => {
    setDniInput("");
    setResultado(null);
    setManualMode(false);
    setMotivoManual("");
    setEscaneado(null);
    setErrorScan(null);
    setAuthQuien("");
    setAuthMedio("");
    setForm({ ...FORM_VACIO });
    setLotes([]);
    setApellidosLote({});
    if (scanRef.current) { scanRef.current.value = ""; scanRef.current.focus(); }
  }, []);

  useEffect(() => { if (scanRef.current) scanRef.current.focus(); }, [mode]);

  // Cada vez que cambia la lista de lotes se buscan los apellidos de sus residentes.
  useEffect(() => {
    if (lotes.length === 0) { setApellidosLote({}); return; }
    let activo = true;
    getApellidosPorLote(lotes).then((r) => { if (activo) setApellidosLote(r); });
    return () => { activo = false; };
  }, [lotes.join("|")]);

  useEffect(() => {
    if (estado?.success) {
      limpiarTodo();
      setRefreshKey((k) => k + 1);
    }
  }, [estado, limpiarTodo]);

  // ---- Escaneo del PDF417 del DNI ----
  const alEscanear = (crudo: string) => {
    const datos = parseDniEscaneado(crudo);
    if (!datos) {
      setEscaneado(null);
      setErrorScan("No se pudo leer el código del DNI. Probá de nuevo o ingresá el número a mano.");
      return;
    }
    setErrorScan(null);
    setEscaneado(datos);
    buscar(datos.dni, datos);
  };

  const buscar = async (dni: string, datos?: DniEscaneado | null) => {
    const limpio = dni.trim();
    if (!limpio) return;

    setSearching(true);
    setManualMode(false);
    const r = await searchPersona(limpio);
    setResultado(r);
    setSearching(false);
    setDniInput(limpio);

    if (!r.persona) {
      if (datos?.completo) {
        setManualMode(true);
        setForm({ ...FORM_VACIO, dni: datos.dni, nombre: datos.nombre, apellido: datos.apellido });
      } else {
        setForm({ ...FORM_VACIO, dni: limpio });
      }
      setLotes([]);
      return;
    }

    const base = mode === "salida" ? r.ultimaEntrada : r.ultimoRegistro;

    setForm({
      nombre: r.persona.nombre,
      apellido: r.persona.apellido,
      dni: r.persona.dni,
      tipo: r.persona.tipo === "residente" ? "visita" : r.persona.tipo || "visita",
      subtipo: r.subtipoPrevio || "",
      patente: base?.patente || r.persona.patente || "",
      vehiculo: base?.vehiculo_tipo === "si" || base?.patente ? "si" : r.persona.patente ? "si" : "no",
      residenteNombre: r.persona.residente_nombre || "",
      observaciones: mode === "salida" ? base?.observaciones || "" : "",
      fotoUrl: r.persona.foto_url || "",
    });

    // Los lotes de la ultima entrada vienen precargados y se pueden modificar.
    // En la salida son los lotes por los que la persona entro.
    const previos = r.lotesUltimaEntrada.length
      ? r.lotesUltimaEntrada
      : r.persona.lote
        ? [r.persona.lote]
        : [];
    setLotes(previos);
  };

  const activarManual = (checked: boolean) => {
    setManualMode(checked);
    setMotivoManual("");

    if (!checked) {
      setForm({ ...FORM_VACIO });
      setLotes([]);
      return;
    }

    const p = resultado?.persona;
    setForm({
      ...FORM_VACIO,
      dni: p?.dni || dniInput.trim() || escaneado?.dni || "",
      nombre: p?.nombre || escaneado?.nombre || "",
      apellido: p?.apellido || escaneado?.apellido || "",
      fotoUrl: p?.foto_url || "",
    });
  };

  const operadorSel = operadores.find((o) => String(o.id) === operadorId);
  const labelLote = mode === "salida" ? "Lotes desde donde se retira" : "Lotes que autorizan el ingreso";
  const textoBoton = mode === "entrada" ? "Registrar Entrada" : "Registrar Salida";
  const hayPersona = Boolean(resultado?.persona);
  const noRegistrado = Boolean(resultado && !resultado.persona);

  const necesitaAutorizacion =
    mode === "entrada" && !resultado?.autorizado && (Boolean(resultado) || manualMode);
  const autorizacionCompleta = Boolean(authQuien.trim() && authMedio && lotes.length > 0);
  const faltaRubro = form.tipo === "proveedor" && !form.subtipo;
  const bloqueado =
    (necesitaAutorizacion && !autorizacionCompleta) ||
    lotes.length === 0 ||
    faltaRubro ||
    !operadorId;

  // Apellidos de todos los lotes del movimiento, para dejarlos asentados.
  const apellidosDelMovimiento = Array.from(
    new Set(
      lotes
        .map((l) => apellidosLote[l])
        .filter(Boolean)
        .flatMap((a) => a.split(" / "))
    )
  ).join(" / ");

  // Campos comunes a los dos formularios.
  const camposComunes = (
    <>
      {lotes.map((l) => (
        <input key={l} type="hidden" name="lote_destino" value={l} />
      ))}
      <input type="hidden" name="residente_nombre" value={apellidosDelMovimiento} />
      <input type="hidden" name="operador_id" value={operadorId} />
      <input type="hidden" name="operador_nombre" value={operadorSel ? `${operadorSel.nombre} ${operadorSel.apellido}` : ""} />
    </>
  );

  return (
    <div style={styles.container}>
      <BarraSesion
        abrirGestion={params.get("gestion") === "1"}
        destino={params.get("destino") || ""}
      />

      <header style={styles.header}>
        <h1 style={styles.title}>Registro de Accesos</h1>
        <span style={styles.barrio}>Altos de la Horqueta</span>
      </header>

      <div style={styles.modeToggle}>
        <button onClick={() => { setMode("entrada"); limpiarTodo(); }} style={mode === "entrada" ? styles.modeActive : styles.modeInactive}>ENTRADA</button>
        <button onClick={() => { setMode("salida"); limpiarTodo(); }} style={mode === "salida" ? styles.modeActiveExit : styles.modeInactive}>SALIDA</button>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>{mode === "entrada" ? "Registrar Entrada" : "Registrar Salida"}</h2>

        {operadores.length === 0 && (
          <div style={styles.operadorBox}>
            <p style={styles.operadorFalta}>
              No hay operadores cargados. Andá a <a href="/maestros" style={styles.navLink}>Maestros → Operadores</a> y
              cargá al menos uno para poder registrar movimientos.
            </p>
          </div>
        )}

        {/* ---------------- Busqueda ---------------- */}
        <div style={styles.inputGroup}>
          <div>
            <label style={styles.label}>Escanear DNI</label>
            <input
              ref={scanRef}
              type="text"
              placeholder="Escanear el código del DNI…"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== "Tab") return;
                e.preventDefault();
                const el = e.target as HTMLInputElement;
                const crudo = el.value;
                el.value = "";
                if (crudo.trim()) alEscanear(crudo);
              }}
              style={styles.scanInput}
            />
          </div>

          {errorScan && <div style={styles.error}>{errorScan}</div>}
          {escaneado && <PanelEscaneo datos={escaneado} />}

          <div>
            <label style={styles.label}>Ingresar DNI</label>
            <div style={styles.searchRow}>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                placeholder="Número de DNI…"
                value={dniInput}
                onChange={(e) => setDniInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(dniInput); } }}
                style={styles.searchInput}
              />
              <button type="button" onClick={() => buscar(dniInput)} style={styles.searchBtn} disabled={searching || !dniInput.trim()}>
                {searching ? "Buscando…" : "Buscar"}
              </button>
              {(resultado || manualMode) && (
                <button type="button" onClick={limpiarTodo} style={styles.clearBtn}>Limpiar</button>
              )}
            </div>
          </div>

          <label style={styles.checkboxLabel}>
            <input type="checkbox" checked={manualMode} onChange={(e) => activarManual(e.target.checked)} />
            Carga manual — persona sin registro previo (requiere motivo)
          </label>

          {/* Queda fijo acá, visible desde que se abre la pantalla: el operador
              tiene que ver con qué nombre va a quedar firmado el movimiento
              antes de empezar a cargarlo, no recién al final. */}
          <SelectorOperador
            operadores={operadores}
            valor={operadorId}
            onChange={setOperadorId}
          />
        </div>

        {/* ---------------- DNI sin datos ---------------- */}
        {noRegistrado && !manualMode && (
          <div style={styles.previewCard}>
            <h3 style={styles.previewTitle}>Preview</h3>
            <Badge estado="no_registrado" />
            <p style={styles.previewDanger}>
              El DNI {dniInput} no figura en el sistema y no tiene ingresos previos.
              Tildá <strong>Carga manual</strong> para registrarlo por primera vez.
            </p>
          </div>
        )}

        {/* ---------------- Persona encontrada ---------------- */}
        {hayPersona && !manualMode && resultado && (
          <form action={action} style={styles.form}>
            <input type="hidden" name="es_entrada" value={mode === "entrada" ? "true" : "false"} />
            <input type="hidden" name="es_manual" value="false" />
            <input type="hidden" name="motivo_manual" value="" />
            <input type="hidden" name="nombre" value={form.nombre} />
            <input type="hidden" name="apellido" value={form.apellido} />
            <input type="hidden" name="dni" value={form.dni} />
            <input type="hidden" name="foto_url" value={form.fotoUrl} />
            {camposComunes}

            <div style={styles.previewCard}>
              <h3 style={styles.previewTitle}>Preview</h3>
              <Badge estado={resultado.estado} />

              {!form.fotoUrl && (
                <div style={styles.previewDangerBox}>
                  Esta persona no tiene foto cargada. Sacale una ahora: queda asociada al DNI
                  para todos los ingresos siguientes.
                </div>
              )}

              <PhotoInput
                value={form.fotoUrl}
                onChange={(v) => setField("fotoUrl", v)}
                label={form.fotoUrl ? "Foto de la persona (reemplazable)" : "Foto de la persona"}
              />

              {form.fotoUrl && (
                <p style={styles.notaIdentidad}>
                  Cada DNI tiene una sola foto. Si sacás una nueva, reemplaza a la anterior.
                  El nombre y el apellido solo se corrigen desde <strong>Carga manual</strong> con motivo.
                </p>
              )}

              <Row label="Nombre" value={form.nombre} />
              <Row label="Apellido" value={form.apellido} />
              <Row label="DNI" value={form.dni} />
              {resultado.lotesAutorizados.length > 0 && (
                <Row
                  label={resultado.lotesAutorizados.length > 1 ? "Lo autorizan" : "Lo autoriza"}
                  value={`Lote ${resultado.lotesAutorizados.join(" · ")}`}
                />
              )}
              <Row label="Observaciones" value={resultado.persona!.observaciones || "—"} />

              {resultado.estado === "pendiente" && (
                <p style={styles.previewWarn}>La invitación existe pero todavía no fue confirmada.</p>
              )}
              {!resultado.autorizado && resultado.estado !== "pendiente" && (
                <p style={styles.previewDanger}>
                  Sin autorización vigente. Comunicate con el residente antes de permitir el ingreso.
                </p>
              )}

              {(mode === "salida" ? resultado.ultimaEntrada : resultado.ultimoRegistro) && (
                <div style={styles.previewSub}>
                  <h4 style={styles.previewSubtitle}>
                    {mode === "salida" ? "Última entrada" : "Último registro"}
                  </h4>
                  {(() => {
                    const esSalida = mode === "salida";
                    const r = (esSalida ? resultado.ultimaEntrada : resultado.ultimoRegistro)!;
                    const lotesPrevios = esSalida
                      ? resultado.lotesUltimaEntrada
                      : resultado.lotesUltimoRegistro;

                    return (
                      <>
                        <Row label="Fecha" value={new Date(r.fecha_hora).toLocaleString("es-AR")} />
                        <Row label="Movimiento" value={r.es_entrada ? "Entrada" : "Salida"} />

                        {/* Cada lote con los apellidos de sus residentes */}
                        {lotesPrevios.length > 0 ? (
                          lotesPrevios.map((l) => (
                            <Row
                              key={l}
                              label={lotesPrevios.length > 1 ? `Lote ${l}` : "Lote"}
                              value={
                                resultado.apellidosDeLotes[l]
                                  ? `${l} — ${resultado.apellidosDeLotes[l]}`
                                  : `${l} — sin residente cargado`
                              }
                            />
                          ))
                        ) : (
                          <Row label="Lote" value={r.lote_destino || "—"} />
                        )}

                        <Row label="Patente" value={r.patente || "—"} />
                        {r.autorizado_por && (
                          <Row
                            label="Autorizó"
                            value={`${r.autorizado_por}${r.autorizacion_medio ? ` (${etiquetaMedio(r.autorizacion_medio)})` : ""}`}
                          />
                        )}
                        {r.operador_nombre && <Row label="Registró" value={r.operador_nombre} />}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <TipoYRubro form={form} setField={setField} />

            <LotesEditor
              lotes={lotes}
              setLotes={setLotes}
              apellidos={apellidosLote}
              label={labelLote}
              esProveedor={form.tipo === "proveedor"}
              modo={mode}
            />

            <CamposVehiculo form={form} setField={setField} />

            {necesitaAutorizacion && (
              <BloqueAutorizacion
                lotes={lotes}
                quien={authQuien}
                medio={authMedio}
                onQuien={setAuthQuien}
                onMedio={setAuthMedio}
              />
            )}


            {estado?.error && <div style={styles.error}>{estado.error}</div>}
            {estado?.success && <div style={styles.success}>{estado.message}</div>}

            <BotonEnviar
              mode={mode}
              pending={pending}
              bloqueado={bloqueado}
              texto={textoBoton}
              motivo={motivoBloqueo(lotes, faltaRubro, operadorId, necesitaAutorizacion, autorizacionCompleta)}
            />
          </form>
        )}

        {/* ---------------- Carga manual ---------------- */}
        {manualMode && (
          <form action={action} style={styles.form}>
            <input type="hidden" name="es_entrada" value={mode === "entrada" ? "true" : "false"} />
            <input type="hidden" name="es_manual" value="true" />
            <input type="hidden" name="foto_url" value={form.fotoUrl} />
            {camposComunes}

            {resultado?.persona && (
              <div style={styles.avisoIdentidad}>
                Este DNI ya está registrado como <strong>{resultado.persona.nombre} {resultado.persona.apellido}</strong>.
                Si guardás con datos distintos, se reemplazan el nombre, el apellido y la foto
                para todos los ingresos futuros. El motivo queda asentado.
              </div>
            )}

            <PhotoInput value={form.fotoUrl} onChange={(v) => setField("fotoUrl", v)} label="Foto de la persona" />

            <div style={styles.formRow}>
              <div style={styles.field}>
                <label style={styles.label}>Nombre *</label>
                <input name="nombre" required value={form.nombre} onChange={(e) => setField("nombre", e.target.value)} style={styles.input} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Apellido *</label>
                <input name="apellido" required value={form.apellido} onChange={(e) => setField("apellido", e.target.value)} style={styles.input} />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>DNI *</label>
              <input name="dni" required inputMode="numeric" value={form.dni} onChange={(e) => setField("dni", e.target.value)} style={styles.input} />
            </div>

            <TipoYRubro form={form} setField={setField} />

            <LotesEditor
              lotes={lotes}
              setLotes={setLotes}
              apellidos={apellidosLote}
              label={labelLote}
              esProveedor={form.tipo === "proveedor"}
              modo={mode}
            />

            <CamposVehiculo form={form} setField={setField} />

            <div style={styles.field}>
              <label style={styles.label}>Motivo de carga manual *</label>
              <textarea
                required
                name="motivo_manual"
                value={motivoManual}
                onChange={(e) => setMotivoManual(e.target.value.slice(0, 200))}
                placeholder="Ej: primera vez que ingresa, DNI dañado, lector fuera de servicio…"
                style={{ ...styles.input, resize: "vertical" }}
                rows={2}
                maxLength={200}
              />
              <span style={styles.counter}>{motivoManual.length}/200</span>
            </div>

            {necesitaAutorizacion && (
              <BloqueAutorizacion
                lotes={lotes}
                quien={authQuien}
                medio={authMedio}
                onQuien={setAuthQuien}
                onMedio={setAuthMedio}
              />
            )}


            {estado?.error && <div style={styles.error}>{estado.error}</div>}
            {estado?.success && <div style={styles.success}>{estado.message}</div>}

            <BotonEnviar
              mode={mode}
              pending={pending}
              bloqueado={bloqueado}
              texto={`${textoBoton} (manual)`}
              motivo={motivoBloqueo(lotes, faltaRubro, operadorId, necesitaAutorizacion, autorizacionCompleta)}
            />
          </form>
        )}
      </div>

      <RecentRecords refreshKey={refreshKey} />
      <ProveedoresAdentro refreshKey={refreshKey} />
    </div>
  );
}

/** "3 h 20 min" desde el ingreso. */
function transcurrido(desde: string): string {
  const min = Math.floor((Date.now() - new Date(desde).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `${min} min`;

  const horas = Math.floor(min / 60);
  const resto = min % 60;
  if (horas < 24) return resto ? `${horas} h ${resto} min` : `${horas} h`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 día" : `${dias} días`;
}

/**
 * Proveedores que entraron y no registraron la salida.
 * Sirve para saber quien esta adentro y para detectar cargas mal hechas.
 * Las visitas no se controlan: pueden irse con el propietario o en otro auto.
 */
function ProveedoresAdentro({ refreshKey }: { refreshKey: number }) {
  const [lista, setLista] = useState<any[]>([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    let activo = true;
    getProveedoresSinSalida().then((r) => {
      if (!activo) return;
      setLista(r);
      setCargado(true);
    });
    return () => { activo = false; };
  }, [refreshKey]);

  if (!cargado) return null;

  const horasDe = (f: string) => (Date.now() - new Date(f).getTime()) / 3600000;
  const demorados = lista.filter((r) => horasDe(r.fecha_hora) >= 12).length;

  return (
    <div style={lista.length > 0 ? styles.cardAviso : styles.card}>
      <div style={styles.tituloFila}>
        <h2 style={styles.cardTitle}>Proveedores sin salida registrada</h2>
        {lista.length > 0 && <span style={styles.contador}>{lista.length}</span>}
      </div>

      {lista.length === 0 ? (
        <p style={styles.empty}>
          Todos los proveedores registraron su salida.
        </p>
      ) : (
        <>
          <p style={styles.avisoTexto}>
            Están dentro del barrio según el registro.
            {demorados > 0 && (
              <> <strong>{demorados}</strong> {demorados === 1 ? "lleva" : "llevan"} más de 12 horas:
              conviene verificar si la salida no se cargó.</>
            )}
          </p>

          <div style={styles.recordsList}>
            {lista.map((r) => {
              const viejo = horasDe(r.fecha_hora) >= 12;
              return (
                <div key={r.id} style={viejo ? styles.filaVieja : styles.recordRow}>
                  <div style={styles.recordMain}>
                    {r.foto_url && <img src={r.foto_url} alt="" style={{ width: 28, height: 28, borderRadius: "0.3rem", objectFit: "cover" }} />}
                    <span style={styles.recordName}>{r.apellido}, {r.nombre}</span>
                    <span style={styles.recordDni}>DNI {r.dni}</span>
                    {r.subtipo && <span style={styles.recordRubro}>{etiquetaRubro(r.subtipo)}</span>}
                    {r.patente && <span style={styles.recordDni}>· {r.patente}</span>}
                  </div>
                  <div style={styles.recordMeta}>
                    <span>Lote {r.lotes || r.lote_destino || "—"}</span>
                    <span style={viejo ? styles.haceViejo : undefined}>
                      hace {transcurrido(r.fecha_hora)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Subcomponentes

function motivoBloqueo(
  lotes: string[], faltaRubro: boolean, operadorId: string,
  necesitaAuth: boolean, authOk: boolean
): string | null {
  if (!operadorId) return "Falta indicar quién registra";
  if (faltaRubro) return "Falta el rubro del proveedor";
  if (lotes.length === 0) return "Agregá al menos un lote";
  if (necesitaAuth && !authOk) return "Falta la autorización del residente";
  return null;
}

/**
 * Quien registra el movimiento.
 *
 * Viene preseleccionado el ultimo operador que registro, asi que en general se
 * deja como esta y solo se cambia al relevar el turno. Justamente por eso
 * conviene que este a la vista desde el inicio: si quedo el nombre del turno
 * anterior, se corrige antes de empezar a cargar y no despues.
 */
function SelectorOperador({
  operadores, valor, onChange,
}: {
  operadores: Operador[];
  valor: string;
  onChange: (v: string) => void;
}) {
  if (operadores.length === 0) return null;

  return (
    <div style={styles.operadorBox}>
      <label style={styles.label}>Registra *</label>
      <select value={valor} onChange={(e) => onChange(e.target.value)} style={styles.input}>
        {operadores.map((o) => (
          <option key={o.id} value={o.id}>{o.apellido}, {o.nombre}</option>
        ))}
      </select>
    </div>
  );
}

function BotonEnviar({
  mode, pending, bloqueado, texto, motivo,
}: {
  mode: "entrada" | "salida"; pending: boolean; bloqueado: boolean; texto: string; motivo: string | null;
}) {
  return (
    <button
      type="submit"
      style={{
        ...(mode === "entrada" ? styles.submitBtn : styles.submitBtnExit),
        ...(bloqueado ? styles.submitBtnBloqueado : null),
      }}
      disabled={pending || bloqueado}
    >
      {pending ? "Procesando…" : bloqueado ? motivo || "Faltan datos" : texto}
    </button>
  );
}

function TipoYRubro({
  form, setField,
}: { form: typeof FORM_VACIO; setField: (k: keyof typeof FORM_VACIO, v: string) => void }) {
  return (
    <div style={styles.formRow}>
      <div style={styles.field}>
        <label style={styles.label}>Motivo del ingreso *</label>
        <select
          name="tipo"
          value={form.tipo}
          onChange={(e) => {
            setField("tipo", e.target.value);
            if (e.target.value !== "proveedor") setField("subtipo", "");
          }}
          style={styles.input}
        >
          {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
        </select>
      </div>

      {form.tipo === "proveedor" && (
        <div style={styles.field}>
          <label style={styles.label}>Rubro *</label>
          <select name="subtipo" value={form.subtipo} onChange={(e) => setField("subtipo", e.target.value)} style={styles.input}>
            <option value="">Seleccionar rubro…</option>
            {RUBROS_PROVEEDOR.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

/**
 * Lista de lotes del movimiento. Un proveedor suele anunciarse para varios
 * en el mismo ingreso; una visita trae uno solo.
 */
function LotesEditor({
  lotes, setLotes, apellidos, label, esProveedor, modo,
}: {
  lotes: string[];
  setLotes: (l: string[]) => void;
  apellidos: Record<string, string>;
  label: string;
  esProveedor: boolean;
  modo: "entrada" | "salida";
}) {
  const [nuevo, setNuevo] = useState("");

  function agregar() {
    const l = nuevo.trim();
    if (!l) return;
    if (lotes.some((x) => x.toLowerCase() === l.toLowerCase())) { setNuevo(""); return; }
    setLotes([...lotes, l]);
    setNuevo("");
  }

  const sinResidentes = lotes.filter((l) => apellidos[l] === "");

  return (
    <div style={styles.lotesBox}>
      <label style={styles.label}>{label} *</label>

      {lotes.length > 0 && (
        <div style={styles.lotesChips}>
          {lotes.map((l) => {
            const ape = apellidos[l];
            return (
              <span key={l} style={ape === "" ? styles.chipSinDueno : styles.chip}>
                <span style={styles.chipLote}>{l}</span>
                {ape ? <span style={styles.chipApellidos}>{ape}</span> : null}
                {ape === "" ? <span style={styles.chipApellidos}>sin residente</span> : null}
                <button type="button" onClick={() => setLotes(lotes.filter((x) => x !== l))} style={styles.chipX} title="Quitar">×</button>
              </span>
            );
          })}
        </div>
      )}

      {sinResidentes.length > 0 && (
        <p style={styles.lotesAviso}>
          {sinResidentes.length === 1
            ? `El lote ${sinResidentes[0]} no tiene residentes cargados. Verificá el número.`
            : `Los lotes ${sinResidentes.join(", ")} no tienen residentes cargados. Verificá los números.`}
        </p>
      )}

      <div style={styles.searchRow}>
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
          placeholder={esProveedor ? "Lote… (podés agregar varios)" : "Lote…"}
          style={styles.input}
        />
        <button type="button" onClick={agregar} style={styles.addBtn} disabled={!nuevo.trim()}>Agregar</button>
      </div>

      {esProveedor && (
        <p style={styles.lotesNota}>
          {modo === "salida"
            ? "La salida se registra para todos estos lotes. Vienen precargados desde la entrada y se pueden modificar."
            : "Agregá todos los lotes para los que se anuncia. La próxima vez vienen precargados."}
        </p>
      )}
      {lotes.length === 0 && (
        <p style={styles.lotesFalta}>Agregá al menos un lote para poder registrar el movimiento.</p>
      )}
    </div>
  );
}

function CamposVehiculo({
  form, setField,
}: { form: typeof FORM_VACIO; setField: (k: keyof typeof FORM_VACIO, v: string) => void }) {
  return (
    <>
      <div style={styles.formRow}>
        <div style={styles.field}>
          <label style={styles.label}>Ingresa con vehículo</label>
          <select
            name="vehiculo_tipo"
            value={form.vehiculo}
            onChange={(e) => {
              setField("vehiculo", e.target.value);
              if (e.target.value === "no") setField("patente", "");
            }}
            style={styles.input}
          >
            <option value="">Seleccionar…</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Patente {form.vehiculo === "si" ? "*" : ""}</label>
          <input
            name="patente"
            value={form.patente}
            onChange={(e) => setField("patente", e.target.value.toUpperCase())}
            style={styles.input}
            placeholder="Puede cambiar en cada ingreso"
            disabled={form.vehiculo === "no"}
          />
        </div>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Observaciones</label>
        <input
          name="observaciones"
          value={form.observaciones}
          onChange={(e) => setField("observaciones", e.target.value)}
          style={styles.input}
        />
      </div>
    </>
  );
}

function BloqueAutorizacion({
  lotes, quien, medio, onQuien, onMedio,
}: {
  lotes: string[];
  quien: string;
  medio: string;
  onQuien: (v: string) => void;
  onMedio: (v: string) => void;
}) {
  const [vecinos, setVecinos] = useState<any[]>([]);

  useEffect(() => {
    if (lotes.length === 0) { setVecinos([]); return; }
    let activo = true;
    Promise.all(lotes.map((l) => getResidentesDeLote(l))).then((listas) => {
      if (!activo) return;
      const planas = listas.flat();
      const vistos = new Set<string>();
      setVecinos(planas.filter((v) => {
        const k = `${v.nombre}|${v.apellido}|${v.telefono}`;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      }));
    });
    return () => { activo = false; };
  }, [lotes.join(",")]);

  const soloDigitos = (t: string) => String(t || "").replace(/\D/g, "");
  const listaLotes = lotes.join(", ");

  return (
    <div style={styles.bloqueAuth}>
      <div style={styles.bloqueAuthTitulo}>Ingreso no autorizado</div>
      <p style={styles.bloqueAuthTexto}>
        Esta persona no tiene autorización vigente. No se puede registrar la entrada
        hasta que un residente la autorice por teléfono o WhatsApp.
      </p>

      {lotes.length === 0 && (
        <p style={styles.bloqueAuthAviso}>Agregá primero el lote para ver a quién contactar.</p>
      )}

      {lotes.length > 0 && vecinos.length === 0 && (
        <p style={styles.bloqueAuthAviso}>
          No hay residentes cargados en {listaLotes}. Verificá el lote o cargalo en Maestros.
        </p>
      )}

      {vecinos.length > 0 && (
        <div style={styles.vecinos}>
          {vecinos.map((v, i) => (
            <div key={i} style={styles.vecino}>
              <span>
                <strong>{v.nombre} {v.apellido}</strong>
                <span style={styles.vecinoRol}> · {v.rol === "inquilino" ? "Inquilino" : "Propietario"}</span>
                {v.telefono ? <span style={styles.vecinoRol}> · {v.telefono}</span> : null}
              </span>
              <span style={{ display: "flex", gap: "0.35rem" }}>
                {v.telefono && (
                  <>
                    <a href={`tel:${soloDigitos(v.telefono)}`} style={styles.btnLlamar}>Llamar</a>
                    <a
                      href={`https://wa.me/${soloDigitos(v.telefono)}?text=${encodeURIComponent(
                        `Hola ${v.nombre}, hay una persona en la guardia solicitando ingresar al lote ${listaLotes}. ¿Autorizás el ingreso?`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.btnWhatsapp}
                    >
                      WhatsApp
                    </a>
                  </>
                )}
                <button type="button" onClick={() => onQuien(`${v.nombre} ${v.apellido}`)} style={styles.btnElegir}>
                  Autorizó
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={styles.formRow}>
        <div style={styles.field}>
          <label style={styles.label}>¿Quién autorizó? *</label>
          <input
            name="autorizado_por"
            value={quien}
            onChange={(e) => onQuien(e.target.value)}
            style={styles.input}
            placeholder="Nombre del residente"
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>¿Por qué medio? *</label>
          <select name="autorizacion_medio" value={medio} onChange={(e) => onMedio(e.target.value)} style={styles.input}>
            <option value="">Seleccionar…</option>
            {MEDIOS_AUTORIZACION.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function PanelEscaneo({ datos }: { datos: DniEscaneado }) {
  const edad = calcularEdad(datos.fechaNacimiento);

  if (!datos.completo) {
    return (
      <div style={styles.scanPanel}>
        <div style={styles.scanTitle}>Lectura parcial del DNI</div>
        <p style={styles.scanTexto}>
          Se pudo leer el número <strong>{datos.dni}</strong>, pero no el resto de los datos.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.scanPanel}>
      <div style={styles.scanTitle}>Datos leídos del DNI</div>
      <div style={styles.scanGrid}>
        <span><strong>{datos.apellido}, {datos.nombre}</strong></span>
        <span>DNI {datos.dni}</span>
        {datos.sexo && <span>Sexo {datos.sexo}</span>}
        {datos.ejemplar && <span>Ejemplar {datos.ejemplar}</span>}
        {datos.fechaNacimiento && (
          <span>Nac. {formatearFecha(datos.fechaNacimiento)}{edad !== null ? ` (${edad} años)` : ""}</span>
        )}
        {datos.fechaEmision && <span>Emitido {formatearFecha(datos.fechaEmision)}</span>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.previewRow}>
      <span style={styles.previewLabel}>{label}:</span>
      <span style={{ textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

function RecentRecords({ refreshKey }: { refreshKey: number }) {
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    let activo = true;
    fetch("/api/records", { cache: "no-store" })
      .then((res) => res.json())
      .then((d) => { if (activo) setRecords(Array.isArray(d) ? d : []); })
      .catch(() => {});
    return () => { activo = false; };
  }, [refreshKey]);

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Últimos movimientos de hoy</h2>
      {records.length === 0 ? (
        <p style={styles.empty}>No hay movimientos registrados hoy.</p>
      ) : (
        <div style={styles.recordsList}>
          {records.map((r: any) => (
            <div key={r.id} style={styles.recordRow}>
              <div style={styles.recordMain}>
                <span style={r.es_entrada ? styles.badgeEntry : styles.badgeExit}>{r.es_entrada ? "ENT" : "SAL"}</span>
                {r.foto_url && <img src={r.foto_url} alt="" style={{ width: 28, height: 28, borderRadius: "0.3rem", objectFit: "cover" }} />}
                <span style={styles.recordName}>{r.nombre} {r.apellido}</span>
                <span style={styles.recordDni}>DNI {r.dni}</span>
                {r.subtipo && <span style={styles.recordRubro}>{etiquetaRubro(r.subtipo)}</span>}
                {r.patente && <span style={styles.recordDni}>· {r.patente}</span>}
              </div>
              <div style={styles.recordMeta}>
                <span>Lote {r.lote_destino || "—"}</span>
                <span>
                  {new Date(r.fecha_hora).toLocaleTimeString("es-AR")}
                  {r.operador_nombre ? ` · ${r.operador_nombre}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Estilos

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" },
  title: { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  barrio: { fontSize: "0.95rem", color: "#64748b", fontWeight: 600 },
  nav: { display: "flex", gap: "1rem" },
  navLink: { color: "#2563eb", textDecoration: "none", fontWeight: 600 },

  modeToggle: { display: "flex", gap: "0.5rem", marginBottom: "1.25rem" },
  modeActive: { flex: 1, padding: "0.9rem", border: "none", borderRadius: "0.75rem", background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: "1rem", cursor: "pointer" },
  modeActiveExit: { flex: 1, padding: "0.9rem", border: "none", borderRadius: "0.75rem", background: "#b91c1c", color: "#fff", fontWeight: 800, fontSize: "1rem", cursor: "pointer" },
  modeInactive: { flex: 1, padding: "0.9rem", border: "1px solid #d1d5db", borderRadius: "0.75rem", background: "#f8fafc", color: "#475569", fontWeight: 700, fontSize: "1rem", cursor: "pointer" },

  card: { background: "#fff", borderRadius: "1rem", padding: "1.5rem", marginBottom: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" },
  cardAviso: { background: "#fffbeb", borderRadius: "1rem", padding: "1.5rem", marginBottom: "1.25rem", border: "1px solid #fcd34d", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" },
  cardTitle: { fontSize: "1.25rem", fontWeight: 800, margin: "0 0 1rem", color: "#0f172a" },
  tituloFila: { display: "flex", alignItems: "center", gap: "0.6rem" },
  contador: { background: "#f59e0b", color: "#fff", fontWeight: 800, fontSize: "0.85rem", borderRadius: "999px", minWidth: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 0.5rem", marginBottom: "1rem" },
  avisoTexto: { fontSize: "0.9rem", color: "#92400e", margin: "0 0 0.85rem", lineHeight: 1.55 },
  filaVieja: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "0.5rem", background: "#fff", border: "1px solid #fca5a5", flexWrap: "wrap" },
  haceViejo: { color: "#b91c1c", fontWeight: 700 },

  operadorBox: { background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "0.75rem 0.9rem", marginBottom: "1rem" },
  operadorFalta: { fontSize: "0.88rem", color: "#92400e", margin: 0, lineHeight: 1.5 },

  inputGroup: { display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1rem" },
  label: { fontSize: "0.9rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: "0.3rem" },
  scanInput: { width: "100%", padding: "0.85rem", borderRadius: "0.75rem", border: "2px dashed #94a3b8", fontSize: "1rem", outline: "none", boxSizing: "border-box" },
  searchRow: { display: "flex", gap: "0.5rem" },
  searchInput: { flex: 1, padding: "0.85rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "1rem", outline: "none", minWidth: 0 },
  searchBtn: { padding: "0.85rem 1.25rem", borderRadius: "0.75rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  clearBtn: { padding: "0.85rem 1rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", background: "#f8fafc", color: "#475569", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  checkboxLabel: { fontSize: "0.9rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer" },

  scanPanel: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "0.75rem", padding: "0.75rem 0.9rem" },
  scanTitle: { fontSize: "0.78rem", fontWeight: 800, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.4rem" },
  scanGrid: { display: "flex", flexWrap: "wrap", gap: "0.35rem 1rem", fontSize: "0.9rem", color: "#1e293b" },
  scanTexto: { fontSize: "0.9rem", color: "#334155", margin: 0 },

  previewCard: { background: "#f8fafc", borderRadius: "0.85rem", padding: "1rem", marginBottom: "1rem", border: "1px solid #e2e8f0" },
  previewTitle: { margin: "0 0 0.6rem", fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" },
  previewRow: { display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.3rem 0", fontSize: "0.95rem" },
  previewLabel: { fontWeight: 600, color: "#475569", whiteSpace: "nowrap" },
  previewSub: { marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid #e2e8f0" },
  previewSubtitle: { margin: "0 0 0.3rem", fontSize: "0.95rem", fontWeight: 700, color: "#334155" },
  previewDanger: { fontSize: "0.9rem", color: "#dc2626", fontWeight: 600, marginTop: "0.5rem" },
  previewWarn: { fontSize: "0.9rem", color: "#92400e", fontWeight: 600, marginTop: "0.5rem" },
  previewDangerBox: { padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.6rem" },
  notaIdentidad: { fontSize: "0.8rem", color: "#64748b", margin: "0 0 0.6rem", lineHeight: 1.45 },
  avisoIdentidad: { padding: "0.7rem 0.85rem", borderRadius: "0.75rem", background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", fontSize: "0.88rem", fontWeight: 600, lineHeight: 1.5 },

  lotesBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "0.85rem" },
  lotesChips: { display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.6rem" },
  chip: { display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#0f172a", color: "#fff", borderRadius: "999px", padding: "0.25rem 0.4rem 0.25rem 0.7rem", fontSize: "0.85rem", fontWeight: 700 },
  chipSinDueno: { display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#92400e", color: "#fff", borderRadius: "999px", padding: "0.25rem 0.4rem 0.25rem 0.7rem", fontSize: "0.85rem", fontWeight: 700 },
  chipLote: { fontWeight: 800 },
  chipApellidos: { fontWeight: 500, opacity: 0.85, fontSize: "0.8rem" },
  chipX: { border: "none", background: "rgba(255,255,255,0.25)", color: "#fff", borderRadius: "999px", width: 18, height: 18, lineHeight: "16px", cursor: "pointer", fontSize: "0.9rem", padding: 0 },
  lotesAviso: { fontSize: "0.82rem", color: "#92400e", fontWeight: 600, margin: "0 0 0.6rem" },
  lotesNota: { fontSize: "0.8rem", color: "#64748b", margin: "0.5rem 0 0", lineHeight: 1.45 },
  lotesFalta: { fontSize: "0.82rem", color: "#b91c1c", fontWeight: 600, margin: "0.5rem 0 0" },

  form: { display: "flex", flexDirection: "column", gap: "0.85rem" },
  formRow: { display: "flex", gap: "0.75rem", flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1, minWidth: 160 },
  input: { padding: "0.8rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "1rem", outline: "none", width: "100%", boxSizing: "border-box" },
  counter: { fontSize: "0.8rem", color: "#94a3b8" },

  miniBtn: { fontSize: "0.8rem", padding: "0.35rem 0.65rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", background: "#f8fafc", cursor: "pointer" },
  miniBtnDanger: { fontSize: "0.8rem", padding: "0.35rem 0.65rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", cursor: "pointer" },
  addBtn: { padding: "0.8rem 1.1rem", borderRadius: "0.75rem", border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "0.75rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600 },
  success: { padding: "0.75rem", borderRadius: "0.75rem", background: "#ecfdf5", color: "#059669", fontWeight: 600 },
  submitBtn: { padding: "0.95rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, fontSize: "1.05rem", cursor: "pointer" },
  submitBtnExit: { padding: "0.95rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #b91c1c, #ef4444)", color: "#fff", fontWeight: 800, fontSize: "1.05rem", cursor: "pointer" },
  submitBtnBloqueado: { background: "#cbd5e1", color: "#64748b", cursor: "not-allowed" },

  bloqueAuth: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.85rem", padding: "1rem" },
  bloqueAuthTitulo: { fontSize: "0.8rem", fontWeight: 800, color: "#991b1b", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.4rem" },
  bloqueAuthTexto: { fontSize: "0.9rem", color: "#7f1d1d", margin: "0 0 0.75rem", lineHeight: 1.5, fontWeight: 500 },
  bloqueAuthAviso: { fontSize: "0.85rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "0.5rem", padding: "0.5rem 0.7rem", margin: "0 0 0.75rem", fontWeight: 600 },
  vecinos: { display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.85rem" },
  vecino: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", background: "#fff", border: "1px solid #fecaca", borderRadius: "0.5rem", padding: "0.5rem 0.7rem", fontSize: "0.88rem", flexWrap: "wrap" },
  vecinoRol: { color: "#64748b", fontWeight: 400 },
  btnLlamar: { padding: "0.3rem 0.6rem", borderRadius: "0.4rem", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "0.78rem", textDecoration: "none" },
  btnWhatsapp: { padding: "0.3rem 0.6rem", borderRadius: "0.4rem", background: "#25d366", color: "#fff", fontWeight: 700, fontSize: "0.78rem", textDecoration: "none" },
  btnElegir: { padding: "0.3rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#334155", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" },

  empty: { color: "#94a3b8", fontStyle: "italic" },
  recordsList: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  recordRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "0.5rem", background: "#f8fafc", border: "1px solid #f1f5f9", flexWrap: "wrap" },
  recordMain: { display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" },
  badgeEntry: { padding: "0.15rem 0.4rem", borderRadius: "0.25rem", background: "#dcfce7", color: "#166534", fontWeight: 700, fontSize: "0.75rem" },
  badgeExit: { padding: "0.15rem 0.4rem", borderRadius: "0.25rem", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.75rem" },
  recordName: { fontWeight: 600, color: "#0f172a" },
  recordDni: { color: "#64748b", fontSize: "0.85rem" },
  recordRubro: { color: "#1e40af", fontSize: "0.75rem", fontWeight: 700, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "0.25rem", padding: "0.05rem 0.35rem" },
  recordMeta: { display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: "0.85rem", color: "#64748b" },
};
