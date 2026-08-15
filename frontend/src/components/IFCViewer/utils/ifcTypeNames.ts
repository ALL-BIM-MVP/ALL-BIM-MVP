import * as WebIFC from 'web-ifc';

export function getIfcTypeName(api: WebIFC.IfcAPI, typeCode: number): string {
  try {
    return api.GetNameFromTypeCode(typeCode) ?? `Tipo ${typeCode}`;
  } catch {
    return `Tipo ${typeCode}`;
  }
}