import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  Rocket, FolderKanban, UploadCloud, Tags, ClipboardList,
  Users, Box, FileSpreadsheet, UserCircle, ArrowRight,
} from 'lucide-react';
import logo from '../assets/logo3.jpg';

interface Section {
  id: string;
  title: string;
  summary: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos',
    summary: 'Qué es ALL-BIM y qué se encuentra al iniciar sesión.',
    icon: Rocket,
    content: (
      <>
        <p className="text-sm text-gray-700 mb-3">
          ALL-BIM organiza el trabajo de un proyecto de construcción
          alrededor de sus modelos IFC (los archivos que exportan programas
          como Revit): quién puede verlos, qué elementos contienen y qué
          metrado (cantidad de material) representa cada uno.
        </p>
        <p className="text-sm text-gray-700 mb-3">
          Al iniciar sesión, la primera pantalla es el <b>panel de
          proyectos</b> — la lista completa de proyectos accesibles. Un
          proyecto aparece ahí en dos casos: se creó desde el botón "Nuevo
          Proyecto", o alguien invitó a participar en uno ya existente. Los
          filtros de arriba ("Mis proyectos", "Propietario", "Miembro")
          acotan esa lista según el tipo de participación.
        </p>
        <p className="text-sm text-gray-700 mb-3">
          El encabezado, en cualquier pantalla, tiene tres accesos
          constantes:
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-3 list-disc pl-5">
          <li>Una campana con las invitaciones a proyectos pendientes de respuesta.</li>
          <li>El nombre y foto propios, con acceso a editar el perfil o cerrar sesión.</li>
          <li>El signo de interrogación, que abre esta guía en una pestaña nueva — también con la tecla "?" desde cualquier pantalla.</li>
        </ul>
        <p className="text-sm text-gray-700">
          Crear un proyecto solo pide un nombre — el resto de los datos
          (ubicación, cliente, contratista, fechas) es opcional y se puede
          completar después. Un proyecto recién creado está vacío: el
          siguiente paso habitual es subir un modelo IFC (sección 3) o
          invitar a alguien más (sección 6).
        </p>
      </>
    ),
  },
  {
    id: 'dentro-de-un-proyecto',
    title: 'Dentro de un proyecto',
    summary: 'Las cuatro secciones que tiene cada proyecto, y para qué sirve cada una.',
    icon: FolderKanban,
    content: (
      <>
        <p className="text-sm text-gray-700 mb-4">
          Al entrar a un proyecto (haciendo clic en su tarjeta desde el
          panel), el menú lateral da acceso a cuatro secciones. Ninguna
          depende de las otras — se puede ir directo a cualquiera:
        </p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-800 mb-1.5">Inicio</p>
            <p className="text-xs text-gray-500">
              Datos generales: cliente, contratista, fechas, ubicación, la
              portada del proyecto, y un resumen de cuántos archivos y
              especialidades tiene.
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-800 mb-1.5">Archivos</p>
            <p className="text-xs text-gray-500">
              Todos los documentos del proyecto — los modelos IFC subidos y
              las exportaciones (Excel) generadas — con búsqueda, descarga
              y borrado.
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-800 mb-1.5">Colaboradores</p>
            <p className="text-xs text-gray-500">
              Quién forma parte del proyecto, invitaciones enviadas
              pendientes de respuesta, y el rol de acceso de cada persona.
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-800 mb-1.5">Visor 3D</p>
            <p className="text-xs text-gray-500">
              Donde se sube y visualiza el modelo IFC, y donde aparece la
              tabla de partidas con el metrado ya calculado.
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-700">
          Solo <b>Metrados BIM</b> está construido y funcionando hoy — el
          resto de los módulos que puedan aparecer mencionados en la
          aplicación (SSOMMA, Calidad, Logística, Costos, Planos) todavía
          son nombres reservados para el futuro, sin funcionalidad propia
          por ahora.
        </p>
      </>
    ),
  },
  {
    id: 'subir-ifc',
    title: 'Subir un modelo IFC',
    summary: 'Qué pide la aplicación al subir un archivo, y qué pasa después.',
    icon: UploadCloud,
    content: (
      <>
        <p className="text-sm text-gray-700 mb-3">
          Desde la sección Visor 3D de un proyecto, subir un archivo
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded mx-1">.ifc</code>
          arranca el proceso. Antes de aceptarlo, la aplicación pide un
          dato más: a qué <b>documento</b> pertenece.
        </p>
        <p className="text-sm text-gray-700 mb-3">
          Un documento es la identidad estable de un modelo a través del
          tiempo (por ejemplo, "Estructuras — Torre A"). La primera vez que
          se sube un archivo para ese documento, hay que indicar su
          <b> especialidad</b> (Arquitectura, Estructuras o Sanitarias). Si
          después aparece una versión corregida del mismo modelo, se sube
          como <b>nueva versión de ese mismo documento</b> — no como un
          archivo suelto — y la versión anterior queda guardada como
          historial, siempre disponible para descargar.
        </p>
        <p className="text-sm text-gray-700 mb-3">
          Una vez subido, el archivo pasa a estado <b>"Procesando"</b>: el
          servidor lee toda la geometría del modelo y clasifica cada
          elemento en una partida (ver sección 4). En archivos grandes esto
          puede tardar varios minutos — la pantalla se actualiza sola
          cuando termina, sin necesidad de recargar.
        </p>
        <p className="text-sm text-gray-700">
          Si el procesamiento termina con error (por ejemplo, un archivo
          dañado o que no es un IFC real), queda un mensaje explicando qué
          pasó, y se puede volver a intentar.
        </p>
      </>
    ),
  },
  {
    id: 'clasificacion',
    title: 'Clasificación de elementos',
    summary: 'Cómo decide la aplicación a qué partida pertenece cada elemento.',
    icon: Tags,
    content: (
      <>
        <p className="text-sm text-gray-700 mb-3">
          Cada elemento del modelo (una viga, un muro, una tubería) termina
          agrupado en una <b>partida</b> — un ítem de medición de obra. Cómo
          se decide esa agrupación depende de un modo, configurable por
          proyecto:
        </p>
        <ul className="text-sm text-gray-700 space-y-2 mb-3 list-disc pl-5">
          <li>
            <b>Norma</b> (el modo por defecto): la aplicación clasifica
            contra una norma técnica ya cargada en el sistema, sin que haga
            falta preparar nada en el modelo de antemano.
          </li>
          <li>
            <b>Manual</b>: usa propiedades que alguien ya escribió a mano en
            cada elemento del IFC, dentro del programa donde se modeló (ej.
            Revit) — código de partida, descripción y unidad. Sirve cuando
            el equipo ya tiene su propio sistema de códigos.
          </li>
        </ul>
        <p className="text-sm text-gray-700 mb-3">
          En modo manual, hay que indicarle a la aplicación en qué
          propiedad del IFC buscar cada dato (nombre del "grupo de
          propiedades" y nombre del campo) — esto se configura una vez por
          proyecto, y se puede ajustar también al subir cada archivo.
        </p>
        <p className="text-sm text-gray-700">
          Antes de confiar una configuración manual, el botón <b>"Probar"</b>
          la corre contra un archivo real sin guardar nada — muestra cuántos
          elementos encontraron su código con esa configuración, para
          confirmar que está bien armada antes de usarla en serio.
        </p>
      </>
    ),
  },
  {
    id: 'partidas-plantillas',
    title: 'Partidas y plantillas',
    summary: 'Qué es una partida, y cómo elegir qué columnas ver.',
    icon: ClipboardList,
    content: (
      <>
        <p className="text-sm text-gray-700 mb-3">
          Una vez procesado el modelo, la tabla de <b>partidas</b> del Visor
          3D muestra un árbol: cada fila es un ítem de medición (ej. "Muro
          de ladrillo, e=15cm") con su metrado total — longitud, área,
          volumen o peso, según qué unidad le corresponda. Hacer clic en una
          fila muestra el detalle: todos los elementos individuales que
          componen ese total, agrupados por nivel y ambiente.
        </p>
        <p className="text-sm text-gray-700 mb-3">
          Qué columnas se ven en ese detalle (además de las medidas
          básicas) lo define una <b>plantilla</b> — por ejemplo, agregar la
          columna "Marca" si esa propiedad existe en el modelo. Hay
          plantillas ya armadas por el sistema, y se pueden crear plantillas
          propias, guardarlas y reusarlas en cualquier archivo.
        </p>
        <p className="text-sm text-gray-700">
          Desde la tabla de partidas también se exporta a Excel (sección
          8) — el archivo generado respeta la misma agrupación y las mismas
          columnas que se estén viendo en pantalla en ese momento.
        </p>
      </>
    ),
  },
  {
    id: 'colaboradores',
    title: 'Colaboradores y roles',
    summary: 'Cómo invitar a alguien, y qué puede hacer cada rol.',
    icon: Users,
    content: (
      <>
        <p className="text-sm text-gray-700 mb-3">
          Desde Colaboradores se invita a alguien por su correo — si todavía
          no tiene cuenta en ALL-BIM, la invitación le llega igual, y crea
          su cuenta al aceptarla. Cada invitación asigna, para ese proyecto
          puntual, uno de dos tipos de acceso:
        </p>
        <p className="text-sm text-gray-700 mb-4">
          <b>Administrador del proyecto</b>: acceso total, sin restricción
          por módulo — puede administrar colaboradores, archivos y
          configuración de cualquier sección. O, en cambio, un <b>rol por
          módulo</b> (hoy, el único módulo real es Metrados):
        </p>
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="pb-2 pr-4 font-semibold">Rol</th>
                <th className="pb-2 font-semibold">Permite</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-200">
                <td className="py-2.5 pr-4 font-semibold text-gray-800 whitespace-nowrap">Administrador</td>
                <td className="py-2.5 text-gray-600">Acceso completo: ver, subir, procesar, eliminar y configurar el módulo.</td>
              </tr>
              <tr className="border-t border-gray-200">
                <td className="py-2.5 pr-4 font-semibold text-gray-800 whitespace-nowrap">Editor</td>
                <td className="py-2.5 text-gray-600">Puede ver, subir, procesar y eliminar archivos, pero no exportar ni configurar el módulo.</td>
              </tr>
              <tr className="border-t border-gray-200">
                <td className="py-2.5 pr-4 font-semibold text-gray-800 whitespace-nowrap">Visualizador</td>
                <td className="py-2.5 text-gray-600">Solo puede ver — no puede subir, procesar ni eliminar nada.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-700">
          El rol se puede cambiar en cualquier momento desde la lista de
          colaboradores, sin necesidad de volver a invitar a la persona.
        </p>
      </>
    ),
  },
  {
    id: 'visor-3d',
    title: 'El visor 3D',
    summary: 'Herramientas disponibles para explorar el modelo.',
    icon: Box,
    content: (
      <>
        <p className="text-sm text-gray-700 mb-3">
          El visor carga el modelo IFC y permite recorrerlo en tres
          dimensiones. La barra de herramientas incluye medición de
          distancias, corte por plano (para ver el interior de un piso o
          ambiente), pintado libre sobre el modelo, un modo caminar en
          primera persona, y filtros para aislar elementos por categoría o
          por nivel. Cada ícono muestra su función al pasar el cursor por
          encima, sin necesidad de memorizarlos de antemano.
        </p>
        <p className="text-sm text-gray-700">
          Al hacer clic sobre cualquier elemento del modelo, el panel
          lateral muestra sus propiedades del IFC (nombre, tipo, GUID) y,
          si el elemento ya tiene una partida asignada, también su metrado
          real calculado — con un acceso directo a esa partida en la tabla.
        </p>
      </>
    ),
  },
  {
    id: 'exportar-excel',
    title: 'Exportar a Excel',
    summary: 'Qué incluye el archivo generado y dónde queda guardado.',
    icon: FileSpreadsheet,
    content: (
      <>
        <p className="text-sm text-gray-700 mb-3">
          Desde la tabla de partidas de un modelo ya procesado, "Exportar a
          Excel" genera un archivo con dos partes: una hoja de resumen (el
          árbol completo de partidas con sus totales) y una hoja de detalle
          (cada partida con sus elementos agrupados, igual que se ve en
          pantalla).
        </p>
        <p className="text-sm text-gray-700">
          Cada exportación crea un archivo nuevo — nunca reemplaza una
          anterior — y queda disponible para descargar desde la sección
          Archivos del proyecto, con la fecha en que se generó.
        </p>
      </>
    ),
  },
  {
    id: 'perfil-cuenta',
    title: 'Perfil y cuenta',
    summary: 'Dónde cambiar los datos propios, y cómo cerrar sesión.',
    icon: UserCircle,
    content: (
      <>
        <p className="text-sm text-gray-700 mb-3">
          El nombre, apellido y foto de perfil se editan desde el menú de
          usuario, en el encabezado de la aplicación (arriba a la derecha,
          donde aparece el nombre propio). Desde ahí mismo se cierra la
          sesión.
        </p>
        <p className="text-sm text-gray-700">
          La eliminación de la cuenta, cuando está disponible, es
          permanente y no se puede deshacer desde la aplicación — antes de
          confirmarla conviene estar seguro de que no hace falta acceder a
          ningún proyecto propio más adelante.
        </p>
      </>
    ),
  },
];

