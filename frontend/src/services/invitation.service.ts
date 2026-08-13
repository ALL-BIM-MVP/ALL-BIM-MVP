import { api } from './api';
import {
    Invitation,
    UserSearchResult,
    CreateInvitationRequest,
    UpdateInvitationRequest,
    ProjectMember,
} from '../types/invitation.types';

export const getProjectInvitations = async (projectId: number): Promise<Invitation[]> => {
    // ✅ AGREGAR /api
    const response = await api.get(`/api/projects/${projectId}/invitations`);
    return response || [];
};

export const searchUsersToInvite = async (
    projectId: number,
    attribute: 'name' | 'email',
    value: string
): Promise<UserSearchResult[]> => {
    
    
    
    const response = await api.get(
        `/api/projects/${projectId}/invitations/search-users?attribute=${attribute}&value=${encodeURIComponent(value)}`
    );
    
    console.log(' RESPONSE:', response);
    return response || [];
};

export const createProjectInvitation = async (
    projectId: number,
    data: CreateInvitationRequest
): Promise<Invitation> => {
  
    
    const response = await api.post(`/api/projects/${projectId}/invitations`, data);
    
    
    return response || null;
};

export const updateInvitationStatus = async (
    projectId: number,
    invitationId: number,
    data: UpdateInvitationRequest
): Promise<Invitation> => {
    //  AGREGAR /api
    const response = await api.patch(
        `/api/projects/${projectId}/invitations/${invitationId}`,
        data
    );
    return response || null;
};

export const getProjectMembers = async (projectId: number): Promise<ProjectMember[]> => {
    //AGREGAR /api
    const response = await api.get(`/api/projects/${projectId}/members`);
    return response || [];
};

export const getCurrentUserProjectRole = async (projectId: number): Promise<{ role_id: number; role_name: string; is_owner: boolean }> => {
    //  AGREGAR /api
    const response = await api.get(`/api/projects/${projectId}/user-role`);
    return response || null;
};  
export const getMeInvitations = async (
    filter: 'all' | 'pending' | 'completed' = 'pending'
): Promise<any[]> => {
    const response = await api.get(`/api/users/invitations?filter=${filter}`);
    return response || [];
};

export const respondToInvitation = async (
    projectId: number,
    invitationId: number,
    status: 'aceptado' | 'rechazado'
): Promise<any> => {
    const response = await api.patch(
        `/api/projects/${projectId}/invitations/${invitationId}`,
        { status }
    );
    return response || null;
};