import React, { useEffect, useState } from 'react';

// Tour corto, solo para el dashboard de proyectos (ver
// docs/roadmap/mejoras-orientacion-usuario-frontend.md, punto 1) —
// apunta a elementos reales vía data-tour="...", no a coordenadas fijas.
// Todos los pasos apuntan a elementos que existen SIEMPRE en esta
// pantalla, sin depender de que el usuario ya tenga proyectos creados.
const STORAGE_KEY = 'all-bim:onboarding-tour-seen';

interface TourStep {
  selector: string;
  title: string;
  text: string;
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="sidebar-projects"]',
    title: 'Panel de proyectos',
    text: 'Punto de partida de la aplicación: la lista completa de proyectos accesibles.',
  },
  {
    selector: '[data-tour="header-help"]',
    title: 'Ayuda',
    text: 'Acceso a la guía completa de la aplicación, organizada por tema — también disponible en cualquier momento con la tecla "?".',
  },
  {
    selector: '[data-tour="sidebar-invitations"]',
    title: 'Invitaciones',
    text: 'Historial de invitaciones a proyectos recibidas, incluidas las ya respondidas.',
  },
  {
    selector: '[data-tour="header-notifications"]',
    title: 'Notificaciones',
    text: 'Acceso rápido a las invitaciones pendientes de respuesta, sin salir de la pantalla actual.',
  },
  {
    selector: '[data-tour="header-profile"]',
    title: 'Perfil',
    text: 'Edición de nombre y foto de perfil, y cierre de sesión.',
  },
  {
    selector: '[data-tour="scope-filters"]',
    title: 'Filtros de proyectos',
    text: 'Permiten ver todos los proyectos accesibles, solo los propios como propietario, o solo aquellos donde se participa como miembro.',
  },
  {
    selector: '[data-tour="new-project-button"]',
    title: 'Crear un proyecto',
    text: 'Registro de un proyecto nuevo: nombre, ubicación, cliente y fechas.',
  },
];

export const OnboardingTour: React.FC = () => {
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    setStepIndex(0);
  }, []);

  useEffect(() => {
    if (stepIndex === null) return;

    const step = STEPS[stepIndex];
    const target = step ? document.querySelector(step.selector) : null;

    // Un paso cuyo elemento no está en el DOM (ej. la sección de
    // administración, que solo existe para roles con permiso) se
    // salta solo en vez de trabar el tour.
    if (!target) {
      if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
      else finish();
      return;
    }

    const update = () => setRect(target.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [stepIndex]);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setStepIndex(null);
    setRect(null);
  };

  if (stepIndex === null || !rect) return null;
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const pad = 6;
  const spotlight: React.CSSProperties = {
    position: 'fixed',
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 10,
    boxShadow: '0 0 0 9999px rgba(15, 18, 24, 0.55)',
    pointerEvents: 'none',
    zIndex: 1000,
    transition: 'all 0.2s ease',
  };

  const callout: React.CSSProperties = {
    position: 'fixed',
    top: rect.bottom + 14,
    left: Math.min(Math.max(rect.left, 16), window.innerWidth - 296),
    width: 280,
    zIndex: 1001,
  };

  return (
    <>
      <div style={spotlight} />
      <div style={callout} className="bg-white rounded-xl shadow-2xl p-4 border border-gray-200">
        <p className="text-xs font-semibold text-[#0056b3] mb-1">
          Paso {stepIndex + 1} de {STEPS.length}
        </p>
        <p className="font-semibold text-gray-800 mb-1">{step.title}</p>
        <p className="text-sm text-gray-600 mb-3">{step.text}</p>
        <div className="flex items-center justify-between">
          <button onClick={finish} className="text-xs text-gray-400 hover:text-gray-600">
            Omitir
          </button>
          <button
            onClick={() => (isLast ? finish() : setStepIndex(stepIndex + 1))}
            className="px-3 py-1.5 bg-[#0056b3] text-white rounded-lg text-sm font-medium hover:bg-[#004494]"
          >
            {isLast ? 'Finalizar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </>
  );
};
