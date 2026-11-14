'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

export default function SistemaVerificacion() {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState<any>(null);
  const [mensajeBusqueda, setMensajeBusqueda] = useState('');
  const [nuevoEstado, setNuevoEstado] = useState('');

  const [formRegistro, setFormRegistro] = useState({
    ci: '',
    nombres: '',
    apellidos: '',
    anio_ingreso: ''
  });

  const [mensajeRegistro, setMensajeRegistro] = useState('');
  const [cargandoExcel, setCargandoExcel] = useState(false);

  const [estadisticas, setEstadisticas] = useState({
    total: 0,
    regulares: 0,
    egresados: 0,
    titulados: 0,
    abandono: 0
  });

  const [cargandoDashboard, setCargandoDashboard] = useState(true);
  const [errorDashboard, setErrorDashboard] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [anioActual, setAnioActual] = useState<number>(0);

  // =====================================
  // DASHBOARD: CARGAR ESTADÍSTICAS SIMPLIFICADO
  // =====================================
  const cargarDashboard = async () => {
    setCargandoDashboard(true);
    setErrorDashboard('');

    try {
      // Ahora solo leemos la tabla principal para que sea 100% exacto
      const { data: estudiantes, error } = await supabase
        .from('estudiantes')
        .select('ci, estado_actual');

      if (error) throw error;

      const lista = estudiantes || [];

      setEstadisticas({
        total: lista.length,
        regulares: lista.filter((e: any) => e.estado_actual === 'Regular').length,
        egresados: lista.filter((e: any) => e.estado_actual === 'Egresado').length,
        titulados: lista.filter((e: any) => e.estado_actual === 'Titulado').length,
        abandono: lista.filter((e: any) => e.estado_actual === 'Abandono').length
      });

    } catch (error: any) {
      setErrorDashboard(error.message);
    } finally {
      setCargandoDashboard(false);
    }
  };

  useEffect(() => {
    const anio = new Date().getFullYear();
    setAnioActual(anio);
    cargarDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =====================================
  // BUSCAR ESTUDIANTE
  // =====================================
  const buscarEstudiante = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensajeBusqueda('');
    setResultados([]);
    setEstudianteSeleccionado(null);

    const valor = busqueda.trim().replace(/[(),]/g, ' ');
    if (!valor) return;

    const { data, error } = await supabase
      .from('estudiantes')
      .select('*')
      .or(`ci.eq.${valor},apellidos.ilike.%${valor}%`)
      .order('nombres', { ascending: true });

    if (error || !data || data.length === 0) {
      setMensajeBusqueda('No se encontró ningún estudiante con ese CI o apellido.');
    } else {
      setResultados(data);
      if (data.length === 1) {
        seleccionarEstudiante(data[0]);
      }
    }
  };

  const seleccionarEstudiante = (est: any) => {
    setEstudianteSeleccionado(est);
    setNuevoEstado(est.estado_actual);
  };

  // =====================================
  // CAMBIAR ESTADO
  // =====================================
  const actualizarEstado = async () => {
    if (!estudianteSeleccionado || nuevoEstado === estudianteSeleccionado.estado_actual) return;

    const datosActualizados: any = {
      estado_actual: nuevoEstado
    };

    if (nuevoEstado === 'Egresado') datosActualizados.anio_egreso = anioActual;
    if (nuevoEstado === 'Titulado') datosActualizados.anio_titulacion = anioActual;

    const { error } = await supabase
      .from('estudiantes')
      .update(datosActualizados)
      .eq('ci', estudianteSeleccionado.ci);

    if (error) {
      alert('Error al actualizar: ' + error.message);
    } else {
      const actualizado = { ...estudianteSeleccionado, ...datosActualizados };
      setEstudianteSeleccionado(actualizado);
      setResultados(prev => prev.map(e => e.ci === actualizado.ci ? actualizado : e));
      alert('Estado actualizado correctamente.');
      cargarDashboard();
    }
  };

  // =====================================
  // RENOVAR MATRÍCULA
  // =====================================
  const renovarMatricula = async () => {
    if (!estudianteSeleccionado) return;

    if (['Egresado', 'Titulado'].includes(estudianteSeleccionado.estado_actual)) return;

    const { error } = await supabase.rpc(
      'renovar_matricula',
      {
        p_estudiante_ci: estudianteSeleccionado.ci,
        p_gestion: anioActual
      }
    );

    if (error) {
      alert('Error al renovar matrícula: ' + error.message);
    } else {
      const actualizado = {
        ...estudianteSeleccionado,
        estado_actual: 'Regular',
        ultima_gestion: anioActual
      };
      setEstudianteSeleccionado(actualizado);
      setNuevoEstado('Regular');
      setResultados(prev => prev.map(e => e.ci === actualizado.ci ? actualizado : e));
      alert('Matrícula renovada con éxito.');
      cargarDashboard();
    }
  };

  // =====================================
  // REGISTRAR ESTUDIANTE
  // =====================================
  const registrarEstudiante = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensajeRegistro('');

    const ingresoInt = parseInt(formRegistro.anio_ingreso);

    if (
      !formRegistro.ci.trim() ||
      !formRegistro.nombres.trim() ||
      !formRegistro.apellidos.trim() ||
      !Number.isInteger(ingresoInt) ||
      ingresoInt < 1950 ||
      ingresoInt > anioActual
    ) {
      setMensajeRegistro('❌ Verifica los datos ingresados.');
      return;
    }

    const { data: nuevoEstudiante, error } = await supabase
      .from('estudiantes')
      .insert([{
        ci: formRegistro.ci.trim(),
        nombres: formRegistro.nombres.trim(),
        apellidos: formRegistro.apellidos.trim(),
        anio_ingreso: ingresoInt,
        ultima_gestion: ingresoInt,
        estado_actual: 'Regular'
      }])
      .select('ci')
      .single();

    if (error) {
      if (error.code === '23505') {
        setMensajeRegistro('⚠️ Este CI ya se encuentra registrado.');
      } else {
        setMensajeRegistro('❌ Error: ' + error.message);
      }
    } else if (nuevoEstudiante) {
      await supabase.from('matriculas').insert([{
        estudiante_ci: nuevoEstudiante.ci,
        gestion: anioActual
      }]);

      setMensajeRegistro('✅ Estudiante registrado exitosamente.');
      setFormRegistro({ ci: '', nombres: '', apellidos: '', anio_ingreso: '' });
      cargarDashboard();
    }
  };

  // =====================================
  // CARGA MASIVA EXCEL
  // =====================================
  const procesarExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCargandoExcel(true);
    setMensajeRegistro('⏳ Procesando Excel...');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const hoja = workbook.Sheets[workbook.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja);

      const estudiantesFormateados = filas.map((fila: any) => {
        const estadoBruto = String(fila.estado || fila.Estado || fila.estado_actual || 'Regular').trim();
        const estado = estadoBruto.charAt(0).toUpperCase() + estadoBruto.slice(1).toLowerCase();

        return {
          ci: String(fila.ci || fila.CI || fila.Carnet || '').trim(),
          nombres: String(fila.nombres || fila.Nombres || fila.Nombre || '').trim(),
          apellidos: String(fila.apellidos || fila.Apellidos || fila.Apellido || '').trim(),
          anio_ingreso: parseInt(fila.anio_ingreso || fila.Ingreso || anioActual),
          ultima_gestion: fila.ultima_gestion ? parseInt(fila.ultima_gestion) : anioActual,
          estado_actual: estado,
          anio_egreso: (fila.anio_egreso || fila.Egreso) ? parseInt(fila.anio_egreso || fila.Egreso) : null,
          anio_titulacion: (fila.anio_titulacion || fila.Titulacion) ? parseInt(fila.anio_titulacion || fila.Titulacion) : null
        };
      }).filter((e: any) =>
        e.ci && e.nombres && e.apellidos && Number.isInteger(e.anio_ingreso) &&
        ['Regular', 'Egresado', 'Titulado', 'Abandono'].includes(e.estado_actual)
      );

      if (!estudiantesFormateados.length) {
        throw new Error('No hay registros válidos en el Excel.');
      }

      const { data: upsertData, error } = await supabase
        .from('estudiantes')
        .upsert(estudiantesFormateados, { onConflict: 'ci' })
        .select('ci, estado_actual');

      if (error) throw error;

      if (upsertData && upsertData.length > 0) {
        const matriculasMasivas = upsertData
          .filter((e: any) => e.estado_actual === 'Regular')
          .map((e: any) => ({
            estudiante_ci: e.ci,
            gestion: anioActual
          }));

        if (matriculasMasivas.length > 0) {
          const { error } = await supabase.from('matriculas').insert(matriculasMasivas);
if (error) console.error("Error silencioso:", error);
        }
      }

      setMensajeRegistro(`✅ ${estudiantesFormateados.length} estudiantes procesados.`);
      cargarDashboard();

    } catch (error: any) {
      setMensajeRegistro('❌ Error en Excel: ' + error.message);
    } finally {
      setCargandoExcel(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!anioActual) return null; 

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-gray-800">
      <header className="bg-[#1e293b] text-white py-5 shadow-md mb-8">
        <h1 className="text-3xl font-extrabold text-center tracking-wider uppercase">
          KARDEX CIENCIAS GEOLÓGICAS
        </h1>
      </header>

      <div className="max-w-7xl mx-auto px-6 pb-8 grid md:grid-cols-12 gap-8 items-start">
        
        {/* IZQUIERDA: BUSCADOR Y DASHBOARD */}
        <div className="md:col-span-7 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold mb-4">Buscar Estudiante</h2>
            <form onSubmit={buscarEstudiante} className="flex gap-3">
              <input
                type="text"
                placeholder="CI o Apellidos..."
                className="flex-1 border border-gray-300 rounded p-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                required
              />
              <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded font-semibold hover:bg-blue-700">
                Buscar
              </button>
            </form>

            {mensajeBusqueda && (
              <p className="text-red-500 mt-4">{mensajeBusqueda}</p>
            )}

            {resultados.length > 1 && !estudianteSeleccionado && (
              <div className="border rounded-md overflow-hidden bg-gray-50 mt-5">
                <div className="bg-gray-200 p-3 text-sm font-bold">
                  Seleccione un estudiante ({resultados.length} encontrados):
                </div>
                {resultados.map(est => (
                  <div
                    key={est.ci}
                    onClick={() => seleccionarEstudiante(est)}
                    className="p-4 hover:bg-blue-100 cursor-pointer border-t flex justify-between"
                  >
                    <div>
                      <p className="font-bold">{est.nombres} {est.apellidos}</p>
                      <p className="text-sm text-gray-500">CI: {est.ci}</p>
                    </div>
                    <span className="text-xs font-bold bg-white px-2 py-1 rounded shadow-sm">
                      {est.estado_actual}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {estudianteSeleccionado && (
              <div className="border rounded-md p-5 bg-indigo-50/30 mt-5 relative">
                <button
                  onClick={() => setEstudianteSeleccionado(null)}
                  className="absolute top-4 right-4 text-blue-600 text-sm font-semibold hover:underline"
                >
                  ← Volver
                </button>
                <h3 className="text-xl font-bold">{estudianteSeleccionado.nombres} {estudianteSeleccionado.apellidos}</h3>
                <p className="text-gray-500 mb-5">CI: {estudianteSeleccionado.ci}</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-5">
                  {[
                    ['Ingreso', estudianteSeleccionado.anio_ingreso],
                    ['Últ. Matrícula', estudianteSeleccionado.ultima_gestion],
                    ['Egreso', estudianteSeleccionado.anio_egreso],
                    ['Titulación', estudianteSeleccionado.anio_titulacion]
                  ].map(([titulo, valor]: any) => (
                    <div key={titulo} className="bg-white p-3 rounded shadow-sm border border-gray-100">
                      <p className="text-xs text-gray-500 font-bold">{titulo}</p>
                      <p className="text-lg font-bold">{valor || '-'}</p>
                    </div>
                  ))}
                </div>

                {!['Egresado', 'Titulado'].includes(estudianteSeleccionado.estado_actual) && (
                  <button
                    onClick={renovarMatricula}
                    className="w-full bg-blue-600 text-white py-3 rounded font-bold mb-5 hover:bg-blue-700 shadow-sm"
                  >
                    Renovar Matrícula ({anioActual})
                  </button>
                )}

                <div className="border-t pt-4 flex gap-2 items-center">
                  <p className="text-sm font-semibold text-gray-600 mr-2">Cambiar Estado:</p>
                  <select
                    className="flex-1 border rounded p-2 bg-white"
                    value={nuevoEstado}
                    onChange={e => setNuevoEstado(e.target.value)}
                  >
                    <option value="Regular">Regular</option>
                    <option value="Egresado">Egresado</option>
                    <option value="Titulado">Titulado</option>
                    <option value="Abandono">Abandono</option>
                  </select>
                  <button
                    onClick={actualizarEstado}
                    disabled={nuevoEstado === estudianteSeleccionado.estado_actual}
                    className="bg-green-600 text-white px-5 py-2 rounded font-bold disabled:bg-gray-300 transition"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* DASHBOARD SIMPLIFICADO */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-5 border-b pb-3">
              <h2 className="text-xl font-bold">Resumen Académico</h2>
              <button
                onClick={cargarDashboard}
                className="text-blue-600 text-sm font-semibold hover:underline"
              >
                ↻ Actualizar
              </button>
            </div>

            {cargandoDashboard ? (
              <p className="text-gray-500 text-center py-8">Cargando estadísticas...</p>
            ) : errorDashboard ? (
              <p className="text-red-600 text-sm">Error al cargar: {errorDashboard}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { titulo: 'Total estudiantes', valor: estadisticas.total, color: 'bg-blue-50 text-blue-700', icono: '👥' },
                  { titulo: 'Regulares', valor: estadisticas.regulares, color: 'bg-green-50 text-green-700', icono: '📚' },
                  { titulo: 'Egresados', valor: estadisticas.egresados, color: 'bg-amber-50 text-amber-700', icono: '📖' },
                  { titulo: 'Titulados', valor: estadisticas.titulados, color: 'bg-purple-50 text-purple-700', icono: '🎓' },
                  { titulo: 'Abandono', valor: estadisticas.abandono, color: 'bg-red-50 text-red-700', icono: '⚠️' }
                ].map(item => (
                  <div key={item.titulo} className={`${item.color} rounded-lg p-4 border border-opacity-50`}>
                    <p className="text-sm font-bold opacity-80">{item.icono} {item.titulo}</p>
                    <p className="text-3xl font-extrabold mt-1">{item.valor}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* DERECHA: REGISTRO Y EXCEL */}
        <div className="md:col-span-5 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6 border-b pb-3">
              <h2 className="text-xl font-bold">Nuevo Registro</h2>
              <div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  ref={fileInputRef}
                  onChange={procesarExcel}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={cargandoExcel}
                  className="bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded text-sm font-bold hover:bg-green-100 transition"
                >
                  {cargandoExcel ? 'Procesando...' : '↑ Excel Masivo'}
                </button>
              </div>
            </div>

            <form onSubmit={registrarEstudiante} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Carnet de Identidad</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded p-2.5"
                  value={formRegistro.ci}
                  onChange={e => setFormRegistro({ ...formRegistro, ci: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nombres</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded p-2.5"
                  value={formRegistro.nombres}
                  onChange={e => setFormRegistro({ ...formRegistro, nombres: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Apellidos</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded p-2.5"
                  value={formRegistro.apellidos}
                  onChange={e => setFormRegistro({ ...formRegistro, apellidos: e.target.value })}
                />
              </div>

              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Año de Ingreso</label>
                <input
                  type="number"
                  required
                  min="1950"
                  max={anioActual}
                  className="w-full border rounded p-2.5"
                  value={formRegistro.anio_ingreso}
                  onChange={e => setFormRegistro({ ...formRegistro, anio_ingreso: e.target.value })}
                />
              </div>

              <button
                type="submit"
                className="col-span-2 bg-[#1e293b] text-white py-3 rounded font-bold hover:bg-slate-800 mt-2 transition"
              >
                Guardar Estudiante
              </button>
            </form>
          </div>

          {mensajeRegistro && (
            <div className={`p-4 rounded border text-sm font-semibold animate-pulse ${
              mensajeRegistro.includes('❌') || mensajeRegistro.includes('⚠️') 
                ? 'bg-red-50 border-red-200 text-red-700' 
                : 'bg-green-50 border-green-200 text-green-800'
            }`}>
              {mensajeRegistro}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}