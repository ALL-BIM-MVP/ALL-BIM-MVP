// .. pages/DashboardProjects.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Upload, FileText, AlertCircle, 
  Plus, Download, X,
  ChevronRight, Search, Maximize2, Minimize2, FileSearch, Box, ArrowLeft
} from 'lucide-react';
import {
  House, FolderOpen, UsersThree, Cube, SquaresFour,
  MapPin, CalendarBlank, PencilSimple, CheckCircle, WarningCircle, ClipboardText
} from '@phosphor-icons/react';
import fondoImage from '../assets/inicio.jpg';
import logo from '../assets/logo3.png';
import IFCViewer from '../components/IFCViewer/IFCViewer';
import { MODULOS } from '../constants/modulos';
import { Project, IFCFile, TabType } from '../types/project.types';
import { useProjects } from '../hooks/useProjects';
import { usePermissions } from '../hooks/usePermissions';
import { useProjectInvitations } from '../hooks/useProjectInvitations';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatFileSize } from '../utils/dateUtils';
import InicioTab from '../components/tabs/InicioTab';
import ColaboradoresTab from "../components/tabs/ColaboradoresTab";
import ArchivosTab from "../components/tabs/ArchivosTab";
import Visor3DTab from "../components/tabs/Visor3DTab";

const DashboardProjects: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const { fetchProjectById, uploadIFC, updateProject, loading, error } = useProjects();

  const [project, setProject] = useState<Project | null>(null);
  const [ifcFiles, setIfcFiles] = useState<IFCFile[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('modulos');
  const [showModulos, setShowModulos] = useState(false);
  const [selectedModulos, setSelectedModulos] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);

  const [confirmedModuloId, setConfirmedModuloId] = useState<string | null>(null);

  // Visor3DTab NO debe desmontarse al cambiar de tab (perdería el IFC
  // cargado, la escena de Three.js, la cámara, etc. — ver el render más
  // abajo). Se monta recién la primera vez que el usuario entra al tab
  // 'visor3d', y a partir de ahí queda montado para siempre (solo se
  // oculta con CSS cuando no está activo).
  const [hasEnteredVisor3D, setHasEnteredVisor3D] = useState(false);
  useEffect(() => {
    if (activeTab === 'visor3d') setHasEnteredVisor3D(true);
  }, [activeTab]);

  const [sidebarVisible, setSidebarVisible] = useState(false);

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  // Cierra el menú de usuario al hacer click en cualquier otro lado de la
  // página — antes solo se cerraba tocando "Cerrar sesión" adentro del
  // propio menú, así que quedaba abierto para siempre si clickeabas afuera.
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { canEditProject } = usePermissions();
  const { isOwner, checkingOwner, userRole } = useProjectInvitations(project?.project_id || 0);
  const canActuallyEdit = canEditProject && isOwner && !checkingOwner;

  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    location: '',
    start_date: '',
    end_date: '',
    description: '',
    client: '',
    contractor: '',
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated()) {
      navigate('/login');
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    const loadProject = async () => {
      if (!id) {
        setProject(null);
        return;
      }
      try {
        const projectId = parseInt(id);
        const data = await fetchProjectById(projectId);
        setProject(data);
      } catch (err) {
        console.error('Error loading project:', err);
        setProject(null);
      }
    };
    loadProject();
  }, [id, fetchProjectById]);

  const handleModuloToggle = (moduloId: string) => {
    setSelectedModulos(prev =>
      prev.includes(moduloId) ? [] : [moduloId]
    );
  };

  const startEditing = () => {
    if (!project) return;
    setEditForm({
      name: project.name || '',
      location: project.location || '',
      start_date: project.start_date ? project.start_date.slice(0, 10) : '',
      end_date: project.end_date ? project.end_date.slice(0, 10) : '',
      description: project.description || '',
      client: project.client || '',
      contractor: project.contractor || '',
    });
    setIsEditingInfo(true);
  };

  const cancelEditing = () => {
    setIsEditingInfo(false);
  };

  const handleEditChange = (field: keyof typeof editForm, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const saveEditing = async () => {
    if (!project) return;
    setSavingInfo(true);
    try {
      const updated = await updateProject(project.project_id, {
        name: editForm.name,
        location: editForm.location,
        startDate: editForm.start_date,
        endDate: editForm.end_date,
        description: editForm.description,
        client: editForm.client.trim() ? editForm.client.trim() : null,
        contractor: editForm.contractor.trim() ? editForm.contractor.trim() : null,
      });
      setProject(updated);
      setIsEditingInfo(false);
    } catch (err) {
      console.error('Error al guardar cambios del proyecto:', err);
      alert('No se pudieron guardar los cambios. Intenta de nuevo.');
    } finally {
      setSavingInfo(false);
    }
  };

  // El tab de Colaboradores es visible para TODOS los miembros del
  // proyecto (owner e invitados) — quién puede invitar/gestionar vs. solo
  // ver la lista de miembros ya lo resuelve ColaboradoresTab por dentro
  // (según isOwner). Antes este array excluía el tab entero para
  // no-owners con un ternario condicional, dejando a los invitados sin
  // forma de ver ni siquiera la lista de miembros — por eso no aparecía.
  const tabs: { id: TabType; label: string; icon: any; shortcut?: string }[] = [
    { id: 'inicio', label: 'Inicio', icon: House },
    { id: 'archivos', label: 'Archivos', icon: FolderOpen, shortcut: 'Alt' },
    { id: 'colaboradores', label: 'Colaboradores', icon: UsersThree },
    { id: 'visor3d', label: 'Visor 3D', icon: Cube },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#0056b3] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando proyecto...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-600 mb-6">{error || 'Proyecto no encontrado'}</p>
          <button
            onClick={() => navigate('/projects')}
            className="w-full px-6 py-2 bg-[#0056b3] text-white rounded-lg hover:bg-[#004494] transition-colors"
          >
            Volver a Proyectos
          </button>
        </div>
      </div>
    );
  }

  const projectProgress = (() => {
    if (!project.start_date || !project.end_date) return null;
    const start = new Date(project.start_date).getTime();
    const end = new Date(project.end_date).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return null;
    const now = Date.now();
    return Math.round(Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)));
  })();

  return (
    <div className="min-h-screen bg-gray-50">

      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-[10000]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/dashboard/projects')}
                  className="-ml-2 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0056b3] hover:bg-blue-50 transition-colors flex-shrink-0"
                  title="Volver a Proyectos"
                  aria-label="Volver a Proyectos"
                >
                  <ArrowLeft size={18} />
                </button>
                <img src={logo} alt="Logo ALL-BIM" className="h-11 w-auto" />
                <span className="text-2xl font-black text-[#0056b3]"></span>
                <span className="text-sm text-gray-400">|</span>
                <span className="text-sm font-medium text-gray-600 truncate max-w-xs">{project.name}</span>
                {!checkingOwner && userRole && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-[#0056b3] border border-blue-100">
                    {userRole.role_name}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative border-l border-gray-200 pl-4" ref={userMenuRef}>
                <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2">
                  {user?.profile_picture_url ? (
                    <img
                      src={user.profile_picture_url}
                      alt={user.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#0056b3] text-white flex items-center justify-center text-sm font-bold">
                      {user?.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700">{user?.name || 'Usuario'}</span>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl ring-1 ring-black/5 border border-gray-100 py-5 px-5 z-50 animate-fadeInUp">
                    <div className="flex items-center gap-4 mb-4">
                      {user?.profile_picture_url ? (
                        <img
                          src={user.profile_picture_url}
                          alt={user.name}
                          className="w-14 h-14 rounded-full object-cover ring-2 ring-white shadow-sm flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-[#0056b3] text-white flex items-center justify-center text-xl font-bold ring-2 ring-white shadow-sm flex-shrink-0">
                          {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-base text-gray-800 truncate">{user?.name}</p>
                        <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mb-4">
                      {user?.role && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-600 ring-1 ring-gray-200">
                          {user.role}
                        </span>
                      )}
                      {!checkingOwner && userRole && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-[#0056b3] ring-1 ring-blue-200">
                          {userRole.role_name} en este proyecto
                        </span>
                      )}
                    </div>

                    <div className="border-t border-gray-100 pt-3 space-y-1 text-sm mb-1">
                      <div className="flex items-center justify-between px-1 py-1.5">
                        <span className="text-gray-400 text-xs uppercase tracking-wide font-semibold">ID de usuario</span>
                        <span className="text-gray-700 font-medium">#{user?.id}</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 pt-3 mt-2">
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          logout();
                          navigate('/login');
                        }}
                        className="w-full text-left px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2.5 font-semibold text-sm transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Cerrar sesión
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* CONTENIDO */}
      {/* Visor3DTab se monta la primera vez que se visita el tab, y a
          partir de ahí NUNCA se desmonta al cambiar de tab — solo se
          oculta con display:none. Antes esto vivía en un ternario
          (activeTab === 'visor3d' ? <Visor3DTab/> : <otros tabs/>), que
          desmontaba el componente por completo cada vez que se salía del
          tab, perdiendo el IFC cargado, la escena 3D y la cámara. */}
      {hasEnteredVisor3D && (
        <div
          className="fixed left-0 right-0 bottom-0 top-14 z-0"
          style={{ display: activeTab === 'visor3d' ? 'block' : 'none' }}
        >
          <Visor3DTab projectId={project?.project_id || 0} />
        </div>
      )}

      {activeTab !== 'visor3d' && (
      <div className="max-w-9xl mx-auto p-6 pb-32 pl-16 relative isolate">
            
        {/* TAB: INICIO */}
        {activeTab === 'inicio' && (
  <InicioTab
    project={project}
    

    canActuallyEdit={canActuallyEdit}
    isEditingInfo={isEditingInfo}
    savingInfo={savingInfo}
    editForm={editForm}
    confirmedModuloId={confirmedModuloId}
    onStartEditing={startEditing}
    onCancelEditing={cancelEditing}
    onEditChange={handleEditChange}
    onSaveEditing={saveEditing}
    onChangeModulo={() => {
      setConfirmedModuloId(null);
      setActiveTab('modulos');
    }}
  />
)}
   {activeTab === 'archivos' && (
  <ArchivosTab
    projectId={project?.project_id || 0}
    isProjectOwner={isOwner}
    currentUserId={user?.id}
  />
)}
        {/* Visible para cualquier miembro del proyecto (owner o invitado).
            ColaboradoresTab decide internamente qué mostrar según isOwner
            (el owner ve invitar/gestionar; el resto solo ve la lista de
            miembros) — por eso ya NO se filtra acá con "&& isOwner". */}
        {activeTab === 'colaboradores' && (
          <ColaboradoresTab onClose={() => setActiveTab('inicio')} 
          projectId={project?.project_id || 0} 
          />
        )}

        {activeTab === 'modulos' && (
          <div className="relative z-10 flex items-center justify-center min-h-[500px]">
            <div className="bg-white rounded-3xl w-[700px] max-h-[90vh] overflow-y-auto p-8 shadow-2xl border border-gray-200 animate-floatIn">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-3xl font-bold text-gray-800">SELECCIÓN DE MÓDULOS</h2>
                <button onClick={() => setActiveTab('inicio')} className="text-gray-400 hover:text-gray-600 transition text-2xl">
                  <X size={28} />
                </button>
              </div>
              
              <p className="text-sm text-gray-500 mb-6">Selecciona los módulos que deseas activar para este proyecto</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {MODULOS.map((modulo) => {
                  const Icon = modulo.icon;
                  const isSelected = selectedModulos.includes(modulo.id);
                  return (
                    <button
                      key={modulo.id}
                      onClick={() => handleModuloToggle(modulo.id)}
                      className={`p-6 rounded-2xl border-2 transition-all text-center ${
                        isSelected
                          ? `${modulo.color} border-[#0056b3] shadow-md scale-105`
                          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${
                        isSelected ? 'bg-white/50' : 'bg-gray-50'
                      }`}>
                        <Icon size={32} className={isSelected ? 'text-current' : 'text-gray-400'} />
                      </div>
                      <p className={`font-bold text-sm ${isSelected ? 'text-current' : 'text-gray-700'}`}>
                        {modulo.label}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
                {confirmedModuloId && (
                  <button onClick={() => { setSelectedModulos([]); setActiveTab('inicio'); }} className="px-6 py-2.5 text-gray-600 hover:text-gray-800 transition-colors font-semibold">
                    Cancelar
                  </button>
                )}
                <button
                  onClick={() => {
                    if (selectedModulos.length === 0) {
                      alert('Por favor, selecciona un módulo');
                      return;
                    }
                    const elegido = MODULOS.find(m => m.id === selectedModulos[0]);
                    const esMetrados = elegido?.label?.toLowerCase().includes('metrados');

                    if (!esMetrados) {
                      alert('Próximamente disponible. Por ahora solo Metrados BIM está activo.');
                      return;
                    }

                    setConfirmedModuloId(selectedModulos[0]);
                    setActiveTab('visor3d');
                  }}
                  className="px-8 py-2.5 bg-[#0056b3] text-white rounded-xl hover:bg-[#004494] transition-colors font-semibold flex items-center gap-2"
                >
                  SIGUIENTE
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Zona de detección invisible en el borde izquierdo — SOLO en Visor 3D */}
      {/* Zona de detección invisible en el borde izquierdo — SOLO en Visor 3D */}
{confirmedModuloId && activeTab === 'visor3d' && (
  <>
    <div
      className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-3 z-30"
      onMouseEnter={() => setSidebarVisible(true)}
    />

    {/* Señal visual chiquita: indica que hay un menú escondido en el borde */}
    {!sidebarVisible && (
  <div
    className="fixed left-0 top-1/2 -translate-y-1/2 w-2 h-28 bg-[#0056b3] rounded-r-full z-[9800] pointer-events-none animate-pulse shadow-xl"
  />
)}
  </>
)}

      {/* NAVEGACIÓN LATERAL (modo Visor 3D) — oculta por defecto, aparece al acercar el mouse */}
      {confirmedModuloId && activeTab === 'visor3d' && (
      <nav
        onMouseLeave={() => setSidebarVisible(false)}
        className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-40 flex flex-col items-center bg-white border-r border-gray-200 shadow-xl w-10 py-6 transition-transform duration-200 ease-out ${
          sidebarVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col items-center gap-1.5 w-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <div key={tab.id} className="relative w-full flex items-center justify-center group">
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-[#0056b3]" />
                )}

                <button
                  onClick={() => setActiveTab(tab.id)}
                  aria-label={tab.label}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-[#0056b3]/10 text-[#0056b3]'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                >
                  <Icon size={18} weight="duotone" />
                </button>

                <span
                  className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap
                             rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white
                             opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0
                             transition-all duration-150 shadow-lg"
                >
                  {tab.label}
                  <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
                </span>
              </div>
            );
          })}
        </div>
      </nav>
      )}

      {/* NAVEGACIÓN LATERAL (modo normal) — siempre visible, para Inicio/Archivos/Colaboradores */}
      {confirmedModuloId && activeTab !== 'visor3d' && (
      <nav className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-40 flex flex-col items-center bg-white border-r border-gray-200 shadow-md w-10 py-6">
        <div className="flex flex-col items-center gap-1.5 w-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <div key={tab.id} className="relative w-full flex items-center justify-center group">
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-[#0056b3]" />
                )}

                <button
                  onClick={() => setActiveTab(tab.id)}
                  aria-label={tab.label}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-[#0056b3]/10 text-[#0056b3]'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                >
                  <Icon size={18} weight="duotone" />
                </button>

                <span
                  className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap
                             rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white
                             opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0
                             transition-all duration-150 shadow-lg"
                >
                  {tab.label}
                  <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
                </span>
              </div>
            );
          })}
        </div>
      </nav>
      )}

      <style>{`
        html {
          scrollbar-gutter: stable;
          overflow-y: scroll;
        }
        @keyframes floatIn {
          from { opacity: 0; transform: scale(0.95) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-floatIn { animation: floatIn 0.2s ease-out; }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInUp { animation: fadeInUp 0.18s ease-out; }
      `}</style>
    </div>
  );
};

export default DashboardProjects;