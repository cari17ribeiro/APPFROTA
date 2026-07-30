import React, { useEffect, useState } from 'react';
import {
  Loader2,
  Search,
  Filter,
  Image as ImageIcon,
  XCircle,
  Ban,
  CheckCircle,
  ArrowRight,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export default function ProgramacaoViagensScreen({ supabase, onLogout }) {
  const hoje = new Date().toISOString().slice(0, 10);

  const [viagens, setViagens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const [filtroData, setFiltroData] = useState(hoje);
  const [filtroMotorista, setFiltroMotorista] = useState('');
  const [filtroAviso, setFiltroAviso] = useState('todos');

  const [fotoModal, setFotoModal] = useState(null);

  useEffect(() => {
    carregarViagens();
  }, [filtroData, filtroAviso]);

  const normalizarData = (valor) => {
    if (!valor) return '';

    const texto = String(valor).trim().split(' ')[0];

    if (texto.includes('/')) {
      const [dia, mes, ano] = texto.split('/');
      if (dia && mes && ano) return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }

    if (texto.includes('-')) {
      const [ano, mes, dia] = texto.split('T')[0].split('-');
      if (ano && mes && dia) return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }

    return '';
  };

  const carregarViagens = async () => {
    setLoading(true);

    try {
      const pageSize = 1000;
      let pagina = 0;
      let registros = [];
      let continuarBuscando = true;

      while (continuarBuscando) {
        const inicio = pagina * pageSize;
        const fim = inicio + pageSize - 1;

        let query = supabase
          .from('viagens_extra')
          .select('id, tipo_operacao, origem, destino, container, placa, frota, carreta, motorista, data, hora, status, comprovante_url, aviso_programacao, created_at')
          .order('created_at', { ascending: false })
          .range(inicio, fim);

        if (filtroAviso === 'com_aviso') {
          query = query.not('aviso_programacao', 'is', null);
        }

        if (filtroAviso === 'sem_aviso') {
          query = query.is('aviso_programacao', null);
        }

        const { data, error } = await query;
        if (error) throw error;

        registros = [...registros, ...(data || [])];
        continuarBuscando = data?.length === pageSize;
        pagina += 1;
      }

      const registrosDoDia = filtroData
        ? registros.filter((viagem) => normalizarData(viagem.data) === filtroData)
        : registros;

      registrosDoDia.sort((a, b) => {
        const horaA = a.hora || '';
        const horaB = b.hora || '';
        return horaA.localeCompare(horaB);
      });

      setViagens(registrosDoDia);
    } catch (error) {
      console.error('Erro ao carregar viagens da programação:', error);
      alert('Erro ao carregar viagens da programação: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const avisarValidacao = async (viagem) => {
    const confirmar = window.confirm(
      `Deseja avisar a validação que esta viagem NÃO foi autorizada?\n\nMotorista: ${viagem.motorista || 'Não informado'}\nContainer: ${viagem.container || '-'}\n\nA viagem continuará na fila de validação, apenas com uma etiqueta de aviso.`
    );

    if (!confirmar) return;

    setIsUpdating(true);

    try {
      const { error } = await supabase
        .from('viagens_extra')
        .update({
          aviso_programacao: 'Não autorizada pela programação'
        })
        .eq('id', viagem.id);

      if (error) throw error;

      await carregarViagens();
    } catch (error) {
      console.error('Erro ao adicionar aviso da programação:', error);
      alert('Erro ao adicionar aviso da programação: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const removerAviso = async (viagem) => {
    const confirmar = window.confirm('Deseja remover o aviso da programação desta viagem?');
    if (!confirmar) return;

    setIsUpdating(true);

    try {
      const { error } = await supabase
        .from('viagens_extra')
        .update({
          aviso_programacao: null
        })
        .eq('id', viagem.id);

      if (error) throw error;

      await carregarViagens();
    } catch (error) {
      console.error('Erro ao remover aviso da programação:', error);
      alert('Erro ao remover aviso da programação: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const viagensFiltradas = viagens.filter((viagem) => {
    if (!filtroMotorista) return true;
    const motorista = viagem.motorista?.toLowerCase() || '';
    return motorista.includes(filtroMotorista.toLowerCase());
  });

  const getStatusBadge = (status) => {
    if (status === 'Validado') {
      return (
        <span className="inline-flex items-center px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold">
          <CheckCircle className="w-3 h-3 mr-1" />
          Validada
        </span>
      );
    }

    if (status === 'Pendente Validação') {
      return (
        <span className="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-bold">
          Pendente
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-bold">
        {status || 'Sem status'}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="p-5 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              Mesa de Programação
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Visualização de viagens e avisos para a validação
            </p>
          </div>

          <button
            onClick={onLogout}
            className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold text-sm transition-colors border border-slate-700"
          >
            Sair do Sistema
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Dia
            </label>
            <input
              type="date"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
              className="w-full bg-slate-50 border-slate-200 rounded-xl p-2 text-sm outline-none border focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Buscar Motorista
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Nome do motorista..."
                value={filtroMotorista}
                onChange={(e) => setFiltroMotorista(e.target.value)}
                className="w-full bg-slate-50 border-slate-200 rounded-xl py-2 pl-9 pr-3 text-sm outline-none border focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Aviso da Programação
            </label>
            <select
              value={filtroAviso}
              onChange={(e) => setFiltroAviso(e.target.value)}
              className="w-full bg-slate-50 border-slate-200 rounded-xl p-2 text-sm outline-none border focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="todos">Todos</option>
              <option value="com_aviso">Com aviso</option>
              <option value="sem_aviso">Sem aviso</option>
            </select>
          </div>

          <button
            onClick={carregarViagens}
            disabled={loading}
            className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-6 py-2.5 rounded-xl font-bold text-sm transition-colors border border-blue-200 flex items-center disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Filter className="w-4 h-4 mr-2" />
            )}
            Filtrar
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-800">
                Viagens do Dia
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                {viagensFiltradas.length} viagens encontradas
              </p>
            </div>

            <button
              onClick={carregarViagens}
              disabled={loading}
              className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-bold text-sm flex items-center disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs font-black">
                <tr>
                  <th className="p-4">Hora</th>
                  <th className="p-4">Motorista</th>
                  <th className="p-4">Operação</th>
                  <th className="p-4">Origem ➔ Destino</th>
                  <th className="p-4">Container</th>
                  <th className="p-4">Placa</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Aviso</th>
                  <th className="p-4 text-right">Foto</th>
                  <th className="p-4 text-right sticky right-0 bg-slate-50 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] z-10">
                    Ação
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="10" className="p-8 text-center text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                      Carregando viagens...
                    </td>
                  </tr>
                ) : viagensFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-8 text-center text-slate-500 font-medium">
                      Nenhuma viagem encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  viagensFiltradas.map((viagem) => (
                    <tr key={viagem.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-black text-slate-800">
                        {viagem.hora || '--:--'}
                      </td>

                      <td className="p-4 font-bold text-slate-900">
                        {viagem.motorista || 'Desconhecido'}
                      </td>

                      <td className="p-4 font-medium text-blue-600 bg-blue-50/50">
                        {viagem.tipo_operacao || '-'}
                      </td>

                      <td className="p-4 text-slate-600">
                        {viagem.origem || '-'}
                        <ArrowRight className="inline w-3 h-3 text-slate-400 mx-1" />
                        {viagem.destino || '-'}
                      </td>

                      <td className="p-4 font-black tracking-wider text-slate-800">
                        {viagem.container || '-'}
                      </td>

                      <td className="p-4 font-bold text-slate-700">
                        {viagem.placa || '-'}
                      </td>

                      <td className="p-4 text-center">
                        {getStatusBadge(viagem.status)}
                      </td>

                      <td className="p-4 text-center">
                        {viagem.aviso_programacao ? (
                          <span className="inline-flex items-center px-2 py-1 bg-rose-100 text-rose-700 rounded-md text-xs font-bold border border-rose-200">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {viagem.aviso_programacao}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">Sem aviso</span>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        {viagem.comprovante_url ? (
                          <button
                            onClick={() => setFotoModal(viagem)}
                            className="inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm"
                          >
                            <ImageIcon className="w-4 h-4 mr-2" />
                            Ver foto
                          </button>
                        ) : (
                          <span className="text-slate-400 font-medium">
                            Sem foto
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-right sticky right-0 bg-white shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]">
                        {viagem.aviso_programacao ? (
                          <button
                            onClick={() => removerAviso(viagem)}
                            disabled={isUpdating}
                            className="inline-flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg font-bold transition-colors disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Remover aviso
                          </button>
                        ) : (
                          <button
                            onClick={() => avisarValidacao(viagem)}
                            disabled={isUpdating}
                            className="inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2 rounded-lg font-bold transition-colors disabled:opacity-50"
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Avisar validação
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {fotoModal && (
        <div
          className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[110] p-4"
          onClick={() => setFotoModal(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  Foto Anexada
                </h3>
                <p className="text-sm text-slate-500 font-medium">
                  {fotoModal.motorista || 'Motorista não informado'} - {fotoModal.container || 'Sem container'} - {fotoModal.placa || 'Sem placa'}
                </p>
              </div>

              <button
                onClick={() => setFotoModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-slate-900 flex-1 min-h-[420px] p-4 flex items-center justify-center overflow-auto">
              <a
                href={fotoModal.comprovante_url}
                target="_blank"
                rel="noreferrer"
                className="w-full h-full flex items-center justify-center"
              >
                <img
                  src={fotoModal.comprovante_url}
                  alt="Comprovante anexado"
                  className="max-w-full max-h-[75vh] object-contain rounded-2xl"
                />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
