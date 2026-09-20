import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Plus, Filter, Search, Eye } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import NewProjectModal from '../components/projects/NewProjectModal';
import ProjectDetailsModal from '../components/projects/ProjectDetailsModal';
import { OnboardingTour } from '../components/OnboardingTour';
import { Project, ProjectScope } from '../types/project.types';
import { useProjects } from '../hooks/useProjects';
import { resolveMediaUrl } from '../utils/media';

const ProjectRegistration: React.FC = () => {
  const navigate = useNavigate();

  const { projects, fetchProjects, createProject, deleteProject, filterScope, setFilterScope, error } = useProjects();

  const [showNewProject, setShowNewProject] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedProjectForDetails, setSelectedProjectForDetails] = useState<Project | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Cargar proyectos respetando el scope actual
  useEffect(() => {
    fetchProjects(filterScope);
  }, [fetchProjects, filterScope]);

  const handleScopeChange = (scope: ProjectScope) => {
    setFilterScope(scope);
  };

  const handleCreateProject = async (projectData: any) => {
    try {
      await createProject({
        name: projectData.name,
        location: projectData.location,
        startDate: projectData.startDate,
        endDate: projectData.endDate,
        description: projectData.description,
        client: projectData.client ?? null,
        contractor: projectData.contractor ?? null
      });
      setShowNewProject(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al crear el proyecto');
      throw error; // el modal necesita enterarse para no resetear el form
    }
  };

  const handleProjectClick = (project: Project) => {
    navigate(`/dashboard-projects/${project.project_id}`);
  };

  const handleViewDetails = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProjectForDetails(project);
    setShowDetailsModal(true);
  };

  // El scope ya lo filtra el backend; acá solo filtramos por búsqueda
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          project.location.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'Activo': return 'bg-green-100 text-green-700';
      case 'Completado': return 'bg-blue-100 text-blue-700';
      case 'Pendiente': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Proyectos" subtitle="Gestiona los proyectos" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-12 mb-8">
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewProject(true)}
              data-tour="new-project-button"
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0056b3] text-white rounded-lg hover:bg-[#004494] transition-colors font-semibold text-sm"
            >
              <Plus size={16} />
              Nuevo Proyecto
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar proyectos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056b3] focus:border-transparent outline-none w-56 text-sm transition"
            />
          </div>
        </div>

        {/* Filtros rápidos por scope */}
        <div className="flex gap-2 mb-6 flex-wrap" data-tour="scope-filters">
          <button
            onClick={() => handleScopeChange('mine')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filterScope === 'mine'
                ? 'bg-[#0056b3] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Mis proyectos
          </button>
          <button
            onClick={() => handleScopeChange('owner')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filterScope === 'owner'
                ? 'bg-[#0056b3] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Propietario
          </button>
          <button
            onClick={() => handleScopeChange('member')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filterScope === 'member'
                ? 'bg-[#0056b3] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Miembro
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.length === 0 ? (
            <div className="col-span-3 bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">No se encontraron proyectos</p>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.project_id}
                onClick={() => handleProjectClick(project)}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-[#0056b3] transition-all duration-200 flex flex-col cursor-pointer"
              >
                <div className="aspect-video w-full bg-gray-100 overflow-hidden">
                  <img
                    src={resolveMediaUrl(project.cover_image.url)}
                    alt={`Portada de ${project.name}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-base font-bold text-gray-800 line-clamp-2">
                        {project.name}
                      </h3>
                      {project.hasIFC && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex-shrink-0 ml-2">
                          IFC
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                      <MapPin size={14} className="text-gray-400" />
                      <span>{project.location}</span>
                    </div>

                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(project.estado)}`}>
                        {project.estado}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                      {project.description}
                    </p>
                  </div>

                  <button
                    onClick={(e) => handleViewDetails(project, e)}
                    className="w-full mt-2 px-3 py-1.5 text-[#0056b3] border border-[#0056b3] rounded-lg hover:bg-[#0056b3] hover:text-white transition-colors text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Eye size={14} />
                    Ver Detalles
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <NewProjectModal
          isOpen={showNewProject}
          onClose={() => setShowNewProject(false)}
          onCreate={handleCreateProject}
        />

        <ProjectDetailsModal
          isOpen={showDetailsModal}
          onClose={() => setShowDetailsModal(false)}
          project={selectedProjectForDetails}
          onProjectDeleted={deleteProject}
        />

        <style>{`
          @keyframes floatIn {
            from { opacity: 0; transform: scale(0.95) translateY(-10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          .animate-floatIn { animation: floatIn 0.2s ease-out; }
          .line-clamp-2 {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
        `}</style>
      </div>

      <OnboardingTour />
    </div>
  );
};

export default ProjectRegistration;