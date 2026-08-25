"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import { searchPersona, registrarMovimiento } from "@/app/actions";

type SearchPersonaResult = {
  autorizado: any;
  ultimoRegistro: any;
} | null;

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
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
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

export default function HomePage() {
  const [mode, setMode] = useState<"entrada" | "salida">("entrada");
  const [dniInput, setDniInput] = useState("");
  const [searchResult, setSearchResult] = useState<SearchPersonaResult>(null);
  const [searching, setSearching] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [motivoManual, setMotivoManual] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [manualState, manualAction, manualPending] = useActionState(registrarMovimiento, null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const [formNombre, setFormNombre] = useState("");
  const [formApellido, setFormApellido] = useState("");
  const [formDni, setFormDni] = useState("");
  const [formTipo, setFormTipo] = useState("visita");
  const [formLote, setFormLote] = useState("");
  const [formPatente, setFormPatente] = useState("");
  const [formVehiculo, setFormVehiculo] = useState("");
  const [formResidenteNombre, setFormResidenteNombre] = useState("");
  const [formObservaciones, setFormObservaciones] = useState("");
  const [formFotoUrl, setFormFotoUrl] = useState("");

  useEffect(() => {
    if (scanRef.current) scanRef.current.focus();
  }, [mode]);

  const parseDniFromScan = (text: string): string | null => {
    const parts = text.split(",");
    for (const part of parts) {
      const cleaned = part.trim();
      if (/^\d{7,9}$/.test(cleaned)) return cleaned;
    }
    const match = text.match(/\b\d{7,9}\b/);
    return match ? match[0] : null;
  };

  const handleScan = async (value: string) => {
    const dni = parseDniFromScan(value);
    if (dni) {
      setDniInput(dni);
      await doSearch(dni);
    }
  };

  const handleSearch = async () => {
    if (dniInput.trim()) await doSearch(dniInput.trim());
  };

  const doSearch = async (dni: string) => {
    setSearching(true);
    const result = await searchPersona(dni);
    setSearchResult(result);
    setSearching(false);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (!searchResult?.autorizado) return;
    const a = searchResult.autorizado;
    const fotoFromLast = searchResult.ultimoRegistro?.foto_url || "";
    setFormNombre(a.nombre || "");
    setFormApellido(a.apellido || "");
    setFormDni(a.dni || "");
    setFormTipo(a.tipo || "visita");
    setFormLote(a.lote || "");
    setFormPatente(a.patente || "");
    setFormResidenteNombre(a.residente_nombre || "");
    setFormFotoUrl(a.foto_url || fotoFromLast);
    setShowConfirm(false);
  };

  function getPreviewFoto() {
    if (searchResult?.autorizado?.foto_url) return searchResult.autorizado.foto_url;
    if (searchResult?.ultimoRegistro?.foto_url) return searchResult.ultimoRegistro.foto_url;
    return null;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Control de Accesos</h1>
        <nav style={styles.nav}>
          <a href="/maestros" style={styles.navLink}>Maestros</a>
          <a href="/informes" style={styles.navLink}>Informes</a>
        </nav>
      </header>

      <div style={styles.modeToggle}>
        <button
          onClick={() => setMode("entrada")}
          style={mode === "entrada" ? styles.modeActive : styles.modeInactive}
        >
          ENTRADA
        </button>
        <button
          onClick={() => setMode("salida")}
          style={mode === "salida" ? styles.modeActive : styles.modeInactive}
        >
          SALIDA
        </button>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>
          {mode === "entrada" ? "Registrar Entrada" : "Registrar Salida"}
        </h2>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Escanear DNI o ingresar DNI manualmente</label>
          <div style={styles.scanRow}>
            <input
              ref={scanRef}
              type="text"
              placeholder="Escanear DNI aquí..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const target = e.target as HTMLInputElement;
                  handleScan(target.value);
                  target.value = "";
                }
              }}
              style={styles.scanInput}
            />
          </div>
          <div style={styles.searchRow}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ingresar DNI..."
              value={dniInput}
              onChange={(e) => setDniInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              style={styles.searchInput}
            />
            <button onClick={handleSearch} style={styles.searchBtn} disabled={searching}>
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {mode === "entrada" && (
            <div style={styles.checkboxRow}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={manualMode}
                  onChange={(e) => setManualMode(e.target.checked)}
                />
                Carga manual (requiere motivo)
              </label>
            </div>
          )}
        </div>

        {showConfirm && searchResult && (
          <div style={styles.previewCard}>
            <h3 style={styles.previewTitle}>Preview</h3>

            {searchResult.autorizado ? (
              <div style={styles.previewSection}>
                <div style={styles.previewBadge}>
                  {searchResult.autorizado.autorizado ? "✅ AUTORIZADO" : "⏳ PENDIENTE DE AUTORIZACIÓN"}
                </div>
                {getPreviewFoto() && (
                  <div style={{ marginBottom: "0.5rem" }}>
                    <img
                      src={getPreviewFoto()!}
                      alt={`${searchResult.autorizado.nombre} ${searchResult.autorizado.apellido}`}
                      style={{ width: 80, height: 80, borderRadius: "0.5rem", objectFit: "cover", border: "2px solid #e2e8f0" }}
                    />
                  </div>
                )}
                <div style={styles.previewRow}>
                  <span style={styles.previewLabel}>Nombre:</span>
                  <span>{searchResult.autorizado.nombre} {searchResult.autorizado.apellido}</span>
                </div>
                <div style={styles.previewRow}>
                  <span style={styles.previewLabel}>DNI:</span>
                  <span>{searchResult.autorizado.dni}</span>
                </div>
                <div style={styles.previewRow}>
                  <span style={styles.previewLabel}>Tipo:</span>
                  <span>{searchResult.autorizado.tipo}</span>
                </div>
                <div style={styles.previewRow}>
                  <span style={styles.previewLabel}>Lote:</span>
                  <span>{searchResult.autorizado.lote}</span>
                </div>
                {searchResult.autorizado.residente_nombre && (
                  <div style={styles.previewRow}>
                    <span style={styles.previewLabel}>Residente:</span>
                    <span>{searchResult.autorizado.residente_nombre}</span>
                  </div>
                )}
                {searchResult.autorizado.patente && (
                  <div style={styles.previewRow}>
                    <span style={styles.previewLabel}>Patente:</span>
                    <span>{searchResult.autorizado.patente}</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={styles.previewSection}>
                <div style={styles.previewBadgeWarn}>⚠️ NO ENCONTRADO</div>
                <p style={styles.previewText}>No se encontró autorización previa para este DNI.</p>
              </div>
            )}

            {searchResult.ultimoRegistro && (
              <div style={styles.previewSection}>
                <h4 style={styles.previewSubtitle}>Último registro</h4>
                <div style={styles.previewRow}>
                  <span style={styles.previewLabel}>Fecha:</span>
                  <span>{new Date(searchResult.ultimoRegistro.fecha_hora).toLocaleString("es-AR")}</span>
                </div>
                <div style={styles.previewRow}>
                  <span style={styles.previewLabel}>Lote:</span>
                  <span>{searchResult.ultimoRegistro.lote_destino}</span>
                </div>
                <div style={styles.previewRow}>
                  <span style={styles.previewLabel}>Tipo:</span>
                  <span>{searchResult.ultimoRegistro.es_entrada ? "Entrada" : "Salida"}</span>
                </div>
              </div>
            )}

            <button onClick={handleConfirm} style={styles.confirmBtn}>
              Confirmar y cargar en formulario
            </button>
          </div>
        )}

        <form action={manualAction} style={styles.form}>
          <input type="hidden" name="es_entrada" value={mode === "entrada" ? "true" : "false"} />
          <input type="hidden" name="es_manual" value={manualMode ? "true" : "false"} />
          <input type="hidden" name="motivo_manual" value={motivoManual} />
          <input type="hidden" name="foto_url" value={formFotoUrl} />

          {formNombre ? (
            <>
              <input type="hidden" name="nombre" value={formNombre} />
              <input type="hidden" name="apellido" value={formApellido} />
              <input type="hidden" name="dni" value={formDni} />
              <input type="hidden" name="tipo" value={formTipo} />
              <input type="hidden" name="lote_destino" value={formLote} />
              <input type="hidden" name="residente_nombre" value={formResidenteNombre} />
              <input type="hidden" name="patente" value={formPatente} />

              <div style={styles.previewConfirmCard}>
                {formFotoUrl && (
                  <img
                    src={formFotoUrl}
                    alt={`${formNombre} ${formApellido}`}
                    style={{ width: 60, height: 60, borderRadius: "0.5rem", objectFit: "cover", marginBottom: "0.5rem" }}
                  />
                )}
                <p style={{ margin: 0, fontWeight: 700 }}>{formNombre} {formApellido}</p>
                <p style={{ margin: "0.2rem 0", color: "#475569", fontSize: "0.9rem" }}>DNI: {formDni}</p>
                <p style={{ margin: "0.2rem 0", color: "#475569", fontSize: "0.9rem" }}>Tipo: {formTipo}</p>
                {formLote && <p style={{ margin: "0.2rem 0", color: "#475569", fontSize: "0.9rem" }}>Lote: {formLote}</p>}
              </div>

              <PhotoInput value={formFotoUrl} onChange={setFormFotoUrl} label="Foto de la persona (opcional)" />

              <div style={styles.field}>
                <label style={styles.label}>Vehículo</label>
                <select name="vehiculo_tipo" value={formVehiculo} onChange={(e) => setFormVehiculo(e.target.value)} style={styles.input}>
                  <option value="">Sin vehículo</option>
                  <option value="automovil">Automóvil</option>
                  <option value="camion">Camión</option>
                  <option value="moto">Moto</option>
                  <option value="bicicleta">Bicicleta</option>
                  <option value="peaton">Peatón</option>
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Patente</label>
                <input name="patente" type="text" value={formPatente} onChange={(e) => setFormPatente(e.target.value)} style={styles.input} placeholder="Opcional" />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Observaciones</label>
                <input name="observaciones" type="text" value={formObservaciones} onChange={(e) => setFormObservaciones(e.target.value)} style={styles.input} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Lote donde se autoriza</label>
                <input name="autorizado_por" type="text" value={formLote} onChange={(e) => setFormLote(e.target.value)} style={styles.input} />
              </div>

              {manualMode && mode === "entrada" && (
                <div style={styles.field}>
                  <label style={styles.label}>Motivo de carga manual *</label>
                  <textarea
                    required
                    value={motivoManual}
                    onChange={(e) => setMotivoManual(e.target.value.slice(0, 200))}
                    placeholder="Describí el motivo..."
                    style={styles.input}
                    rows={2}
                    maxLength={200}
                  />
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{motivoManual.length}/200</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={styles.field}>
                <label style={styles.label}>Nombre</label>
                <input name="nombre" type="text" required style={styles.input} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Apellido</label>
                <input name="apellido" type="text" required style={styles.input} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>DNI</label>
                <input name="dni" type="text" required style={styles.input} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Tipo</label>
                <select name="tipo" style={styles.input}>
                  <option value="visita">Visita</option>
                  <option value="proveedor">Proveedor</option>
                  <option value="servicio">Servicio</option>
                </select>
              </div>
            </>
          )}

          {mode === "entrada" && !formNombre && (
            <>
              <div style={styles.field}>
                <label style={styles.label}>Vehículo</label>
                <select name="vehiculo_tipo" style={styles.input}>
                  <option value="">Sin vehículo</option>
                  <option value="automovil">Automóvil</option>
                  <option value="camion">Camión</option>
                  <option value="moto">Moto</option>
                  <option value="bicicleta">Bicicleta</option>
                  <option value="peaton">Peatón</option>
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Patente</label>
                <input name="patente" type="text" style={styles.input} placeholder="Opcional" />
              </div>
            </>
          )}

          {!formNombre && (
            <>
              <div style={styles.field}>
                <label style={styles.label}>Observaciones</label>
                <input name="observaciones" type="text" style={styles.input} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Lote donde se autoriza</label>
                <input name="autorizado_por" type="text" style={styles.input} placeholder="Lote del residente" />
              </div>
            </>
          )}

          {manualMode && mode === "entrada" && !formNombre && (
            <div style={styles.field}>
              <label style={styles.label}>Motivo de carga manual *</label>
              <input
                type="text"
                required
                value={motivoManual}
                onChange={(e) => setMotivoManual(e.target.value.slice(0, 200))}
                placeholder="Ej: Scanner no funciona, DNI dañado..."
                style={styles.input}
              />
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{motivoManual.length}/200</span>
            </div>
          )}

          {manualState?.error && <div style={styles.error}>{manualState.error}</div>}
          {manualState?.success && <div style={styles.success}>{manualState.message}</div>}

          <button type="submit" style={styles.submitBtn} disabled={manualPending}>
            {manualPending ? "Procesando..." : mode === "entrada" ? "Registrar Entrada" : "Registrar Salida"}
          </button>
        </form>
      </div>

      <RecentRecords />
    </div>
  );
}

function RecentRecords() {
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/records")
      .then((res) => res.json())
      .then(setRecords)
      .catch(() => {});
  }, []);

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
                <span style={r.es_entrada ? styles.badgeEntry : styles.badgeExit}>
                  {r.es_entrada ? "ENT" : "SAL"}
                </span>
                <span style={styles.recordName}>{r.nombre} {r.apellido}</span>
                <span style={styles.recordDni}>DNI: {r.dni}</span>
              </div>
              <div style={styles.recordMeta}>
                <span>{r.lote_destino}</span>
                <span>{new Date(r.fecha_hora).toLocaleTimeString("es-AR")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" },
  title: { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 },
  nav: { display: "flex", gap: "1rem" },
  navLink: { color: "#2563eb", textDecoration: "none", fontWeight: 600 },
  modeToggle: { display: "flex", gap: "0.5rem", marginBottom: "1.25rem" },
  modeActive: { flex: 1, padding: "0.9rem", border: "none", borderRadius: "0.75rem", background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: "1rem", cursor: "pointer" },
  modeInactive: { flex: 1, padding: "0.9rem", border: "1px solid #d1d5db", borderRadius: "0.75rem", background: "#f8fafc", color: "#475569", fontWeight: 700, fontSize: "1rem", cursor: "pointer" },
  card: { background: "#fff", borderRadius: "1rem", padding: "1.5rem", marginBottom: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" },
  cardTitle: { fontSize: "1.25rem", fontWeight: 800, margin: "0 0 1rem", color: "#0f172a" },
  inputGroup: { display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" },
  label: { fontSize: "0.9rem", fontWeight: 700, color: "#374151" },
  scanRow: { display: "flex", gap: "0.5rem" },
  scanInput: { flex: 1, padding: "0.85rem", borderRadius: "0.75rem", border: "2px dashed #94a3b8", fontSize: "1rem", outline: "none" },
  searchRow: { display: "flex", gap: "0.5rem" },
  searchInput: { flex: 1, padding: "0.85rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "1rem", outline: "none" },
  searchBtn: { padding: "0.85rem 1.25rem", borderRadius: "0.75rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" },
  checkboxRow: { display: "flex", alignItems: "center", gap: "0.5rem" },
  checkboxLabel: { fontSize: "0.9rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.4rem" },
  previewCard: { background: "#f8fafc", borderRadius: "0.85rem", padding: "1rem", marginBottom: "1rem", border: "1px solid #e2e8f0" },
  previewTitle: { margin: "0 0 0.75rem", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" },
  previewSection: { marginBottom: "0.75rem" },
  previewBadge: { display: "inline-block", padding: "0.3rem 0.7rem", borderRadius: "999px", background: "#dcfce7", color: "#166534", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.5rem" },
  previewBadgeWarn: { display: "inline-block", padding: "0.3rem 0.7rem", borderRadius: "999px", background: "#fef3c7", color: "#92400e", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.5rem" },
  previewRow: { display: "flex", justifyContent: "space-between", padding: "0.3rem 0", fontSize: "0.95rem" },
  previewLabel: { fontWeight: 600, color: "#475569" },
  previewSubtitle: { margin: "0.5rem 0 0.3rem", fontSize: "0.95rem", fontWeight: 700, color: "#334155" },
  previewText: { fontSize: "0.9rem", color: "#64748b" },
  confirmBtn: { width: "100%", padding: "0.85rem", borderRadius: "0.75rem", border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer", marginTop: "0.5rem" },
  previewConfirmCard: { background: "#f0fdf4", borderRadius: "0.75rem", padding: "1rem", marginBottom: "0.75rem", border: "1px solid #bbf7d0", textAlign: "center" as const },
  form: { display: "flex", flexDirection: "column", gap: "0.85rem" },
  field: { display: "flex", flexDirection: "column", gap: "0.35rem" },
  input: { padding: "0.8rem", borderRadius: "0.75rem", border: "1px solid #d1d5db", fontSize: "1rem", outline: "none" },
  error: { padding: "0.75rem", borderRadius: "0.75rem", background: "#fef2f2", color: "#dc2626", fontWeight: 600 },
  success: { padding: "0.75rem", borderRadius: "0.75rem", background: "#ecfdf5", color: "#059669", fontWeight: 600 },
  submitBtn: { padding: "0.95rem", borderRadius: "0.75rem", border: "none", background: "linear-gradient(90deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, fontSize: "1.05rem", cursor: "pointer" },
  empty: { color: "#94a3b8", fontStyle: "italic" },
  recordsList: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  recordRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.75rem", borderRadius: "0.5rem", background: "#f8fafc", border: "1px solid #f1f5f9" },
  recordMain: { display: "flex", alignItems: "center", gap: "0.5rem" },
  badgeEntry: { padding: "0.15rem 0.4rem", borderRadius: "0.25rem", background: "#dcfce7", color: "#166534", fontWeight: 700, fontSize: "0.75rem" },
  badgeExit: { padding: "0.15rem 0.4rem", borderRadius: "0.25rem", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.75rem" },
  recordName: { fontWeight: 600, color: "#0f172a" },
  recordDni: { color: "#64748b", fontSize: "0.85rem" },
  recordMeta: { display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: "0.85rem", color: "#64748b" },
};
