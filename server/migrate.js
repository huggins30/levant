import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

async function runMigration() {
  const connectionStrings = [
    'postgresql://postgres:kRyeHULh4isM3pYg@db.itymatyeumivirdgsdgx.supabase.co:5432/postgres',
    'postgresql://postgres.itymatyeumivirdgsdgx:kRyeHULh4isM3pYg@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    'postgresql://postgres.itymatyeumivirdgsdgx:kRyeHULh4isM3pYg@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.itymatyeumivirdgsdgx:kRyeHULh4isM3pYg@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
    'postgresql://postgres.itymatyeumivirdgsdgx:kRyeHULh4isM3pYg@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'
  ];

  let client = null;
  for (const conn of connectionStrings) {
    try {
      console.log('Intentando conectar a:', conn.split('@')[1]);
      const c = new Client({
        connectionString: conn,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 7000
      });
      await c.connect();
      console.log('✅ Conectado exitosamente!');
      client = c;
      break;
    } catch (err) {
      console.log('Fallo conexión:', err.message);
    }
  }

  if (!client) {
    console.error('❌ No se pudo conectar a PostgreSQL');
    return;
  }

  try {
    const sqlPath = path.resolve('../supabase/activacion_repartidor_comercio.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Ejecutando activacion_repartidor_comercio.sql...');
    await client.query(sql);
    console.log('🎉 Migración ejecutada con éxito total en Supabase!');
  } catch (err) {
    console.error('Error ejecutando migración:', err);
  } finally {
    await client.end();
  }
}

runMigration();
