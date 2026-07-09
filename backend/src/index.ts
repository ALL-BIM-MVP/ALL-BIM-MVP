import 'dotenv/config';
import express from "express";
import corsConfig from './utils/cors.js'
import routerAuth from './routes/auth.routes.js';
import routerRoles from './routes/roles.routes.js';
import routerUsers from './routes/users.routes.js';
import routerInvitationUser from './routes/user-invitations.routes.js'
import { errorHandler } from './middlewares/error.middleware.js';
const app = express();

app.use(corsConfig);
app.use(express.json());
app.use(express.urlencoded({extended: false}));

app.use('/api/auth', routerAuth);
app.use('/api/roles', routerRoles);
app.use('/api/users', routerUsers);
app.use('/api/invitations', routerInvitationUser);

app.use(errorHandler)
const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`\nServidor corriendo en http://localhost:${PORT}\n`);

});

