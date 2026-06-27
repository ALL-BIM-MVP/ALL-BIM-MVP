import 'dotenv/config';
import express from "express";
import routerAuth from './routes/auth.routes.js';
const app = express();


app.use(express.json());
//app.use(express.urlencoded({extended: false}));

//rutas definidas

app.use('/auth', routerAuth);

app.post("/", async (req, res) => {
  try {
    res.json(typeof req.body.numero);
  } catch (error) {
    res.status(500).json({ error: "DB no conectada" });
  }
});

//const hash = await bcrypt.hash('hash_de_prueba', 10);
//console.log(`hash de 'hash_de_prueba' : ${hash}`);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`\nServidor corriendo en http://localhost:${PORT}\n`);

});