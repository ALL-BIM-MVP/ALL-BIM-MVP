// Plano de sección/corte: oculta parte del modelo según un eje y una posición (0-100%).
// Se integra pasando el resultado de getSectionPlane() dentro de renderer.render({ sectionPlane }),
// exactamente igual que ya hacés con clearColor.
import { useState, useCallback, useRef, useEffect } from 'react';

export type SectionPlaneAxis = 'down' | 'front' | 'side';

export interface SectionPlaneState {
  axis: SectionPlaneAxis;
  position: number; 
  enabled: boolean;
  flipped: boolean; 
}

const DEFAULT_STATE: SectionPlaneState = {
  axis: 'down',
  position: 50,
  enabled: false,
  flipped: false,
};

export function useSectionPlane(rendererRef: React.RefObject<any>) {
  const [state, setState] = useState<SectionPlaneState>(DEFAULT_STATE);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const setAxis = useCallback((axis: SectionPlaneAxis) => {
    setState(prev => ({ ...prev, axis }));
  }, []);

  const setPosition = useCallback((position: number) => {
    setState(prev => ({ ...prev, position: Math.max(0, Math.min(100, position)) }));
  }, []);

  const toggleEnabled = useCallback(() => {
    setState(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const toggleFlipped = useCallback(() => {
    setState(prev => ({ ...prev, flipped: !prev.flipped }));
  }, []);

  const resetSection = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  // Llamar dentro del render loop, junto a getClearColor(), para armar el objeto
  // que espera renderer.render({ sectionPlane }). Devuelve undefined cuando está
  // desactivado, para que el render loop pueda omitir la clave sin problema.
  const getSectionPlane = useCallback(() => {
    const s = stateRef.current;
    if (!s.enabled) return undefined;
    return {
      axis: s.axis,
      position: s.position,
      enabled: true,
      flipped: s.flipped,
    };
  }, []);

  return {
    sectionAxis: state.axis,
    sectionPosition: state.position,
    sectionEnabled: state.enabled,
    sectionFlipped: state.flipped,
    setSectionAxis: setAxis,
    setSectionPosition: setPosition,
    toggleSectionEnabled: toggleEnabled,
    toggleSectionFlipped: toggleFlipped,
    resetSection,
    getSectionPlane,
  };
}