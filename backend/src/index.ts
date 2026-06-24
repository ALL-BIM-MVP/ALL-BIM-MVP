import 'dotenv/config';
import express from "express";
import routerAuth from './routes/auth.routes.js';
import pool from './db/database.js'
const app = express();


app.use(express.json());
//app.use(express.urlencoded({extended: false}));

//rutas definidas

app.use('/auth', routerAuth);

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "DB no conectada" });
  }
});



const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`\nServidor corriendo en http://localhost:${PORT}\n`);
});