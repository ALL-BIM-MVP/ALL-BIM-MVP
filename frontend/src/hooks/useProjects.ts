import { useState, useEffect, useCallback } from 'react';
import { Project, ProjectScope, NewProjectData } from '../types/project.types';
import { projectService } from '../services/project.service';
import { useAuth } from '../context/AuthContext';
import { ROLE_IDS } from '../utils/roles';

export const useProjects = () => {
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo Administrador puede pedir "todos los proyectos" (scope=all).
  // El resto de roles ve únicamente los suyos ("mine").
  // Empieza en 'mine' por defecto (más restrictivo) hasta que
  // el useEffect de abajo confirme el rol real.
  const [filterScope, setFilterScope] = useState<ProjectScope>('mine');

  // Obtener todos los proyectos
  const fetchProjects = useCallback(async (scope: ProjectScope = 'mine') => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectService.getProjects(scope);
      setProjects(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar proyectos';
      setError(errorMessage);
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Obtener un proyecto por ID
  // NOTA: este endpoint (GET /api/projects/:id) no lleva scope.
  // Si el backend responde 403 aquí para un usuario que SÍ es dueño
  // o colaborador del proyecto, el ajuste hay que pedirlo al backend:
  // ese endpoint debería validar "¿eres dueño o colaborador de ESTE
  // proyecto?", no "¿eres Administrador global?".
  const fetchProjectById = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectService.getProjectById(id);
       
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar proyecto';
      setError(errorMessage);
      console.error('Error fetching project by id:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Crear proyecto
  const createProject = useCallback(async (projectData: NewProjectData) => {
    try {
      setLoading(true);
      setError(null);
      const createdProject = await projectService.createProject(projectData);
      setProjects(prev => [...prev, createdProject]);
      return createdProject;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al crear proyecto';
      setError(errorMessage);
      console.error('Error creating project:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Eliminar proyecto
  const deleteProject = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      await projectService.deleteProject(id);
      setProjects(prev => prev.filter(p => p.project_id !== id));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al eliminar proyecto';
      setError(errorMessage);
      console.error('Error deleting project:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Subir archivo IFC
  const uploadIFC = useCallback(async (projectId: number, file: File) => {
    try {
      setLoading(true);
      setError(null);
      const updatedProject = await projectService.uploadIFC(projectId, file);
      setProjects(prev => prev.map(p => p.project_id === projectId ? updatedProject : p));
      return updatedProject;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al subir archivo IFC';
      setError(errorMessage);
      console.error('Error uploading IFC:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
    const updateProject = useCallback(async (id: number, data: Partial<NewProjectData>) => {
    try {
      setLoading(true);
      setError(null);
      const updated = await projectService.updateProject(id, data);
      setProjects(prev => prev.map(p => p.project_id === id ? updated : p));
      return updated;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al actualizar proyecto';
      setError(errorMessage);
      console.error('Error updating project:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  // Recalcula el scope correcto cada vez que el usuario del Context
  // cambia (por ejemplo, cuando termina de cargar tras un F5).
  // No se calcula solo una vez en el useState de arriba, porque en el
  // primer render "user" puede llegar null y quedaría mal fijado.
  useEffect(() => {
    if (!user) return;
    const scope: ProjectScope = user.rol_id === ROLE_IDS.ADMINISTRADOR ? 'all' : 'mine';
    setFilterScope(scope);
  }, [user]);

  useEffect(() => {
    if (!user) return; // espera a que el AuthContext ya tenga el usuario cargado
    fetchProjects(filterScope);
  }, [filterScope, fetchProjects, user]);

  return {
    projects,
    loading,
    error,
    filterScope,
    setFilterScope,
    fetchProjects,
    fetchProjectById,
    createProject,
    deleteProject,
    uploadIFC,
     updateProject,
  };
};