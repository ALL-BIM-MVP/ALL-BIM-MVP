import { api, BASE_URL } from './api';
import { Project, NewProjectData, ProjectScope, ProjectFile } from '../types/project.types';

export const projectService = {
  // Obtener proyectos con filtro por scope
  async getProjects(scope: ProjectScope = 'all'): Promise<Project[]> {
    const response = await api.get(`/api/projects?scope=${scope}`);
    return response;
  },

  // Crear un nuevo proyecto
  async createProject(projectData: NewProjectData): Promise<Project> {
    const newProject = {
      name: projectData.name,
      start_date: projectData.startDate,
      end_date: projectData.endDate,
      location: projectData.location,
      description: projectData.description,
      // El backend exige que estas dos keys vengan siempre en el create,
      // aunque el valor sea null (no se puede omitir la key).
      client: projectData.client ?? null,
      contractor: projectData.contractor ?? null,
    };

    const response = await api.post('/api/projects', newProject);
    return response;
  },

  async getProjectById(id: number): Promise<Project> {
    const response = await api.get(`/api/projects/${id}`);
    return response;
  },

  // Eliminar un proyecto
  async deleteProject(id: number): Promise<void> {
    await api.delete(`/api/projects/${id}`);
  },

  // Subir archivo IFC
  async uploadIFC(projectId: number, file: File): Promise<Project> {
    const formData = new FormData();
    formData.append('ifcFile', file);
    const response = await api.postFormData(`/api/projects/${projectId}/ifc`, formData);
    return response;
  },

  // Actualizar datos del proyecto (solo dueño con rol permitido)
  async updateProject(id: number, data: Partial<NewProjectData>): Promise<Project> {
    const payload: Record<string, any> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.startDate !== undefined) payload.start_date = data.startDate;
    if (data.endDate !== undefined) payload.end_date = data.endDate;
    if (data.location !== undefined) payload.location = data.location;
    if (data.description !== undefined) payload.description = data.description;
    // PATCH sí acepta parcial (según la doc), así que estos dos solo van
    // si realmente se editaron.
    if (data.client !== undefined) payload.client = data.client;
    if (data.contractor !== undefined) payload.contractor = data.contractor;

    const response = await api.patch(`/api/projects/${id}`, payload);
    return response;
  },

  // Fijar/reemplazar la imagen de portada del proyecto (solo dueño)
  async setCoverImage(projectId: number, file: File): Promise<Project['cover_image']> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.putFormData(`/api/projects/${projectId}/image`, formData);
    return response;
  },

  // Borrar la portada (vuelve a la imagen default)
  async deleteCoverImage(projectId: number): Promise<Project['cover_image']> {
    const response = await api.delete(`/api/projects/${projectId}/image`);
    return response;
  },

  // Listar los archivos (IFC, Excel, etc.) subidos a un proyecto.
  // Desde el fix de backend, esta lista ya NO incluye la portada del
  // proyecto, y cada imagen trae thumbnail_url (URL firmada, ver
  // getThumbnailSrc más abajo).
  async getProjectFiles(projectId: number): Promise<ProjectFile[]> {
    const response = await api.get(`/api/projects/${projectId}/files`);
    return response;
  },

  // Borrar un archivo del proyecto (solo quien lo subió o el dueño del proyecto)
  async deleteProjectFile(projectId: number, fileId: string | number): Promise<void> {
    await api.delete(`/api/projects/${projectId}/files/${fileId}`);
  },

  // Sube un archivo cualquiera al proyecto (imagen, excel, pdf, etc.) — mismo
  // endpoint que uploadIFC pero genérico, con el campo "file" que espera el
  // backend para el resto de tipos. Si el archivo sube como imagen, el
  // backend genera su miniatura solo (ver doc de endpoints).
  // Usado por ej. desde el visor 3D para guardar una captura de pantalla
  // como archivo del proyecto.
  async uploadFile(projectId: number, file: File): Promise<ProjectFile> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.postFormData(`/api/projects/${projectId}/files`, formData);
    return response;
  },

  // Descargar el contenido real de un archivo y disparar la descarga en el navegador
  async downloadFile(fileId: string | number, fileName: string): Promise<void> {
    const blob = await api.getBlob(`/api/files/${fileId}/content`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Arma la URL absoluta y lista-para-usar de la miniatura de una imagen.
  // thumbnail_url ya viene firmada desde el backend (?token=...), acá solo
  // le pegamos el baseUrl delante — SIN Authorization, SIN fetch a mano,
  // el navegador la resuelve como cualquier <img src>.
  // Devuelve null si el archivo no es imagen o no tiene miniatura generada
  // (archivo corrupto, formato raro al subir).
  //
  // WORKAROUND: el backend documenta la ruta como /api/files/:id/thumbnail,
  // pero el campo thumbnail_url que realmente devuelve en la lista viene
  // SIN el prefijo /api (confirmado con 404 real al pegar la URL tal cual).
  // Lo agregamos acá si no está, para no depender de que se corrija del
  // lado del backend. Si el backend lo arregla más adelante y empieza a
  // mandar el /api ya incluido, este chequeo evita duplicarlo.
  getThumbnailSrc(file: ProjectFile & { thumbnail_url?: string | null }): string | null {
    if (!file.thumbnail_url) return null;
    const path = file.thumbnail_url.startsWith('/api')
      ? file.thumbnail_url
      : `/api${file.thumbnail_url}`;
    return `${BASE_URL}${path}`;
  },

  // Pide el archivo completo (ej. una imagen a tamaño real) como Blob,
  // autenticado con el access token normal. Pensado para uso on-demand
  // (ej. al hacer click en una miniatura para verla en grande), no para
  // listas — para eso está getThumbnailSrc.
  async getFileContentBlob(fileId: string | number): Promise<Blob> {
    return api.getBlob(`/api/files/${fileId}/content`);
  },
};