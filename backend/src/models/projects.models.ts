
import type { ProjectCreate } from "../schemas/projects.schema.js";

export interface Project extends ProjectCreate {
    project_id : number; 
    created_at : Date;
    created_by : number;
};

export interface ProjectOwner {
    user_id : number;
    user_name : string;
    role_id : number;
};

export interface ProjectRow extends ProjectCreate, ProjectOwner {
    project_id : number;
    created_at : Date;
};

export interface ProjectFull extends ProjectCreate {
    project_id: number;  
    created_at: Date;     
    owner : ProjectOwner;
};

export const transformProjectFull = (p : ProjectRow) : ProjectFull => {
    return {
        project_id: p.project_id,
        name: p.name,
        description: p.description,
        location: p.location,
        start_date: p.start_date,
        end_date: p.end_date,
        created_at: p.created_at,
        owner: {
            user_id: p.user_id,
            user_name: p.user_name,
            role_id: p.role_id,
        },
    };
};


