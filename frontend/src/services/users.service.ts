import { api } from './api';
import type { User } from '../types/user.types';
import { resolveMediaUrl } from '../utils/media';

export interface UpdateMyProfileData {
  name?: string;
  last_name?: string;
}

export const updateMyProfile = async (data: UpdateMyProfileData): Promise<User> => {
  const result = await api.patch('/api/users/me', data);
  return {
    ...result,
    profile_picture_url: result.profile_picture_url ? resolveMediaUrl(result.profile_picture_url) : null,
  };
};

export const uploadMyPhoto = async (file: File): Promise<{ profile_picture_url: string | null }> => {
  const formData = new FormData();
  formData.append('file', file);
  const result = await api.putFormData('/api/users/me/photo', formData);
  return {
    profile_picture_url: result.profile_picture_url ? resolveMediaUrl(result.profile_picture_url) : null,
  };
};

export const deleteMyPhoto = (): Promise<{ profile_picture_url: null }> =>
  api.delete('/api/users/me/photo');

export const deleteMyAccount = (): Promise<{ message: string }> =>
  api.delete('/api/users/me');

// Acciones de administrador sobre OTRO usuario — pensadas para usarse
// desde AdminUsers.tsx (no se integran en este paso, solo se dejan
// listas para cuando se agreguen los botones ahí).
export const setUserActive = (userId: number, active: boolean): Promise<User> =>
  api.patch(`/api/users/${userId}/active`, { active });

export const deleteUser = (userId: number): Promise<{ message: string }> =>
  api.delete(`/api/users/${userId}`);