export interface PropertySetView {
  name: string;
  properties: { name: string; value: any }[];
}

export interface SelectedEntity {
  expressId: number;
  name: string;
  globalId: string;
  description: string;
  type: string;
  propertySets: PropertySetView[];
  discipline: string;
  volume: number | null;
  area: number | null;
  objectType: string;
  tag: string;
  ownerHistory: { creationDate: string; owningUser: string; owningApplication: string } | null;
  materials: string[];
  loadingDetails: boolean;
}

export interface TypeGroup {
  type: string;
  ids: number[];
}


export type LevelGroup = TypeGroup;

export type ViewPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface MeasurePoint {
  x: number;
  y: number;
  z: number;
  screen: { x: number; y: number } | null;
  snapped?: boolean;
  snapType?: 'vertex' | 'edge' | 'face' | 'face_center' | 'none';
}

export interface ModelBounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}