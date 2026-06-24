import { Pool } from 'pg';

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