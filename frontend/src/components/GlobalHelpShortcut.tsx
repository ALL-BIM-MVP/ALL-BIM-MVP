import { useEffect } from 'react';
import { useHelp } from '../context/HelpContext';

// Sin salida visual — solo escucha "?" desde cualquier pantalla y
// abre la guía (pestaña nueva, página pública, fuera de la app
// logueada) en la sección que corresponda (ver HelpContext).
const isTypingTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
};

export const GlobalHelpShortcut: React.FC = () => {
  const { helpSection } = useHelp();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      window.open(`/ayuda/${helpSection}`, '_blank', 'noopener');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpSection]);

  return null;
};
