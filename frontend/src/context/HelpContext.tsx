import React, { createContext, useCallback, useContext, useState } from 'react';

// Qué sección de /ayuda le corresponde a la pantalla actual — cada
// pantalla/pestaña avisa la suya con useHelpSection(id) (abajo). Sin
// aviso, "primeros-pasos" (el tope de la guía).
const DEFAULT_SECTION = 'primeros-pasos';

interface HelpContextType {
  helpSection: string;
  setHelpSection: (section: string) => void;
}

const HelpContext = createContext<HelpContextType | undefined>(undefined);

export const HelpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [helpSection, setHelpSection] = useState(DEFAULT_SECTION);
  return (
    <HelpContext.Provider value={{ helpSection, setHelpSection }}>
      {children}
    </HelpContext.Provider>
  );
};

export const useHelp = (): HelpContextType => {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error('useHelp debe usarse dentro de un HelpProvider');
  return ctx;
};

// Para que una pantalla anuncie su sección: useHelpSection('colaboradores').
export const useHelpSection = (section: string): void => {
  const { setHelpSection } = useHelp();
  const set = useCallback(() => setHelpSection(section), [section, setHelpSection]);
  React.useEffect(() => { set(); }, [set]);
};
