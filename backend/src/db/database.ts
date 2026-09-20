import pg from 'pg';

// Las fechas "solo día" (DATE) llegan del cliente como "2026-09-10" y
// z.coerce.date() las convierte en un Date a medianoche UTC. Por defecto
// pg serializa un Date en la zona horaria LOCAL del proceso: en un servidor
// al oeste de UTC (Lima, UTC-5) eso era "2026-09-09T19:00-05:00" y Postgres
// guardaba el día ANTERIOR (verificado 2026-09-19). Con esto el Date se
// serializa en UTC y el día se conserva, sin importar la zona horaria del
// servidor. No cambia ningún TIMESTAMPTZ (mismo instante, otra notación).
pg.defaults.parseInputDatesAsUTC = true;

const { Pool } = pg;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT)
});

pool.connect()
  .then((client) => {
    console.log("🟢 PostgreSQL conectado correctamente");
    client.release();
  })
  .catch((err) => {
    console.error("🔴 Error conectando PostgreSQL:", err.message);
  });

export default pool;