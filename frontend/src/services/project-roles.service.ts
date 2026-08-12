import { api } from './api';
import { ProjectRole, CreateProjectRoleRequest, UpdateProjectRoleRequest } from '../types/project-role.types';

export const getProjectRoles = async (): Promise<ProjectRole[]> => {
    const response = await api.get(`/api/project-roles`);
    return response || [];
};

export const createProjectRole = async (data: CreateProjectRoleRequest): Promise<ProjectRole> => {
    const response = await api.post(`/api/project-roles`, data);
    return response || null;
};

export const updateProjectRole = async (
    roleId: number,
    data: UpdateProjectRoleRequest
): Promise<ProjectRole> => {
    const response = await api.patch(`/api/project-roles/${roleId}`, data);
    return response || null;
};

export const deleteProjectRole = async (roleId: number): Promise<void> => {
    await api.delete(`/api/project-roles/${roleId}`);
};