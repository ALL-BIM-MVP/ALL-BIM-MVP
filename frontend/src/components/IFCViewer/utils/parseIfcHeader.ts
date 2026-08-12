export interface IfcFileInfo {
  schema: string;
  timestamp: string;
  author: string;
  organization: string;
  originatingSystem: string;
  preprocessorVersion: string;
  projectName: string;
  projectDescription: string;
  projectLongName: string;
}

// Separa los argumentos de nivel superior dentro de unos paréntesis,
// respetando paréntesis anidados (listas como ('valor')).
function splitTopLevelArgs(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let inString = false;

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === "'") inString = !inString;
    if (!inString) {
      if (char === '(') depth++;
      if (char === ')') depth--;
    }
    if (char === ',' && depth === 0 && !inString) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// 'texto' -> texto | $ -> '' | ('texto') -> texto
function cleanValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '$' || trimmed === '') return '';

  const quoted = trimmed.match(/^'(.*)'$/s);
  if (quoted) return quoted[1];

  const listMatch = trimmed.match(/^\((.*)\)$/s);
  if (listMatch) {
    return splitTopLevelArgs(listMatch[1])
      .map(cleanValue)
      .filter(Boolean)
      .join(', ');
  }

  return trimmed;
}

/**
 * Lee directamente el texto del archivo IFC (formato STEP/ISO-10303-21)
 * y extrae la información básica del header + la entidad IFCPROJECT.
 * No depende de ninguna librería de parseo IFC.
 */
export function parseIfcHeader(fileBuffer: ArrayBuffer): IfcFileInfo {
  const info: IfcFileInfo = {
    schema: '',
    timestamp: '',
    author: '',
    organization: '',
    originatingSystem: '',
    preprocessorVersion: '',
    projectName: '',
    projectDescription: '',
    projectLongName: '',
  };

  const sliceSize = Math.min(fileBuffer.byteLength, 3_000_000); // ~3MB
  const bytes = new Uint8Array(fileBuffer, 0, sliceSize);
  const text = new TextDecoder('utf-8').decode(bytes);

  // --- FILE_SCHEMA(('IFC4')); ---
  const schemaMatch = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  if (schemaMatch) info.schema = schemaMatch[1];

  // --- FILE_NAME(name, timestamp, (author), (org), preproc, origSystem, auth); ---
  const fileNameMatch = text.match(/FILE_NAME\s*\(([\s\S]*?)\)\s*;/i);
  if (fileNameMatch) {
    const args = splitTopLevelArgs(fileNameMatch[1]);
    if (args[1]) info.timestamp = cleanValue(args[1]);
    if (args[2]) info.author = cleanValue(args[2]);
    if (args[3]) info.organization = cleanValue(args[3]);
    if (args[4]) info.preprocessorVersion = cleanValue(args[4]);
    if (args[5]) info.originatingSystem = cleanValue(args[5]);
  }

  // --- #N=IFCPROJECT('GlobalId',#OwnerHistory,'Name','Description',$,'LongName',...); ---
  const projectMatch = text.match(/=\s*IFCPROJECT\s*\(([\s\S]*?)\)\s*;/i);
  if (projectMatch) {
    const args = splitTopLevelArgs(projectMatch[1]);
    if (args[2]) info.projectName = cleanValue(args[2]);
    if (args[3]) info.projectDescription = cleanValue(args[3]);
    if (args[5]) info.projectLongName = cleanValue(args[5]);
  }

  return info;
}