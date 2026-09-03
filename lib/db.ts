import { neon } from "@neondatabase/serverless";

export function getSql() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL ||
    null;

  if (!connectionString) {
    throw new Error("Falta conexión a la base de datos.");
  }

  return neon(connectionString);
}

let tablesReady: Promise<void> | null = null;

async function createTables() {
  const sql = getSql();

  // ---------- RESIDENTES ----------
  // Personas que viven en el barrio (propietarios o inquilinos).
  await sql`
    CREATE TABLE IF NOT EXISTS residentes (
      id BIGSERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      lote VARCHAR(20) NOT NULL,
      telefono VARCHAR(30),
      dni VARCHAR(20) NOT NULL UNIQUE,
      rol VARCHAR(20) DEFAULT 'propietario',
      foto_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ---------- AUTORIZADOS ----------
  // Permisos de ingreso. Un mismo DNI tiene como maximo un permiso vigente.
  //   tipo = 'permanente' -> alta manual desde Maestros, siempre habilitado.
  //   tipo = 'temporal'   -> nace de una invitacion, requiere confirmacion del residente.
  //   un_solo_uso = true  -> se consume en la primera entrada.
  await sql`
    CREATE TABLE IF NOT EXISTS autorizados (
      id BIGSERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      dni VARCHAR(20) NOT NULL,
      tipo VARCHAR(20) NOT NULL,
      observaciones TEXT,
      patente VARCHAR(20),
      residente_id BIGINT REFERENCES residentes(id),
      residente_nombre VARCHAR(200),
      lote VARCHAR(20),
      fecha_expiracion DATE,
      autorizado BOOLEAN DEFAULT FALSE,
      un_solo_uso BOOLEAN DEFAULT FALSE,
      usada BOOLEAN DEFAULT FALSE,
      link_token VARCHAR(100) UNIQUE,
      foto_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ---------- REGISTROS ----------
  // Bitacora de movimientos. Es la fuente de verdad de los datos de la persona
  // una vez que ingreso por primera vez.
  await sql`
    CREATE TABLE IF NOT EXISTS registros (
      id BIGSERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      dni VARCHAR(20) NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      subtipo VARCHAR(30),
      vehiculo_tipo VARCHAR(20),
      patente VARCHAR(20),
      residente_nombre VARCHAR(200),
      lote_destino VARCHAR(20),
      observaciones TEXT,
      es_manual BOOLEAN DEFAULT FALSE,
      motivo_manual TEXT,
      -- Cuando la persona no tiene autorizacion vigente, se deja asentado
      -- quien habilito el ingreso y por que via (telefono / whatsapp / presencial).
      autorizado_por VARCHAR(200),
      autorizacion_medio VARCHAR(20),
      es_entrada BOOLEAN NOT NULL,
      fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ---------- PERSONAS ----------
  // Identidad unica por DNI. Un DNI = un nombre, un apellido y UNA foto.
  // Los registros de la bitacora guardan una copia historica, pero la version
  // vigente de la identidad vive siempre aca.
  // Solo se puede modificar desde una carga manual indicando el motivo.
  await sql`
    CREATE TABLE IF NOT EXISTS personas (
      dni VARCHAR(20) PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      foto_url TEXT,
      actualizado_motivo TEXT,
      actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ---------- OPERADORES ----------
  // Vigiladores y personal que opera la guardia. Cada movimiento queda firmado
  // por quien lo registro. El marcado como principal viene preseleccionado.
  //
  // Sin rol a proposito: los permisos son un asunto de la autenticacion y van
  // a vivir en la tabla de usuarios. Aca solo interesa quien esta de turno.
  //
  // Tampoco hay un operador "principal": la pantalla de accesos precarga al
  // ultimo que registro un movimiento, que se ajusta solo al cambiar el turno.
  await sql`
    CREATE TABLE IF NOT EXISTS operadores (
      id BIGSERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      dni VARCHAR(20) NOT NULL UNIQUE,
      turno VARCHAR(20),
      activo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ---------- REGISTRO_LOTES ----------
  // Un proveedor puede anunciarse para varios lotes en un mismo ingreso.
  // El movimiento sigue siendo UNA fila en `registros`; los lotes van aca.
  // registros.lote_destino conserva el primero de la lista para que las
  // consultas simples y los filtros por lote sigan funcionando.
  await sql`
    CREATE TABLE IF NOT EXISTS registro_lotes (
      id BIGSERIAL PRIMARY KEY,
      registro_id BIGINT NOT NULL REFERENCES registros(id) ON DELETE CASCADE,
      lote VARCHAR(20) NOT NULL
    );
  `;

  // ---------- USUARIOS ----------
  // Usuarios del puesto de guardia. Son pocos y compartidos por turno: varios
  // operadores usan el mismo usuario, por eso quien firma el movimiento se
  // sigue eligiendo del desplegable de operadores.
  //   rol = 'puesto'    -> guardia. Rige la regla de una sola sesion a la vez.
  //   rol = 'residente' -> entra desde su celular, ve solo su lote. Sesiones
  //                        concurrentes, porque son muchos y a la vez.
  await sql`
    CREATE TABLE IF NOT EXISTS usuarios (
      id BIGSERIAL PRIMARY KEY,
      usuario VARCHAR(50) NOT NULL UNIQUE,
      descripcion VARCHAR(100),
      clave_hash TEXT NOT NULL,
      rol VARCHAR(20) NOT NULL DEFAULT 'puesto',
      residente_id BIGINT REFERENCES residentes(id) ON DELETE CASCADE,
      activo BOOLEAN DEFAULT TRUE,
      ultimo_acceso TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ---------- SESIONES ----------
  // Solo puede haber UNA sesion activa en toda la aplicacion: para que entre
  // otro usuario, el anterior tiene que cerrar sesion. La tabla es la autoridad;
  // la cookie firmada solo evita consultar la base en cada navegacion.
  //
  // `gestion_hasta` marca hasta cuando esta desbloqueado el acceso a maestros,
  // informes e importacion dentro de la sesion.
  await sql`
    CREATE TABLE IF NOT EXISTS sesiones (
      id VARCHAR(64) PRIMARY KEY,
      usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      usuario VARCHAR(50) NOT NULL,
      creada_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      ultimo_uso TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expira_en TIMESTAMP WITH TIME ZONE NOT NULL,
      gestion_habilitada BOOLEAN DEFAULT FALSE
    );
  `;

  // ---------- CONFIGURACION ----------
  // Pares clave/valor. Por ahora guarda la clave de gestion, que es unica y
  // compartida: la usa el supervisor dentro de la sesion del guardia.
  await sql`
    CREATE TABLE IF NOT EXISTS configuracion (
      clave VARCHAR(50) PRIMARY KEY,
      valor TEXT NOT NULL,
      actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // ---------- MIGRACIONES ----------
  // Se ejecutan DESPUES de crear las tablas, si no fallan en una base vacia.
  await sql`ALTER TABLE residentes  ADD COLUMN IF NOT EXISTS rol VARCHAR(20) DEFAULT 'propietario'`;
  await sql`ALTER TABLE residentes  ADD COLUMN IF NOT EXISTS foto_url TEXT`;

  await sql`ALTER TABLE autorizados ADD COLUMN IF NOT EXISTS foto_url TEXT`;
  await sql`ALTER TABLE autorizados ADD COLUMN IF NOT EXISTS un_solo_uso BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE autorizados ADD COLUMN IF NOT EXISTS usada BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE autorizados ADD COLUMN IF NOT EXISTS residente_nombre VARCHAR(200)`;
  await sql`ALTER TABLE autorizados ALTER COLUMN residente_nombre TYPE VARCHAR(200)`;

  await sql`ALTER TABLE registros   ALTER COLUMN residente_nombre TYPE VARCHAR(200)`;
  // Quien habilito el ingreso de una persona sin autorizacion vigente y por que via.
  await sql`ALTER TABLE registros   ADD COLUMN IF NOT EXISTS autorizacion_medio VARCHAR(20)`;
  await sql`ALTER TABLE registros   ALTER COLUMN autorizado_por TYPE VARCHAR(200)`;

  // Operador que registro el movimiento. Se guarda el id y una copia del nombre:
  // la bitacora es inalterable, asi que debe conservar como se llamaba en ese
  // momento aunque despues se edite o se borre el operador.
  await sql`ALTER TABLE registros   ADD COLUMN IF NOT EXISTS operador_id BIGINT`;
  await sql`ALTER TABLE registros   ADD COLUMN IF NOT EXISTS operador_nombre VARCHAR(200)`;

  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'puesto'`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS residente_id BIGINT REFERENCES residentes(id) ON DELETE CASCADE`;

  await sql`CREATE INDEX IF NOT EXISTS idx_residentes_lote ON residentes (lote)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones (expira_en)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_usuarios_residente ON usuarios (residente_id)`;

  // ---------- AUTORIZACIONES POR LOTE ----------
  // Una persona puede estar autorizada por varios lotes a la vez, cada uno
  // independiente del otro. Antes habia una sola autorizacion por DNI y al
  // autorizar se borraban las anteriores: si dos lotes autorizaban a la misma
  // persona, el segundo pisaba al primero sin aviso.
  //
  // Se limpian los duplicados historicos antes de crear el indice, quedandose
  // con la mas reciente de cada (dni, lote).
  await sql`
    DELETE FROM autorizados a
    USING autorizados b
    WHERE a.dni = b.dni
      AND lower(COALESCE(a.lote, '')) = lower(COALESCE(b.lote, ''))
      AND a.usada = FALSE AND b.usada = FALSE
      AND a.created_at < b.created_at
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_autorizados_dni_lote
    ON autorizados (dni, lower(COALESCE(lote, ''))) WHERE usada = FALSE
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_registro_lotes_reg ON registro_lotes (registro_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_registro_lotes_lote ON registro_lotes (lote)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_registros_tipo ON registros (tipo)`;

  // El rol del operador se elimino: los permisos son de la capa de usuarios.
  await sql`ALTER TABLE operadores DROP COLUMN IF EXISTS rol`;
  // El operador principal se reemplazo por "el ultimo que registro".
  await sql`DROP INDEX IF EXISTS idx_operadores_principal`;
  await sql`ALTER TABLE operadores DROP COLUMN IF EXISTS principal`;

  // Para resolver rapido cual fue el ultimo operador que registro un movimiento.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_registros_operador
    ON registros (operador_id, fecha_hora DESC)
  `;

  // ---------- INDICES ----------
  await sql`CREATE INDEX IF NOT EXISTS idx_registros_dni_fecha ON registros (dni, fecha_hora DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_registros_fecha ON registros (fecha_hora DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_autorizados_dni ON autorizados (dni)`;

  await backfillPersonas(sql);
  await consolidarFotos(sql);
  await backfillRegistroLotes(sql);
}

/**
 * Lleva a `registro_lotes` los lotes de los movimientos ya existentes, para que
 * el historico tambien se pueda consultar por lote. Corre una sola vez.
 */
async function backfillRegistroLotes(sql: ReturnType<typeof getSql>) {
  const yaHay = (await sql`SELECT 1 FROM registro_lotes LIMIT 1`) as any[];
  if (yaHay.length > 0) return;

  await sql`
    INSERT INTO registro_lotes (registro_id, lote)
    SELECT id, lote_destino
    FROM registros
    WHERE lote_destino IS NOT NULL AND lote_destino <> ''
  `;
}

/**
 * Una sola foto por persona.
 *
 * Historicamente cada fila de `registros` guardaba su propia copia en base64,
 * asi que un ingreso diario multiplicaba la misma imagen. Con ~100 movimientos
 * por dia eso son cientos de MB al año de datos repetidos.
 *
 * La foto vigente vive en `personas`. Esta migracion mueve lo que quedo en la
 * bitacora y recien despues suelta la columna.
 *
 * El orden no es negociable: si se soltara la columna antes de copiar, se
 * perderian las fotos de las personas que no estuvieran en `personas`.
 */
async function consolidarFotos(sql: ReturnType<typeof getSql>) {
  const existe = (await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'registros' AND column_name = 'foto_url'
    LIMIT 1
  `) as any[];
  if (existe.length === 0) return;

  // 1. Personas que solo existen en la bitacora.
  await sql`
    INSERT INTO personas (dni, nombre, apellido, foto_url)
    SELECT DISTINCT ON (dni) dni, nombre, apellido, foto_url
    FROM registros
    ORDER BY dni, fecha_hora DESC
    ON CONFLICT (dni) DO NOTHING
  `;

  // 2. Identidades sin foto que si tienen una en algun movimiento.
  await sql`
    UPDATE personas p
    SET foto_url = f.foto_url
    FROM (
      SELECT DISTINCT ON (dni) dni, foto_url
      FROM registros
      WHERE foto_url IS NOT NULL AND foto_url <> ''
      ORDER BY dni, fecha_hora DESC
    ) f
    WHERE p.dni = f.dni AND (p.foto_url IS NULL OR p.foto_url = '')
  `;

  // 3. Ya esta todo a salvo en `personas`.
  await sql`ALTER TABLE registros DROP COLUMN foto_url`;
}

/**
 * Carga inicial de `personas` a partir de los datos que ya existen.
 * Solo corre si la tabla esta vacia, asi que es seguro llamarla siempre.
 *
 * Prioridad de la identidad: residentes > autorizados > ultimo registro.
 *
 * No toca `registros.foto_url` a proposito: esa columna puede no existir
 * (ya fue consolidada) y de las fotos de la bitacora se ocupa consolidarFotos().
 */
async function backfillPersonas(sql: ReturnType<typeof getSql>) {
  const yaHay = (await sql`SELECT 1 FROM personas LIMIT 1`) as any[];
  if (yaHay.length > 0) return;

  await sql`
    INSERT INTO personas (dni, nombre, apellido, foto_url)
    SELECT dni, nombre, apellido, foto_url FROM residentes
    ON CONFLICT (dni) DO NOTHING
  `;

  await sql`
    INSERT INTO personas (dni, nombre, apellido, foto_url)
    SELECT DISTINCT ON (dni) dni, nombre, apellido, foto_url
    FROM autorizados
    ORDER BY dni, usada ASC, created_at DESC
    ON CONFLICT (dni) DO NOTHING
  `;

  await sql`
    INSERT INTO personas (dni, nombre, apellido)
    SELECT DISTINCT ON (dni) dni, nombre, apellido
    FROM registros
    ORDER BY dni, fecha_hora DESC
    ON CONFLICT (dni) DO NOTHING
  `;
}

export async function ensureTables() {
  if (!tablesReady) {
    tablesReady = createTables().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}
