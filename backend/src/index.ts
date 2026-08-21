import 'dotenv/config';
import express from "express";
import corsConfig from './utils/cors.js'
import routerAuth from './routes/auth.routes.js';
import routerRoles from './routes/roles.routes.js';
import routerUsers from './routes/users.routes.js';
import routerInvitationUser from './routes/user-invitations.routes.js';
import routerProjects from './routes/projects.routes.js';
import routerProjectInvitations from './routes/project-invitations.routes.js';
import routerProjectMembers from './routes/project-members.routes.js';
import routerFiles, { fileContentRouter } from './routes/files.routes.js';
import routerIfcMetrados, { ifcFilesRouter } from './routes/ifc-metrados.routes.js';
import routerTemplates from './routes/templates.routes.js';
import routerModules, { projectModulesRouter } from './routes/modules.routes.js';
import routerIfcSpecialties, { projectIfcDocumentsRouter } from './routes/ifc-documents.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { recoverStaleProcessingRows } from './services/ifc-processing-runner.js';
import { PUBLIC_UPLOADS_DIR } from './middlewares/upload.midleware.js';
const app = express();

app.use(corsConfig);
app.use(express.json());
app.use(express.urlencoded({extended: false}));

// Público a propósito, SIN requireAuth — pero OJO: monta PUBLIC_UPLOADS_DIR
// (uploads/public/), NUNCA el UPLOADS_DIR completo. uploads/public/ solo
// contiene portadas de proyecto + la imagen por defecto (ver
// project-images.models.ts) — los archivos/documentos reales de un
// proyecto viven en uploads/<projectId>/, que queda AFUERA de este mount
// y solo se sirve autenticado vía GET /api/files/:id/content. Si algún
// día esto se monta directo sobre UPLOADS_DIR por error, cualquier
// archivo de cualquier proyecto queda descargable por cualquiera que
// adivine/filtre la URL — separar la carpeta es la protección real, no
// solo confiar en que el nombre de archivo tenga un UUID.
app.use('/uploads', express.static(PUBLIC_UPLOADS_DIR));

app.use('/api/auth', routerAuth);
app.use('/api/roles', routerRoles);
app.use('/api/users', routerUsers);
app.use('/api/invitations', routerInvitationUser);
app.use('/api/projects', routerProjects);
app.use('/api/projects', routerProjectInvitations );
app.use('/api/projects', routerProjectMembers );
app.use('/api/projects', routerFiles );
app.use('/api/files', fileContentRouter );
app.use('/api/projects', routerIfcMetrados );
app.use('/api/ifc-files', ifcFilesRouter );
app.use('/api/templates', routerTemplates );
app.use('/api/modules', routerModules );
app.use('/api/projects', projectModulesRouter );
app.use('/api/ifc-specialties', routerIfcSpecialties );
app.use('/api/projects', projectIfcDocumentsRouter );


app.use(errorHandler)
const PORT = Number(process.env.PORT) || 4000;

// Cualquier ifc_files en status='processing' al arrancar es huérfano
// (ningún proceso Node vivo lo está corriendo todavía) — se marca error
// antes de aceptar tráfico nuevo, así queda reintentable.
await recoverStaleProcessingRows();

app.listen(PORT, () => {
  console.log(`\nServidor corriendo en http://localhost:${PORT}\n`);

});
