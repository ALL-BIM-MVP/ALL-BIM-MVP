import { api } from './api';
import { Project, NewProjectData, ProjectScope } from '../types/project.types';

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

    const response = await api.patch(`/api/projects/${id}`, payload);
    return response;
  },
};