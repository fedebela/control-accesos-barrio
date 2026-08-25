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

export async function ensureTables() {
  const sql = getSql();

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
      lote VARCHAR(20),
      fecha_expiracion DATE,
      autorizado BOOLEAN DEFAULT FALSE,
      link_token VARCHAR(100) UNIQUE,
      foto_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

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
      residente_nombre VARCHAR(100),
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
}
