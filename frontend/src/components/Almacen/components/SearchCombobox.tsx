import React, { useEffect, useRef, useState } from 'react';

interface SearchComboboxProps<T> {
  selected: T | null;
  onSelect: (item: T | null) => void;
  search: (term: string) => Promise<T[]>;
  getId: (item: T) => string | number;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  placeholder?: string;
  emptyMessage?: string;
  footer?: React.ReactNode;
}

/** Combo con búsqueda: escribís, filtra pegándole al backend (debounce de 300ms), elegís de la
 * lista. Mientras no se edita, muestra la etiqueta de lo ya elegido en vez de un id suelto. */
function SearchCombobox<T>({
  selected, onSelect, search, getId, getLabel, getSubLabel, placeholder, emptyMessage = 'Sin resultados.', footer,
}: SearchComboboxProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timer = setTimeout(() => {
      search(query).then(setResults).catch(() => setResults([])).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const displayValue = open ? query : (selected ? getLabel(selected) : '');

  return (
    <div ref={containerRef} className="relative">
      <input
        value={displayValue}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        placeholder={placeholder}
        className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-gray-400">Buscando...</p>}
          {!loading && results.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">{emptyMessage}</p>}
          {!loading && results.map((item) => (
            <button
              key={getId(item)}
              type="button"
              onClick={() => { onSelect(item); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
            >
              <p className="text-gray-800">{getLabel(item)}</p>
              {getSubLabel && <p className="text-xs text-gray-400">{getSubLabel(item)}</p>}
            </button>
          ))}
          {footer && (
            <div className="border-t border-gray-100 px-3 py-2">
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchCombobox;
