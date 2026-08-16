// src/types/project.types.ts

export type ProjectScope = 'mine' | 'owner' | 'member' | 'all';

export interface CoverImage {
  file_id: string | null;
  name: string;
  mime_type: string;
  url: string;
}

export interface Project {
  project_id: number;
  name: string;
  location: string;
  description: string;
  start_date: string;
  end_date: string;
  estado: string;
  hasIFC: boolean;
  scope: ProjectScope;
  created_at?: string;
  owner?: {
    user_id: number;
    user_name: string;
  };
  client: string | null;
  contractor: string | null;
  cover_image: CoverImage;
}

export interface IFCFile {
  id: number;
  name: string;
  size: number;
  uploadDate: string;
}

export interface NewProjectData {
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
  client?: string | null;
  contractor?: string | null;
}

export type TabType = 'inicio' | 'archivos' | 'colaboradores' | 'visor3d' | 'modulos';