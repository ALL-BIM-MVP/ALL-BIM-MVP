import { api, BASE_URL } from './api';
import { Project, NewProjectData, ProjectScope, ProjectFile } from '../types/project.types';

export const projectService = {
  async getProjects(scope: ProjectScope = 'mine'): Promise<Project[]> {
    const response = await api.get(`/api/projects?scope=${scope}`);
    return response;
  },

  async createProject(projectData: NewProjectData): Promise<Project> {
    const newProject = {
      name: projectData.name,
      start_date: projectData.startDate,
      end_date: projectData.endDate,
      location: projectData.location,
      description: projectData.description,
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

  async deleteProject(id: number): Promise<void> {
    await api.delete(`/api/projects/${id}`);
  },

  async uploadIFC(projectId: number, file: File): Promise<Project> {
    const formData = new FormData();
    formData.append('ifcFile', file);
    const response = await api.postFormData(`/api/projects/${projectId}/ifc`, formData);
    return response;
  },

  async updateProject(id: number, data: Partial<NewProjectData>): Promise<Project> {
    const payload: Record<string, any> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.startDate !== undefined) payload.start_date = data.startDate;
    if (data.endDate !== undefined) payload.end_date = data.endDate;
    if (data.location !== undefined) payload.location = data.location;
    if (data.description !== undefined) payload.description = data.description;
    if (data.client !== undefined) payload.client = data.client;
    if (data.contractor !== undefined) payload.contractor = data.contractor;

    const response = await api.patch(`/api/projects/${id}`, payload);
    return response;
  },

  async setCoverImage(projectId: number, file: File): Promise<Project['cover_image']> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.putFormData(`/api/projects/${projectId}/image`, formData);
    return response;
  },

  async deleteCoverImage(projectId: number): Promise<Project['cover_image']> {
    const response = await api.delete(`/api/projects/${projectId}/image`);
    return response;
  },

  // Fase 3: onlyCurrent=true reduce los IFC de la lista a solo la
  // versión vigente de cada documento (sin el param, se sigue viendo
  // TODO el historial — comportamiento de siempre, no rompe nada).
  async getProjectFiles(projectId: number, onlyCurrent?: boolean): Promise<ProjectFile[]> {
    const qs = onlyCurrent ? '?only_current=true' : '';
    const response = await api.get(`/api/projects/${projectId}/files${qs}`);
    return response;
  },

  async deleteProjectFile(projectId: number, fileId: string | number): Promise<void> {
    await api.delete(`/api/projects/${projectId}/files/${fileId}`);
  },

  async uploadFile(projectId: number, file: File): Promise<ProjectFile> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.postFormData(`/api/projects/${projectId}/files`, formData);
    return response;
  },

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

  getThumbnailSrc(file: ProjectFile & { thumbnail_url?: string | null }): string | null {
    if (!file.thumbnail_url) return null;
    const path = file.thumbnail_url.startsWith('/api')
      ? file.thumbnail_url
      : `/api${file.thumbnail_url}`;
    return `${BASE_URL}${path}`;
  },

  async getFileContentBlob(fileId: string | number): Promise<Blob> {
    return api.getBlob(`/api/files/${fileId}/content`);
  },
};