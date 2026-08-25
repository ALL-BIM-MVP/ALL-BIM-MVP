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
    user_last_name: string | null;
  };
  client: string | null;
  contractor: string | null;
  cover_image: CoverImage;
}

export interface ProjectFileUploader {
  user_id: number;
  user_name: string;
  user_last_name: string | null;
  user_email: string;
}

export interface ProjectFile {
  file_id: string;
  project_id: number;
  file_type: string;
  name: string;
  file_size: string;
  checksum: string;
  mime_type: string;
  uploaded_at: string;
  uploaded_by: ProjectFileUploader;
  processed?: boolean;
  // Fase 3 (especialidad + versionado de IFC) — todos opcionales porque
  // no todo archivo del proyecto es un IFC (puede ser una imagen, un
  // Excel, un PDF, etc.). Vienen null/undefined para esos casos.
  ifc_document_id?: string | null;
  ifc_document_name?: string | null;
  version_number?: number | null;
  is_current?: boolean | null;
  specialty_code?: string | null;
  specialty_name?: string | null;
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