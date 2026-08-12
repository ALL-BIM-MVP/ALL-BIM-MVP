// src/types/project.types.ts


export type ProjectScope = 'mine' | 'owner' | 'member' | 'all';


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
}


export type TabType = 'inicio' | 'archivos' | 'colaboradores' | 'visor3d' | 'modulos';