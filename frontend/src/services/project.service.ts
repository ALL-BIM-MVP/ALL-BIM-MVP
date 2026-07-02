// src/services/projectService.ts
import { Proyecto } from '../types/Project';

// Función auxiliar para leer del disco del navegador de forma segura
const obtenerDeLocalStorage = (): Proyecto[] => {
  const datos = localStorage.getItem('all_bim_proyectos');
  return datos ? JSON.parse(datos) : [];
};

// Función auxiliar para guardar en el disco del navegador
const guardarEnLocalStorage = (proyectos: Proyecto[]) => {
  localStorage.setItem('all_bim_proyectos', JSON.stringify(proyectos));
};

export const projectService = {
  // Procesa el archivo de la PC localmente y lo persiste
  crearDesdeIFC: (archivo: File): Proyecto => {
    const nuevoProyecto: Proyecto = {
      id: Date.now().toString(),
      nombre: archivo.name.replace('.ifc', ''),
      ubicacion: 'Local (Por definir)',
      fecha: new Date().toISOString().split('T')[0]
    };
    
    // Leemos los que ya existen, agregamos el nuevo y guardamos en el disco
    const proyectosActuales = obtenerDeLocalStorage();
    proyectosActuales.push(nuevoProyecto);
    guardarEnLocalStorage(proyectosActuales);

    return nuevoProyecto;
  },

  // Busca el proyecto en el disco duro usando su ID
  obtenerPorId: (id: string): Proyecto | undefined => {
    const proyectosActuales = obtenerDeLocalStorage();
    return proyectosActuales.find(p => p.id === id);
  },

  // Retorna todos los proyectos guardados sin perderlos al cambiar de pantalla
  obtenerTodos: (): Proyecto[] => {
    return obtenerDeLocalStorage();
  }
};