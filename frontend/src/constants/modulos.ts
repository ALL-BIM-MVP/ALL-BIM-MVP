// src/constants/modulos.ts
import { Ruler, HardHat, ClipboardList, Package, FileSpreadsheet, Layers } from 'lucide-react';

export const MODULOS = [
  { id: 'metrados', icon: Ruler, label: 'METRADOS BIM', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'ssomma', icon: HardHat, label: 'SSOMMA BIM', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'calidad', icon: ClipboardList, label: 'CALIDAD BIM', color: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'logistica', icon: Package, label: 'LOGÍSTICA BIM', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'costos', icon: FileSpreadsheet, label: 'COSTOS BIM (SO)', color: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'planos', icon: Layers, label: 'PLANOS BIM', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
];