const DEFAULT_SECTION_ID = SECTIONS[0].id;

const Ayuda: React.FC = () => {
  const { seccion } = useParams<{ seccion?: string }>();

  if (!seccion) return <Navigate to={`/ayuda/${DEFAULT_SECTION_ID}`} replace />;

  const index = SECTIONS.findIndex((s) => s.id === seccion);
  const section = index === -1 ? undefined : SECTIONS[index];
  if (!section) return <Navigate to={`/ayuda/${DEFAULT_SECTION_ID}`} replace />;

  const Icon = section.icon;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="ALL-BIM" className="h-8 w-auto object-contain" />
            <div>
              <p className="text-sm font-bold text-slate-600 leading-tight">Guía de ayuda</p>
              <p className="text-xs text-gray-500 leading-tight">ALL-BIM</p>
            </div>
          </div>
          <Link
            to="/dashboard/projects"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0056b3] text-white rounded-lg hover:bg-[#004494] transition-colors font-semibold text-sm"
          >
            Ir a la aplicación
            <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <div className="bg-gradient-to-b from-blue-50 to-gray-50 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <p className="text-xs font-semibold text-[#0056b3] uppercase tracking-wide mb-2">
            Guía de uso
          </p>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Cómo usar ALL-BIM</h1>
          <p className="text-sm text-gray-600 max-w-2xl">
            Nueve temas, pensados para alguien que recién empieza a usar la
            aplicación — desde crear el primer proyecto hasta entender qué
            significa cada rol de colaborador. Accesible en cualquier
            momento con la tecla "?", desde cualquier pantalla de la
            aplicación.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 flex gap-8 items-start">
        <nav className="hidden lg:block w-64 shrink-0 sticky top-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-2">
            Temas
          </p>
          <ol className="space-y-0.5">
            {SECTIONS.map((s, i) => {
              const SIcon = s.icon;
              const isActive = s.id === section.id;
              return (
                <li key={s.id}>
                  <Link
                    to={`/ayuda/${s.id}`}
                    className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-[#0056b3] font-medium'
                        : 'text-gray-600 hover:bg-blue-50 hover:text-[#0056b3]'
                    }`}
                  >
                    <SIcon size={16} className={`mt-0.5 shrink-0 ${isActive ? 'text-[#0056b3]' : 'text-gray-400'}`} />
                    <span>
                      {s.title}
                      <span className="block text-xs text-gray-400 font-normal leading-snug mt-0.5">
                        {s.summary}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="flex-1 min-w-0 max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <span>Tema {index + 1} de {SECTIONS.length}</span>
          </div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-[#0056b3]" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">{section.title}</h2>
          </div>
          <p className="text-sm text-gray-500 mb-6">{section.summary}</p>

          {section.content}

          <div className="flex justify-between mt-10 pt-6 border-t border-gray-200 text-sm">
            {index > 0 ? (
              <Link to={`/ayuda/${SECTIONS[index - 1].id}`} className="text-[#0056b3] hover:underline">
                ← {SECTIONS[index - 1].title}
              </Link>
            ) : <span />}
            {index < SECTIONS.length - 1 && (
              <Link to={`/ayuda/${SECTIONS[index + 1].id}`} className="text-[#0056b3] hover:underline">
                {SECTIONS[index + 1].title} →
              </Link>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Ayuda;
