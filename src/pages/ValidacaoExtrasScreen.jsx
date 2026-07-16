import React, { useState, useEffect } from 'react';
import { Loader2, Search, CheckCircle, AlertCircle, Image as ImageIcon, XCircle, Save, Filter, ArrowRight, BarChart3, ListTodo, Download, FileSpreadsheet, PieChart, Trash2 } from 'lucide-react';
export default function ValidacaoExtrasScreen({ supabase, onLogout }) {
  const [activeTab, setActiveTab] = useState('validacao');
  const [viagens, setViagens] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [filtroMotorista, setFiltroMotorista] = useState(''); 
  
  // Modais
  const [viagemSelecionada, setViagemSelecionada] = useState(null);
  const [justificativaModal, setJustificativaModal] = useState(null); // Novo estado para ler a justificativa
  const [isSaving, setIsSaving] = useState(false);

  // Estados editáveis do modal
  const [editContainer, setEditContainer] = useState('');
  const [editPlaca, setEditPlaca] = useState('');
  const [editFrota, setEditFrota] = useState('');
  const [editCarreta, setEditCarreta] = useState('');

  // Dashboard States
  const [dashMetrics, setDashMetrics] = useState({ total: 0, acertos: 0, erros: 0, taxa: 0 });
  const [loadingDash, setLoadingDash] = useState(false);

  // Export States
  const [isExportExtraOpen, setIsExportExtraOpen] = useState(false);
  const [dataInicioExport, setDataInicioExport] = useState('');
  const [dataFimExport, setDataFimExport] = useState('');
  const [isExportingExtra, setIsExportingExtra] = useState(false);

  useEffect(() => {
    if (activeTab === 'validacao') {
      carregarViagensPendentes();
    } else if (activeTab === 'dashboard') {
      carregarDashboard();
    }
  }, [activeTab, filtroDataInicio, filtroDataFim]);

  const carregarViagensPendentes = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('viagens_extra')
        .select('*')
        .eq('status', 'Pendente Validação')
        .order('created_at', { ascending: true });

      if (filtroDataInicio) query = query.gte('data', filtroDataInicio);
      if (filtroDataFim) query = query.lte('data', filtroDataFim);

      const { data, error } = await query;
      if (error) throw error;
      setViagens(data || []);
    } catch (error) {
      console.error("Erro ao buscar viagens:", error);
      alert("Erro ao carregar a fila de validação.");
    } finally {
      setLoading(false);
    }
  };

  const carregarDashboard = async () => {
    setLoadingDash(true);
    try {
      let query = supabase
        .from('viagens_extra')
        .select('id, ocr_correto')
        .eq('status', 'Validado');

      if (filtroDataInicio) query = query.gte('data', filtroDataInicio);
      if (filtroDataFim) query = query.lte('data', filtroDataFim);

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const total = data.length;
        const acertos = data.filter(v => v.ocr_correto === true).length;
        const erros = data.filter(v => v.ocr_correto === false).length;
        
        // Total avaliado ignora as viagens muito antigas onde a coluna ocr_correto era nula
        const totalAvaliados = acertos + erros; 
        const taxa = totalAvaliados > 0 ? ((acertos / totalAvaliados) * 100).toFixed(1) : 0;
        
        setDashMetrics({ total, acertos, erros, taxa });
      }
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
    } finally {
      setLoadingDash(false);
    }
  };

  const abrirModal = (viagem) => {
    setViagemSelecionada(viagem);
    setEditContainer(viagem.container || '');
    setEditPlaca(viagem.placa || '');
    setEditFrota(viagem.frota || '');
    setEditCarreta(viagem.carreta || '');
  };

  const fecharModal = () => {
    setViagemSelecionada(null);
  };

  const aprovarViagem = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Lógica para taxa de acerto: Compara se o container editado é igual ao original que a IA leu
    const containerOriginal = (viagemSelecionada.container || '').trim().toUpperCase();
    const containerEditado = editContainer.trim().toUpperCase();
    const ocrAcertou = containerOriginal !== '' && containerOriginal === containerEditado;

    try {
      const { error } = await supabase
        .from('viagens_extra')
        .update({
          container: containerEditado,
          placa: editPlaca.trim().toUpperCase(),
          frota: editFrota.trim().toUpperCase(),
          carreta: editCarreta.trim().toUpperCase(),
          status: 'Validado',
          ocr_correto: ocrAcertou // Salva no banco se foi acerto(true) ou correção(false)
        })
        .eq('id', viagemSelecionada.id);

      if (error) throw error;

      setViagens(viagens.filter(v => v.id !== viagemSelecionada.id));
      fecharModal();
    } catch (error) {
      alert("Erro ao aprovar viagem: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const excluirViagem = async () => {
  if (!viagemSelecionada) return;

  const confirmar = window.confirm(
    'Tem certeza que deseja excluir esta viagem extra? Essa ação não poderá ser desfeita.'
  );

  if (!confirmar) return;

  setIsSaving(true);

  try {
    const { error } = await supabase
      .from('viagens_extra')
      .delete()
      .eq('id', viagemSelecionada.id);

    if (error) throw error;

    setViagens((viagensAtuais) =>
      viagensAtuais.filter((viagem) => viagem.id !== viagemSelecionada.id)
    );

    fecharModal();
  } catch (error) {
    console.error('Erro ao excluir viagem:', error);
    alert('Erro ao excluir viagem: ' + error.message);
  } finally {
    setIsSaving(false);
  }
};

  const handleExportarExtras = async () => {
    if (!dataInicioExport || !dataFimExport) {
      alert("Por favor, selecione a data inicial e final.");
      return;
    }

    setIsExportingExtra(true);
    try {
      const { data, error } = await supabase
        .from('viagens_extra')
        .select('tipo_operacao, origem, destino, container, placa, motorista, data, hora, status');

      if (error) throw error;

      if (!data || data.length === 0) {
        alert("A tabela de viagens extras está vazia no banco de dados.");
        setIsExportingExtra(false);
        return;
      }

      const dtInicio = new Date(`${dataInicioExport}T00:00:00`);
      const dtFim = new Date(`${dataFimExport}T23:59:59`);

      const dadosFiltrados = data.filter(item => {
        if (!item.data) return false;
        
        let dataItem;
        if (item.data.includes('/')) {
          const [d, m, a] = item.data.split(' ')[0].split('/');
          dataItem = new Date(a, m - 1, d);
        } else if (item.data.includes('-')) {
          const [a, m, d] = item.data.split(' ')[0].split('-');
          dataItem = new Date(a, m - 1, d);
        } else {
          dataItem = new Date(item.data);
        }

        return dataItem >= dtInicio && dataItem <= dtFim;
      });

      if (dadosFiltrados.length === 0) {
        alert("Nenhuma viagem extra encontrada neste período.");
        setIsExportingExtra(false);
        return;
      }

      if (!window.XLSX) {
        alert('A biblioteca do Excel está a carregar. Tente novamente.');
        setIsExportingExtra(false);
        return;
      }

      const ws = window.XLSX.utils.json_to_sheet(dadosFiltrados);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Viagens Extras");
      
      const formatNome = (dt) => dt.split('-').reverse().join('-');
      window.XLSX.writeFile(wb, `Extras_${formatNome(dataInicioExport)}_ate_${formatNome(dataFimExport)}.xlsx`);
      
      setIsExportExtraOpen(false);
    } catch (error) {
      alert("Erro ao exportar extras: " + error.message);
    } finally {
      setIsExportingExtra(false);
    }
  };

  const viagensFiltradas = viagens.filter(v => {
    if (!filtroMotorista) return true;
    const nomeMotorista = v.motorista?.toLowerCase() || '';
    return nomeMotorista.includes(filtroMotorista.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      
      {/* HEADER EXCLUSIVO BACK-OFFICE */}
      <header className="bg-slate-900 text-white shadow-md">
        <div className="p-5 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black flex items-center tracking-tight">
              <CheckCircle className="w-6 h-6 mr-2 text-emerald-400" />
              Auditoria de Viagens Extras
            </h1>
            <p className="text-slate-400 text-sm mt-1">Acesso Restrito às Validações</p>
          </div>
          <button onClick={onLogout} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold text-sm transition-colors border border-slate-700">
            Sair do Sistema
          </button>
        </div>
        
        {/* ABAS */}
        <div className="flex px-5 space-x-1 mt-2">
          <button 
            onClick={() => setActiveTab('validacao')} 
            className={`px-6 py-3 font-bold text-sm rounded-t-xl transition-colors flex items-center ${activeTab === 'validacao' ? 'bg-slate-100 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <ListTodo className="w-4 h-4 mr-2"/> Fila de Validação
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`px-6 py-3 font-bold text-sm rounded-t-xl transition-colors flex items-center ${activeTab === 'dashboard' ? 'bg-slate-100 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <BarChart3 className="w-4 h-4 mr-2"/> Dashboard IA
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* BARRA DE FILTROS COMUM PARA AS DUAS ABAS */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
          {activeTab === 'validacao' && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Buscar Motorista</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Nome do motorista..." 
                  value={filtroMotorista}
                  onChange={e => setFiltroMotorista(e.target.value)}
                  className="w-full bg-slate-50 border-slate-200 rounded-xl py-2 pl-9 pr-3 text-sm outline-none border focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          )}
          
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Inicial</label>
            <input 
              type="date" 
              value={filtroDataInicio}
              onChange={e => setFiltroDataInicio(e.target.value)}
              className="w-full bg-slate-50 border-slate-200 rounded-xl p-2 text-sm outline-none border focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Final</label>
            <input 
              type="date" 
              value={filtroDataFim}
              onChange={e => setFiltroDataFim(e.target.value)}
              className="w-full bg-slate-50 border-slate-200 rounded-xl p-2 text-sm outline-none border focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <button onClick={activeTab === 'validacao' ? carregarViagensPendentes : carregarDashboard} className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-6 py-2.5 rounded-xl font-bold text-sm transition-colors border border-blue-200 flex items-center">
            <Filter className="w-4 h-4 mr-2" /> Filtrar
          </button>

          {/* BOTÃO DE EXPORTAR NA BARRA */}
          <button 
            onClick={() => setIsExportExtraOpen(true)}
            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-6 py-2.5 rounded-xl font-bold text-sm transition-colors border border-indigo-200 flex items-center ml-auto"
          >
            <Download className="w-4 h-4 mr-2" /> Exportar Dados
          </button>
        </div>

        {/* ================= ABA VALIDAÇÃO ================= */}
        {activeTab === 'validacao' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs font-black">
                  <tr>
                    <th className="p-4">Data/Hora</th>
                    <th className="p-4">Motorista</th>
                    <th className="p-4">Operação</th>
                    <th className="p-4">Origem ➔ Destino</th>
                    <th className="p-4 text-center">Status OCR</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" /> Carregando fila...
                      </td>
                    </tr>
                  ) : viagensFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-500 font-medium">
                        Nenhuma viagem extra pendente de validação. 🎉
                      </td>
                    </tr>
                  ) : (
                    viagensFiltradas.map(viagem => {
                      const falhaOCR = !viagem.container || !viagem.placa;
                      
                      return (
                        <tr key={viagem.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-medium text-slate-700">
                            {viagem?.data ? viagem.data.split('-').reverse().join('/') : '--/--/----'} às {viagem?.hora || '--:--'}
                          </td>
                          <td className="p-4 font-bold text-slate-900">
                            {viagem?.motorista || 'ID: ' + (viagem?.user_id ? viagem.user_id.substring(0,6) : 'Desconhecido')}
                          </td>
                          <td className="p-4 font-medium text-blue-600 bg-blue-50/50">
                            {viagem.tipo_operacao}
                          </td>
                          <td className="p-4 text-slate-600">
                            {viagem.origem} <ArrowRight className="inline w-3 h-3 text-slate-400 mx-1"/> {viagem.destino}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-2 items-center justify-center">
                              {falhaOCR ? (
                                <span className="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-bold">
                                  <AlertCircle className="w-3 h-3 mr-1" /> Revisão Necessária
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold">
                                  <CheckCircle className="w-3 h-3 mr-1" /> IA Completa
                                </span>
                              )}

                              {/* NOVA ETIQUETA DE GALERIA AQUI */}
                              {viagem.photo_source === 'galeria' && (
                                <button
                                  onClick={() => setJustificativaModal(viagem.justificativa || 'Nenhuma justificativa fornecida pelo motorista.')}
                                  className="inline-flex items-center px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md text-xs font-bold transition-colors cursor-pointer shadow-sm border border-purple-200"
                                  title="Ver Justificativa"
                                >
                                  <ImageIcon className="w-3 h-3 mr-1" />
                                  Galeria
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <button 
                              onClick={() => abrirModal(viagem)}
                              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm"
                            >
                              Analisar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= ABA DASHBOARD ================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-xl font-black text-slate-800">Métricas de Inteligência (OCR)</h2>
            
            {loadingDash ? (
               <div className="p-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" /></div>
            ) : (
              <div className="flex flex-col gap-6">
                
                {/* 4 CARDS SUPERIORES */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                    <span className="text-sm font-bold text-slate-500 uppercase mb-2">Total de Validações</span>
                    <div className="text-5xl font-black text-slate-800">{dashMetrics.total}</div>
                    <p className="text-sm text-slate-400 mt-2 font-medium">Viagens na base</p>
                  </div>

                  <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-center relative overflow-hidden">
                    <span className="text-sm font-bold text-emerald-700 uppercase mb-2 relative z-10">Acertos da IA</span>
                    <div className="text-5xl font-black text-emerald-600 relative z-10">{dashMetrics.acertos}</div>
                    <p className="text-sm text-emerald-700/70 mt-2 font-medium relative z-10">Lidos corretamente</p>
                    <CheckCircle className="w-32 h-32 absolute -right-6 -bottom-6 text-emerald-500/10" />
                  </div>

                  <div className="bg-rose-50 p-6 rounded-2xl border border-rose-200 shadow-sm flex flex-col justify-center relative overflow-hidden">
                    <span className="text-sm font-bold text-rose-700 uppercase mb-2 relative z-10">Erros da IA</span>
                    <div className="text-5xl font-black text-rose-600 relative z-10">{dashMetrics.erros}</div>
                    <p className="text-sm text-rose-700/70 mt-2 font-medium relative z-10">Corrigidos manualmente</p>
                    <AlertCircle className="w-32 h-32 absolute -right-6 -bottom-6 text-rose-500/10" />
                  </div>

                  <div className={`p-6 rounded-2xl border shadow-sm flex flex-col justify-center relative overflow-hidden ${dashMetrics.taxa >= 80 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                    <span className={`text-sm font-bold uppercase mb-2 relative z-10 ${dashMetrics.taxa >= 80 ? 'text-blue-700' : 'text-amber-700'}`}>Taxa de Precisão</span>
                    <div className={`text-5xl font-black relative z-10 ${dashMetrics.taxa >= 80 ? 'text-blue-600' : 'text-amber-600'}`}>{dashMetrics.taxa}%</div>
                    <div className="w-full bg-black/5 rounded-full h-2 mt-4 relative z-10">
                       <div className={`h-2 rounded-full transition-all duration-1000 ${dashMetrics.taxa >= 80 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${dashMetrics.taxa}%` }}></div>
                    </div>
                  </div>
                  
                </div>

                {/* GRÁFICO DE PIZZA (DONUT) SVG */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-center gap-12">
                  <div className="relative w-56 h-56">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90 drop-shadow-md">
                      {/* Fundo (Erros - Rose) */}
                      <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="#fda4af" strokeWidth="5" />
                      {/* Preenchimento (Acertos - Emerald) */}
                      <circle 
                        cx="18" 
                        cy="18" 
                        r="15.91549430918954" 
                        fill="transparent" 
                        stroke="#10b981" 
                        strokeWidth="5" 
                        strokeDasharray={`${dashMetrics.taxa} ${100 - dashMetrics.taxa}`} 
                        strokeDashoffset="0" 
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-slate-800">{dashMetrics.taxa}%</span>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Acertos</span>
                    </div>
                  </div>
                  
                  {/* LEGENDA DO GRÁFICO */}
                  <div className="flex flex-col gap-6">
                    <h3 className="text-lg font-black text-slate-800 flex items-center mb-2">
                      <PieChart className="w-5 h-5 mr-2 text-indigo-500"/> Proporção de Desempenho
                    </h3>
                    
                    <div className="flex items-center gap-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 w-full sm:w-80">
                      <div className="w-5 h-5 rounded-full bg-emerald-500 shadow-sm shrink-0"></div>
                      <div>
                        <p className="font-bold text-slate-800">Acertos da IA</p>
                        <p className="text-sm text-slate-500 font-medium">{dashMetrics.acertos} viagens validadas diretamente</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-rose-50/50 p-4 rounded-xl border border-rose-100 w-full sm:w-80">
                      <div className="w-5 h-5 rounded-full bg-rose-400 shadow-sm shrink-0"></div>
                      <div>
                        <p className="font-bold text-slate-800">Erros (Corrigidos)</p>
                        <p className="text-sm text-slate-500 font-medium">{dashMetrics.erros} viagens exigiram ajuste humano</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

      </main>

      {/* ================= MODAL DE JUSTIFICATIVA (NOVO) ================= */}
      {justificativaModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={() => setJustificativaModal(null)}>
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col gap-4 animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center text-purple-600 mb-2">
              <AlertCircle className="w-6 h-6 mr-2" />
              <h3 className="text-lg font-black text-slate-800">Aviso da Galeria</h3>
            </div>
            <p className="text-slate-600 font-medium leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
              {justificativaModal}
            </p>
            <button onClick={() => setJustificativaModal(null)} className="mt-2 w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-colors shadow-md">
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL DE EXPORTAÇÃO ================= */}
      {isExportExtraOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={() => setIsExportExtraOpen(false)}>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6 animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-xl font-black text-slate-800 flex items-center">
                <FileSpreadsheet className="w-6 h-6 mr-2 text-indigo-600" />
                Exportar Extras
              </h3>
              <button onClick={() => setIsExportExtraOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Período Inicial</label>
                <input type="date" value={dataInicioExport} onChange={e => setDataInicioExport(e.target.value)} className="w-full border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 border bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Período Final</label>
                <input type="date" value={dataFimExport} onChange={e => setDataFimExport(e.target.value)} className="w-full border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 border bg-slate-50" />
              </div>
            </div>
            
            <div className="pt-2 flex gap-3">
              <button onClick={() => setIsExportExtraOpen(false)} className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 py-3 rounded-xl font-bold transition-colors">
                Cancelar
              </button>
              <button onClick={handleExportarExtras} disabled={isExportingExtra} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all shadow-md flex items-center justify-center">
                {isExportingExtra ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Download className="w-5 h-5 mr-2" />}
                {isExportingExtra ? 'A Extrair...' : 'Extrair Relatório'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE VALIDAÇÃO ================= */}
{viagemSelecionada && (
  <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[90vh]">
      
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <h3 className="text-lg font-black text-slate-800">
          Validação de Documentos
        </h3>

        <button
          type="button"
          onClick={fecharModal}
          disabled={isSaving}
          className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          <XCircle className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <form
          id="form-validacao"
          onSubmit={aprovarViagem}
          className="grid grid-cols-1 lg:grid-cols-2 gap-8"
        >
          
          {/* FOTO */}
          <div className="space-y-4 flex flex-col h-full">
            <div className="flex-1 flex flex-col">
              <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center">
                <ImageIcon className="w-4 h-4 mr-2" />
                Foto Capturada (Contêiner + Placa)
              </h4>

              <div className="bg-slate-900 rounded-3xl flex-1 min-h-[400px] border border-slate-200 overflow-hidden flex items-center justify-center relative group p-2">
                {viagemSelecionada.comprovante_url ? (
                  <a
                    href={viagemSelecionada.comprovante_url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full h-full flex items-center justify-center"
                  >
                    <img
                      src={viagemSelecionada.comprovante_url}
                      alt="Comprovante"
                      className="max-w-full max-h-[60vh] object-contain rounded-2xl"
                    />

                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-sm rounded-3xl">
                      Clique para ampliar
                    </div>
                  </a>
                ) : (
                  <span className="text-slate-500 font-medium text-sm">
                    Nenhuma imagem enviada.
                  </span>
                )}
              </div>
            </div>

            {viagemSelecionada.mensagem?.includes('Justificativa:') && (
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shrink-0 mt-4">
                <h4 className="text-xs font-bold text-amber-800 uppercase mb-1">
                  Aviso da Galeria
                </h4>

                <p className="text-sm text-amber-900">
                  {viagemSelecionada.mensagem}
                </p>
              </div>
            )}
          </div>

          {/* DADOS DA VIAGEM */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 h-fit space-y-5">
            <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm font-medium border border-blue-100 mb-6">
              Revise os dados lidos pela IA. Se algum campo estiver vazio ou
              incorreto, edite-o olhando para a foto antes de aprovar.
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Nº do Contêiner
              </label>

              <input
                type="text"
                value={editContainer}
                onChange={(e) =>
                  setEditContainer(e.target.value.toUpperCase())
                }
                className={`w-full bg-white rounded-xl p-3 text-lg font-black tracking-wider outline-none border-2 focus:border-blue-500 ${
                  !editContainer
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-slate-200'
                }`}
                placeholder="XXXX0000000"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Placa
                </label>

                <input
                  type="text"
                  value={editPlaca}
                  onChange={(e) =>
                    setEditPlaca(e.target.value.toUpperCase())
                  }
                  className={`w-full bg-white rounded-xl p-3 text-sm font-bold uppercase outline-none border-2 focus:border-blue-500 ${
                    !editPlaca
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-slate-200'
                  }`}
                  placeholder="ABC1D23"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Frota
                </label>

                <input
                  type="text"
                  value={editFrota}
                  onChange={(e) =>
                    setEditFrota(e.target.value.toUpperCase())
                  }
                  className="w-full bg-white border-slate-200 border-2 rounded-xl p-3 text-sm font-bold uppercase outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Carreta
              </label>

              <input
                type="text"
                value={editCarreta}
                onChange={(e) =>
                  setEditCarreta(e.target.value.toUpperCase())
                }
                className="w-full bg-white border-slate-200 border-2 rounded-xl p-3 text-sm font-bold uppercase outline-none focus:border-blue-500"
              />
            </div>

            <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-2 text-sm text-slate-500">
              <div>
                <strong className="block text-xs uppercase">
                  Operação:
                </strong>
                {viagemSelecionada.tipo_operacao}
              </div>

              <div>
                <strong className="block text-xs uppercase">
                  Trajeto:
                </strong>
                {viagemSelecionada.origem} ➔ {viagemSelecionada.destino}
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* BOTÕES */}
      <div className="bg-white border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between gap-3">
        
        <button
          type="button"
          onClick={excluirViagem}
          disabled={isSaving}
          className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-6 py-3 rounded-xl font-bold flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-5 h-5 mr-2" />
          Excluir Viagem
        </button>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={fecharModal}
            disabled={isSaving}
            className="px-6 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="submit"
            form="form-validacao"
            disabled={isSaving || !editContainer || !editPlaca}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold flex items-center justify-center transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Processando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Aprovar Viagem
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
