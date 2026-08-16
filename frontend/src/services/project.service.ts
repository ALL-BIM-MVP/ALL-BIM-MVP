import { api } from './api';
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

  // Listar los archivos (IFC, Excel, etc.) subidos a un proyecto
  async getProjectFiles(projectId: number): Promise<ProjectFile[]> {
    const response = await api.get(`/api/projects/${projectId}/files`);
    return response;
  },

  // Borrar un archivo del proyecto (solo quien lo subió o el dueño del proyecto)
  async deleteProjectFile(projectId: number, fileId: string | number): Promise<void> {
    await api.delete(`/api/projects/${projectId}/files/${fileId}`);
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
};