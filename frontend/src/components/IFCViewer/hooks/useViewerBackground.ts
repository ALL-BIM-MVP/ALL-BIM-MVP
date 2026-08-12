// TODO: extraer de useIfcModel.ts - fondo claro/oscuro
import { useState, useRef, useEffect, useCallback } from 'react';

export function useViewerBackground(rendererRef: React.RefObject<any>) {
  const [isDarkBackground, setIsDarkBackground] = useState(false);
  const isDarkBackgroundRef = useRef(false);

  useEffect(() => { isDarkBackgroundRef.current = isDarkBackground; }, [isDarkBackground]);

  const toggleBackground = useCallback(() => {
    setIsDarkBackground(prev => {
      const next = !prev;
      rendererRef.current?.requestRender?.();
      return next;
    });
  }, [rendererRef]);

  const getClearColor = useCallback((): [number, number, number, number] => {
    return isDarkBackgroundRef.current
      ? [0.08, 0.09, 0.11, 1]
      : [0.9333, 0.9333, 0.9333, 1];
  }, []);

  return { isDarkBackground, toggleBackground, getClearColor };
}