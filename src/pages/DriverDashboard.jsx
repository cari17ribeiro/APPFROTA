import React, { useState, useMemo } from 'react';
import { 
  Clock, Award, FileText, Package, Droplet, ChevronRight, 
  AlertCircle, Plus, Filter, Truck, CheckCircle, XCircle, 
  MessageSquare, Image as ImageIcon, Camera // <-- Camera adicionada aqui
} from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import AddTripModal from '../components/AddTripModal.jsx';
import ExtraTripScreen from './ExtraTripScreen.jsx'; // <-- Nova importação aqui
import { calcularPeriodoViagem } from '../utils/periodos.js';

export default function DriverDashboard({ currentUser, viagens, setViagens, pendentes, setPendentes, resumos, diesel, premiosLiberados, correcoesBloqueadas, ultimaAtualizacao, refreshData, supabase }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExtraModal, setShowExtraModal] = useState(false); // <-- Novo estado aqui
  const [filtroCompetencia, setFiltroCompetencia] = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState('');
  const [filtroDiesel, setFiltroDiesel] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  const historicoComPeriodo = useMemo(() => {
    const confirmadas = viagens.filter(v => v.email === currentUser.email);
    const enviadas = pendentes.filter(p => p.email === currentUser.email);
    const todos = [...confirmadas, ...enviadas].sort((a, b) => new Date(b.data) - new Date(a.data));
    return todos.map(item => ({ ...item, _periodo: calcularPeriodoViagem(item.data) }));
  }, [viagens, pendentes, currentUser.email]);

  const competenciasResumoDisponiveis = useMemo(() => {
    const c1 = resumos.filter(r => r.email === currentUser.email).map(r => r.mes || r.competencia);
    return [...new Set(c1.filter(Boolean))].sort((a, b) => {
      const [m1, y1] = a.split('/');
      const [m2, y2] = b.split('/');
      if (y1 !== y2) return (Number(y2) || 0) - (Number(y1) || 0);
      return (Number(m2) || 0) - (Number(m1) || 0);
    });
  }, [resumos, currentUser.email]);

  const competenciasDieselDisponiveis = useMemo(() => {
    const c2 = diesel.filter(d => d.email === currentUser.email).map(d => d.competencia || d.mes);
    return [...new Set(c2.filter(Boolean))].sort((a, b) => {
      const [m1, y1] = a.split('/');
      const [m2, y2] = b.split('/');
      if (y1 !== y2) return (Number(y2) || 0) - (Number(y1) || 0);
      return (Number(m2) || 0) - (Number(m1) || 0);
    });
  }, [diesel, currentUser.email]);

  const periodosDisponiveis = useMemo(() => {
    const periodos = historicoComPeriodo.map(item => item._periodo).filter(Boolean);
    return [...new Set(periodos)].sort((a, b) => {
      const [m1, y1] = a.split('/');
      const [m2, y2] = b.split('/');
      if (y1 !== y2) return (Number(y2) || 0) - (Number(y1) || 0);
      return (Number(m2) || 0) - (Number(m1) || 0);
    });
  }, [historicoComPeriodo]);

  const tiposDisponiveis = useMemo(() => {
    const tipos = historicoComPeriodo.map(item => item.tipo).filter(Boolean);
    return [...new Set(tipos)].sort();
  }, [historicoComPeriodo]);

  const meuResumo = useMemo(() => {
    const driverResumos = resumos.filter(r => r.email === currentUser.email);
    if (filtroCompetencia) return driverResumos.find(r => r.mes === filtroCompetencia || r.competencia === filtroCompetencia) || driverResumos[0] || {};
    return driverResumos[0] || {};
  }, [resumos, currentUser.email, filtroCompetencia]);

  const meuDiesel = useMemo(() => {
    const driverDiesel = diesel.filter(d => d.email === currentUser.email);
    if (filtroDiesel) return driverDiesel.find(d => d.competencia === filtroDiesel || d.mes === filtroDiesel) || driverDiesel[0] || {};
    return driverDiesel[0] || {};
  }, [diesel, currentUser.email, filtroDiesel]);
  
  const historicoFiltrado = useMemo(() => {
    let filtrado = historicoComPeriodo;
    if (filtroPeriodo) filtrado = filtrado.filter(item => item._periodo === filtroPeriodo);
    if (filtroTipo) filtrado = filtrado.filter(item => item.tipo === filtroTipo);
    return filtrado;
  }, [historicoComPeriodo, filtroPeriodo, filtroTipo]);

  const handleAddTrip = async (newTripData) => {
    const novaPendente = {
      user_id: currentUser.id,
      email: currentUser.email,
      nome: currentUser.motorista,
      status: 'Em Análise', 
      resposta: null,
      ...newTripData
    };

    const { error } = await supabase.from('viagens_pendentes').insert([novaPendente]);
    if (error) alert("Erro ao enviar solicitação para a base de dados.");
    else { refreshData(); setShowAddModal(false); setShowExtraModal(false); }
  };

  const handleConferirViagem = async (item) => {
    const isChecked = ['confirmada', 'Aprovada', 'Aprovado'].includes(item.status);
    const novoStatus = isChecked ? (item.mes ? 'Pendente' : 'Pendente') : 'confirmada';

    const isPendenteTable = pendentes.some(p => p.id === item.id);
    if (isPendenteTable) {
      setPendentes(pendentes.map(p => p.id === item.id ? { ...p, status: novoStatus } : p));
    } else {
      setViagens(viagens.map(v => v.id === item.id ? { ...v, status: novoStatus } : v));
    }

    const tableToUpdate = isPendenteTable ? 'viagens_pendentes' : 'minhas_viagens';
    const { error } = await supabase.from(tableToUpdate).update({ status: novoStatus }).eq('id', item.id);
    if (error) refreshData();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Olá, {currentUser.motorista.split(' ')[0]} 👋</h1>
          <p className="text-slate-500 font-medium mt-1">Aqui está o resumo da sua performance.</p>
        </div>

      {ultimaAtualizacao && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-start space-x-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600 shrink-0 mt-0.5">
             <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-blue-900">Base de Dados Sincronizada</h4>
            <p className="text-sm text-blue-800/80 mt-0.5 font-medium">
              As informações de viagens, premiações e médias de diesel foram atualizadas em: <strong className="text-blue-700">{new Date(ultimaAtualizacao).toLocaleString('pt-BR')}</strong>.
            </p>
          </div>
        </div>
      )}
        
        <div className="flex items-center space-x-3 bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-200/60 w-full sm:w-auto">
          <Award className="w-5 h-5 text-teal-500 flex-shrink-0" />
          <select 
            value={filtroCompetencia} 
            onChange={e => setFiltroCompetencia(e.target.value)} 
            className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer w-full"
          >
            <option value="">Desempenho (Todos)</option>
            {competenciasResumoDisponiveis.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard 
          icon={<FileText className="h-6 w-6" />} color="blue" 
          title="Impo / Expo" value={`${meuResumo.impo || 0} / ${meuResumo.expo || 0}`} 
        />
        <StatCard 
          icon={<Package className="h-6 w-6" />} color="indigo" 
          title="Extras / Total" value={meuResumo.extra || 0} subtitle={`(${meuResumo.total_viagens || 0} viagens)`} 
        />
        <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200/60 hover:shadow-lg transition-all duration-300 group flex items-start space-x-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 rounded-bl-full -z-10 group-hover:scale-125 transition-transform duration-500"></div>
          <div className="bg-teal-50 text-teal-600 p-3.5 sm:p-4 rounded-2xl group-hover:scale-110 transition-transform duration-300 shrink-0">
            <Award className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[56px]">
            <p className="text-sm text-slate-500 font-semibold mb-0.5 truncate">Prémio Atual</p>
            {premiosLiberados ? (
              <p className="text-2xl font-black text-teal-600 tracking-tight truncate">{meuResumo.premio || 'R$ 0,00'}</p>
            ) : (
              <p className="text-[11px] font-bold text-slate-400 leading-snug">Calculado após as correções</p>
            )}
          </div>
        </div>
        <StatCard 
          icon={<Droplet className="h-6 w-6" />} color="cyan" 
          title="Média Diesel" value={meuDiesel.media || '0.00'} subtitle="km/L"
          extraContent={
            <div className="relative mt-2">
              <select 
                value={filtroDiesel} 
                onChange={e => setFiltroDiesel(e.target.value)} 
                className="w-full text-[11px] font-bold text-cyan-700 bg-cyan-50/50 border border-cyan-100/80 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-cyan-500/20 cursor-pointer appearance-none pr-6"
              >
                <option value="">Última Competência</option>
                {competenciasDieselDisponiveis.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight className="w-3 h-3 text-cyan-600 rotate-90" />
              </div>
            </div>
          }
        />
      </div>

      {/* Ações */}
      <div className="flex flex-col sm:flex-row justify-end gap-3">
         {correcoesBloqueadas ? (
            <div className="w-full sm:max-w-lg bg-blue-50/80 border border-blue-200/60 text-blue-800 p-5 rounded-2xl shadow-sm text-sm backdrop-blur-sm">
               <p className="font-bold flex items-center mb-1.5 text-blue-900 text-base"><AlertCircle className="w-5 h-5 mr-2 text-blue-600"/> Prazo Encerrado</p>
               <p className="font-medium text-blue-700/90 leading-relaxed">O envio de correções está suspenso. Novas correções entrarão no ciclo da próxima premiação.</p>
            </div>
         ) : (
            <>
              <button 
                onClick={() => setShowExtraModal(true)}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-900 text-white px-7 py-3.5 rounded-2xl transition-all duration-300 shadow-md hover:shadow-lg font-bold"
              >
                <Camera className="h-5 w-5 text-slate-300" />
                <span>Registar Extra (OCR)</span>
              </button>

              <button 
                onClick={() => setShowAddModal(true)}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white px-7 py-3.5 rounded-2xl transition-all duration-300 shadow-md hover:shadow-lg font-bold"
              >
                <Plus className="h-5 w-5 text-teal-200" />
                <span>Faltou uma viagem?</span>
              </button>
            </>
         )}
      </div>

      <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Histórico de Movimentações</h3>
            <span className="text-sm font-semibold text-slate-400">{historicoFiltrado.length} registos encontrados</span>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-200/60 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <select 
                value={filtroPeriodo} 
                onChange={e => setFiltroPeriodo(e.target.value)} 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer w-full"
              >
                <option value="">Período (Todos)</option>
                {periodosDisponiveis.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-200/60 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <select 
                value={filtroTipo} 
                onChange={e => setFiltroTipo(e.target.value)} 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer w-full"
              >
                <option value="">Tipo (Todos)</option>
                {tiposDisponiveis.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        {historicoFiltrado.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <div className="bg-blue-50 p-6 rounded-full mb-4"><Truck className="h-10 w-10 text-blue-300" /></div>
            <p className="text-slate-500 font-medium text-lg">Nenhum registo encontrado com estes filtros.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {historicoFiltrado.map(item => {
              const isEmAnalise = item.status === 'Em Análise' || item.status === 'inclusa';
              const isReprovado = item.status === 'Reprovado';
              const isBlockCheckbox = isEmAnalise || isReprovado;
              const isChecked = ['confirmada', 'Aprovada', 'Aprovado'].includes(item.status);

              return (
                <li key={item.id} className="p-4 sm:p-6 hover:bg-slate-50/80 transition-colors group">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    
                    <div className="flex items-start space-x-4">
                      <div className="pt-1.5 flex-shrink-0">
                        <div className="relative flex items-center justify-center">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            disabled={isBlockCheckbox}
                            onChange={() => handleConferirViagem(item)}
                            className={`peer appearance-none w-6 h-6 border-2 rounded-lg transition-all duration-300 ${
                              isBlockCheckbox 
                                ? 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-60' 
                                : 'bg-white border-slate-300 checked:bg-blue-500 checked:border-blue-500 cursor-pointer hover:border-blue-400'
                            }`}
                          />
                          <CheckCircle className={`absolute w-4 h-4 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity duration-300 ${isBlockCheckbox ? 'hidden' : ''}`} />
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-2">
                          <span className="font-bold text-slate-800 text-lg tracking-tight group-hover:text-blue-600 transition-colors">
                            {item.origem} <ChevronRight className="inline w-4 h-4 text-slate-300 mx-0.5" /> {item.destino}
                          </span>
                          <StatusBadge status={item.status} />
                        </div>
                        
                        <div className="text-sm text-slate-500 flex flex-wrap gap-x-6 gap-y-2 font-medium">
                          <span className="flex items-center bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100" title="Período de Faturação">
                            <Clock className="w-3.5 h-3.5 mr-1.5 text-blue-400"/> 
                             {new Date(item.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} <span className="text-slate-400 ml-1">({item._periodo})</span>
                          </span>
                          <span className="flex items-center bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100"><Package className="w-3.5 h-3.5 mr-1.5 text-teal-400"/> {item.container || 'S/ Contentor'}</span>
                          <span className="flex items-center bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100"><FileText className="w-3.5 h-3.5 mr-1.5 text-indigo-400"/> {item.tipo}</span>
                        </div>
                      </div>
                    </div>

                    {(item.resposta || (isEmAnalise && item.mensagem)) && (
                      <div className={`p-4 rounded-2xl text-sm flex items-start space-x-3 lg:max-w-xs w-full border ${
                        item.status === 'Reprovado' 
                          ? 'bg-rose-50/50 text-rose-800 border-rose-100' 
                          : isEmAnalise 
                            ? 'bg-blue-50/50 text-blue-800 border-blue-100'
                            : 'bg-teal-50/50 text-teal-800 border-teal-100'
                      }`}>
                        <div className="mt-0.5">
                          {item.status === 'Reprovado' ? <XCircle className="w-5 h-5 text-rose-500" /> : 
                           isEmAnalise ? <MessageSquare className="w-5 h-5 text-blue-500" /> :
                           <CheckCircle className="w-5 h-5 text-teal-500" />}
                        </div>
                        <div>
                          <span className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${
                            item.status === 'Reprovado' ? 'text-rose-500' : isEmAnalise ? 'text-blue-500' : 'text-teal-600'
                          }`}>
                            {item.status === 'Reprovado' ? 'Recusado por' : isEmAnalise ? 'Sua Mensagem' : 'Nota da Fidelidade'}
                          </span>
                          <p className="font-medium leading-relaxed">{item.resposta || item.mensagem}</p>
                        </div>
                      </div>
                    )}

                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showAddModal && <AddTripModal currentUser={currentUser} onClose={() => setShowAddModal(false)} onSave={handleAddTrip} supabase={supabase} />}
      
      {showExtraModal && <ExtraTripScreen currentUser={currentUser} onClose={() => setShowExtraModal(false)} onSave={handleAddTrip} supabase={supabase} />}
    </div>
  );
}