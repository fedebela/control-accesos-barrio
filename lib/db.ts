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
      autorizado_por VARCHAR(100),
      es_entrada BOOLEAN NOT NULL,
      foto_url TEXT,
      fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

  await sql`ALTER TABLE registros   ADD COLUMN IF NOT EXISTS foto_url TEXT`;
  await sql`ALTER TABLE registros   ALTER COLUMN residente_nombre TYPE VARCHAR(200)`;

  // ---------- INDICES ----------
  await sql`CREATE INDEX IF NOT EXISTS idx_registros_dni_fecha ON registros (dni, fecha_hora DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_registros_fecha ON registros (fecha_hora DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_autorizados_dni ON autorizados (dni)`;
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
