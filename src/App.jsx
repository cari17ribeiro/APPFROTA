import React, { useState, useEffect } from 'react';
import { Truck, LogOut, Loader2 } from 'lucide-react';
import LoginScreen from './pages/LoginScreen.jsx';
import DriverDashboard from './pages/DriverDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import ValidacaoExtrasScreen from './pages/ValidacaoExtrasScreen.jsx'; // IMPORTAMOS A TELA AQUI
import { supabase } from './lib/supabase.js';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null); 
  const [viagens, setViagens] = useState([]);
  const [pendentes, setPendentes] = useState([]);
  const [resumos, setResumos] = useState([]);
  const [diesel, setDiesel] = useState([]);
  const [premiosLiberados, setPremiosLiberados] = useState(false);
  const [correcoesBloqueadas, setCorrecoesBloqueadas] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const fetchData = async () => {
    if (!currentUser) return;

    // Se for o usuário de validação, não precisamos carregar as viagens do painel principal
    if (currentUser.role === 'validador' || currentUser.email === 'validacao@premio.com') {
      return; 
    }

    setIsLoadingData(true);

    try {
      const { data: configData } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      if (configData) {
        setPremiosLiberados(configData.premios_liberados);
        setCorrecoesBloqueadas(configData.correcoes_bloqueadas);
        setUltimaAtualizacao(configData.ultima_atualizacao);
      }

      if (currentUser.admin) {
        const [resViagens, resPendentes] = await Promise.all([
          supabase.from('minhas_viagens').select('*').order('data', { ascending: false }),
          supabase.from('viagens_pendentes').select('*').order('data', { ascending: false })
        ]);
        if (resViagens.data) setViagens(resViagens.data);
        if (resPendentes.data) setPendentes(resPendentes.data);
      } else {
        const [resViagens, resPendentes, resResumo, resDiesel] = await Promise.all([
          supabase.from('minhas_viagens').select('*').eq('email', currentUser.email).order('data', { ascending: false }),
          supabase.from('viagens_pendentes').select('*').eq('email', currentUser.email).order('data', { ascending: false }),
          supabase.from('resumo').select('*').eq('email', currentUser.email),
          supabase.from('diesel').select('*').eq('email', currentUser.email)
        ]);
        if (resViagens.data) setViagens(resViagens.data);
        if (resPendentes.data) setPendentes(resPendentes.data);
        if (resResumo.data) setResumos(resResumo.data);
        if (resDiesel.data) setDiesel(resDiesel.data);
      }
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  // Se não estiver logado, mostra o Login
  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} supabase={supabase} />;
  }

  // Se for o usuário de validação, mostra apenas a tela dele
  if (currentUser.role === 'validador' || currentUser.email === 'validacao@premio.com') {
    return <ValidacaoExtrasScreen supabase={supabase} onLogout={() => setCurrentUser(null)} />;
  }

  // Renderização padrão para Admin ou Motorista
  return (
    <div className="min-h-screen bg-[#F4F7F9] text-slate-800 font-sans selection:bg-blue-200">
      <header className="bg-gradient-to-r from-blue-700 via-blue-600 to-teal-500 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center relative overflow-hidden">
          
          <div className="flex items-center space-x-3 relative z-10">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm border border-white/30 shadow-sm">
              <Truck className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tight text-white drop-shadow-sm">
              BD <span className="text-teal-200">FLOW</span>
            </span>
          </div>
          
          <div className="flex items-center space-x-4 relative z-10">
            <div className="hidden sm:flex items-center bg-white/10 border border-white/20 px-4 py-2 rounded-xl backdrop-blur-md shadow-inner">
              <div className="w-2 h-2 rounded-full bg-teal-300 mr-2 animate-pulse shadow-[0_0_8px_rgba(94,234,212,0.8)]"></div>
              <span className="text-sm font-medium text-white drop-shadow-sm">
                {currentUser.admin ? 'Fidelidade' : currentUser.motorista}
              </span>
            </div>
            <button 
              onClick={() => setCurrentUser(null)}
              className="flex items-center justify-center p-2.5 sm:px-4 sm:py-2 bg-white/10 hover:bg-rose-500 text-white rounded-xl transition-all duration-300 border border-white/20 hover:border-rose-400 shadow-sm"
              title="Sair"
            >
              <LogOut className="h-5 w-5 sm:mr-2" />
              <span className="hidden sm:inline text-sm font-semibold">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 relative">
        {isLoadingData && (
          <div className="absolute inset-0 bg-[#F4F7F9]/70 backdrop-blur-sm z-50 flex justify-center items-start pt-20 rounded-3xl">
             <div className="flex items-center space-x-3 text-blue-600 bg-white px-6 py-4 rounded-2xl shadow-xl border border-blue-50 ring-1 ring-blue-100/50">
               <Loader2 className="w-6 h-6 animate-spin" />
               <span className="font-semibold">A sincronizar dados em tempo real...</span>
             </div>
          </div>
        )}

        {currentUser.admin ? (
          <AdminDashboard 
            viagens={viagens} setViagens={setViagens} 
            pendentes={pendentes} setPendentes={setPendentes} 
            premiosLiberados={premiosLiberados} setPremiosLiberados={setPremiosLiberados} 
            correcoesBloqueadas={correcoesBloqueadas} setCorrecoesBloqueadas={setCorrecoesBloqueadas}
            ultimaAtualizacao={ultimaAtualizacao}
            refreshData={fetchData}
            supabase={supabase}
          />
        ) : (
          <DriverDashboard 
            currentUser={currentUser} 
            viagens={viagens} setViagens={setViagens} 
            pendentes={pendentes} setPendentes={setPendentes} 
            resumos={resumos} diesel={diesel} 
            premiosLiberados={premiosLiberados} 
            correcoesBloqueadas={correcoesBloqueadas}
            refreshData={fetchData}
            supabase={supabase}
          />
        )}
      </main>
    </div>
  );
}