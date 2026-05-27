import React, { useState, useEffect } from 'react';
import { Loader2, Search, CheckCircle, AlertCircle, Image as ImageIcon, XCircle, Save, Filter, ArrowRight } from 'lucide-react';

export default function ValidacaoExtrasScreen({ supabase, onLogout }) {
  const [viagens, setViagens] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [filtroMotorista, setFiltroMotorista] = useState(''); 
  
  // Modal de Edição
  const [viagemSelecionada, setViagemSelecionada] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Estados editáveis do modal
  const [editContainer, setEditContainer] = useState('');
  const [editPlaca, setEditPlaca] = useState('');
  const [editFrota, setEditFrota] = useState('');
  const [editCarreta, setEditCarreta] = useState('');

  useEffect(() => {
    carregarViagensPendentes();
  }, [filtroDataInicio, filtroDataFim]);

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
    
    try {
      const { error } = await supabase
        .from('viagens_extra')
        .update({
          container: editContainer.toUpperCase(),
          placa: editPlaca.toUpperCase(),
          frota: editFrota.toUpperCase(),
          carreta: editCarreta.toUpperCase(),
          status: 'Validado' 
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

  const viagensFiltradas = viagens.filter(v => {
    if (!filtroMotorista) return true;
    const nomeMotorista = v.motorista?.toLowerCase() || '';
    return nomeMotorista.includes(filtroMotorista.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      
      {/* HEADER EXCLUSIVO BACK-OFFICE */}
      <header className="bg-slate-900 text-white p-5 shadow-md flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black flex items-center tracking-tight">
            <CheckCircle className="w-6 h-6 mr-2 text-emerald-400" />
            Auditoria de Viagens Extras
          </h1>
          <p className="text-slate-400 text-sm mt-1">Acesso Restrito: validacao@premio.com</p>
        </div>
        <button onClick={onLogout} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold text-sm transition-colors border border-slate-700">
          Sair do Sistema
        </button>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* BARRA DE FILTROS */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
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
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Inicial (Premiação)</label>
            <input 
              type="date" 
              value={filtroDataInicio}
              onChange={e => setFiltroDataInicio(e.target.value)}
              className="bg-slate-50 border-slate-200 rounded-xl p-2 text-sm outline-none border focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Final (Premiação)</label>
            <input 
              type="date" 
              value={filtroDataFim}
              onChange={e => setFiltroDataFim(e.target.value)}
              className="bg-slate-50 border-slate-200 rounded-xl p-2 text-sm outline-none border focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <button onClick={carregarViagensPendentes} className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-xl font-bold text-sm transition-colors border border-blue-200 flex items-center">
            <Filter className="w-4 h-4 mr-2" /> Filtrar
          </button>
        </div>

        {/* LISTAGEM (TABELA) */}
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
                        <td className="p-4 text-center">
                          {falhaOCR ? (
                            <span className="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-bold">
                              <AlertCircle className="w-3 h-3 mr-1" /> Revisão Necessária
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold">
                              <CheckCircle className="w-3 h-3 mr-1" /> IA Completa
                            </span>
                          )}
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

      </main>

      {/* MODAL DE VALIDAÇÃO (IMAGEM ÚNICA + FORMULÁRIO) */}
      {viagemSelecionada && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[90vh]">
            
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-black text-slate-800">Validação de Documentos</h3>
              <button onClick={fecharModal} className="text-slate-400 hover:text-slate-600"><XCircle className="w-6 h-6" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <form id="form-validacao" onSubmit={aprovarViagem} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* LADO ESQUERDO: FOTO ÚNICA (Provas) */}
                <div className="space-y-4 flex flex-col h-full">
                  <div className="flex-1 flex flex-col">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center"><ImageIcon className="w-4 h-4 mr-2" /> Foto Capturada (Contêiner + Placa)</h4>
                    <div className="bg-slate-900 rounded-3xl flex-1 min-h-[400px] border border-slate-200 overflow-hidden flex items-center justify-center relative group p-2">
                      {viagemSelecionada.comprovante_url ? (
                        <a href={viagemSelecionada.comprovante_url} target="_blank" rel="noreferrer" className="w-full h-full flex items-center justify-center">
                          <img src={viagemSelecionada.comprovante_url} alt="Comprovante" className="max-w-full max-h-[60vh] object-contain rounded-2xl" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-sm rounded-3xl">Clique para ampliar</div>
                        </a>
                      ) : (
                        <span className="text-slate-500 font-medium text-sm">Nenhuma imagem enviada.</span>
                      )}
                    </div>
                  </div>

                  {/* Justificativa de Galeria */}
                  {viagemSelecionada.mensagem?.includes('Justificativa:') && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shrink-0 mt-4">
                      <h4 className="text-xs font-bold text-amber-800 uppercase mb-1">Aviso da Galeria</h4>
                      <p className="text-sm text-amber-900">{viagemSelecionada.mensagem}</p>
                    </div>
                  )}
                </div>

                {/* LADO DIREITO: FORMULÁRIO DE CORREÇÃO */}
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 h-fit space-y-5">
                  <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm font-medium border border-blue-100 mb-6">
                    Revise os dados lidos pela IA. Se algum campo estiver vazio ou incorreto, edite-o olhando para as fotos ao lado antes de aprovar.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nº do Contêiner</label>
                    <input 
                      type="text" 
                      value={editContainer} 
                      onChange={e => setEditContainer(e.target.value.toUpperCase())}
                      className={`w-full bg-white rounded-xl p-3 text-lg font-black tracking-wider outline-none border-2 focus:border-blue-500 ${!editContainer ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                      placeholder="XXXX0000000"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Placa</label>
                      <input 
                        type="text" 
                        value={editPlaca} 
                        onChange={e => setEditPlaca(e.target.value.toUpperCase())}
                        className={`w-full bg-white rounded-xl p-3 text-sm font-bold uppercase outline-none border-2 focus:border-blue-500 ${!editPlaca ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                        placeholder="ABC1D23"
                      />
                    </div>
                    
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Frota</label>
                      <input 
                        type="text" 
                        value={editFrota} 
                        onChange={e => setEditFrota(e.target.value.toUpperCase())}
                        className="w-full bg-white border-slate-200 border-2 rounded-xl p-3 text-sm font-bold uppercase outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Carreta</label>
                    <input 
                      type="text" 
                      value={editCarreta} 
                      onChange={e => setEditCarreta(e.target.value.toUpperCase())}
                      className="w-full bg-white border-slate-200 border-2 rounded-xl p-3 text-sm font-bold uppercase outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-2 text-sm text-slate-500">
                     <div><strong className="block text-xs uppercase">Operação:</strong> {viagemSelecionada.tipo_operacao}</div>
                     <div><strong className="block text-xs uppercase">Trajeto:</strong> {viagemSelecionada.origem} ➔ {viagemSelecionada.destino}</div>
                  </div>
                </div>
              </form>
            </div>

            {/* RODAPÉ DO MODAL (BOTÕES) */}
            <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-end space-x-3">
              <button type="button" onClick={fecharModal} className="px-6 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors">
                Cancelar
              </button>
              <button 
                type="submit" 
                form="form-validacao" 
                disabled={isSaving || !editContainer || !editPlaca}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold flex items-center transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <> <Save className="w-5 h-5 mr-2"/> Aprovar Viagem </>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}