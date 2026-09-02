import React, { useState, useEffect } from 'react';
import { Truck, LogOut, Loader2 } from 'lucide-react';
import LoginScreen from './pages/LoginScreen.jsx';
import DriverDashboard from './pages/DriverDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import ValidacaoExtrasScreen from './pages/ValidacaoExtrasScreen.jsx';
import ProgramacaoViagensScreen from './pages/ProgramacaoViagensScreen.jsx';
import MandatoryVideoScreen from './components/MandatoryVideoScreen.jsx';
import { supabase } from './lib/supabase.js';

const MANDATORY_VIDEO_ID = 'eFaztZv-aUM';
const VALIDATION_EMAILS = [
  'validacao@premio.com',
  (import.meta.env.VITE_EMAIL_VALIDACAO || '').trim().toLowerCase()
].filter(Boolean);
const PROGRAMMING_EMAILS = [
  'programacao@premio.com',
  (import.meta.env.VITE_EMAIL_PROGRAMACAO || '').trim().toLowerCase()
].filter(Boolean);

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const usuarioSalvo = localStorage.getItem('statusDiario_User');
    return usuarioSalvo ? JSON.parse(usuarioSalvo) : null;
  });

  const [viagens, setViagens] = useState([]);
  const [pendentes, setPendentes] = useState([]);
  const [resumos, setResumos] = useState([]);
  const [diesel, setDiesel] = useState([]);
  const [premiosLiberados, setPremiosLiberados] = useState(false);
  const [correcoesBloqueadas, setCorrecoesBloqueadas] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [videoGate, setVideoGate] = useState({ status: 'idle', error: '' });
  const [videoCheckAttempt, setVideoCheckAttempt] = useState(0);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('statusDiario_User', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('statusDiario_User');
    }
  }, [currentUser]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setCurrentUser(null);
        localStorage.removeItem('statusDiario_User');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkMandatoryVideo = async () => {
      if (!currentUser) {
        setVideoGate({ status: 'idle', error: '' });
        return;
      }

      setVideoGate({ status: 'checking', error: '' });

      const { data: authData, error: authError } = await supabase.auth.getUser();
      const authenticatedUser = authData?.user;

      if (cancelled) return;

      if (authError || !authenticatedUser || authenticatedUser.id !== currentUser.id) {
        console.error('Erro ao validar usuário autenticado:', authError);
        setVideoGate({
          status: 'error',
          error: 'Sua sessão não pôde ser validada. Saia e entre novamente.'
        });
        return;
      }

      const authenticatedEmail = (authenticatedUser.email || '').trim().toLowerCase();

      if (VALIDATION_EMAILS.includes(authenticatedEmail)) {
        if (currentUser.email !== authenticatedEmail || currentUser.role !== 'validador') {
          setCurrentUser({ ...authenticatedUser, email: authenticatedEmail, role: 'validador' });
        }
        setVideoGate({ status: 'complete', error: '' });
        return;
      }

      if (PROGRAMMING_EMAILS.includes(authenticatedEmail)) {
        if (currentUser.email !== authenticatedEmail || currentUser.role !== 'programacao') {
          setCurrentUser({
            ...authenticatedUser,
            email: authenticatedEmail,
            motorista: 'Mesa de Programação',
            role: 'programacao',
            admin: false
          });
        }
        setVideoGate({ status: 'complete', error: '' });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('motoristas_cadastrados')
        .select('id, email, motorista, admin, video_obrigatorio_assistido')
        .eq('id', authenticatedUser.id)
        .single();

      if (cancelled) return;

      if (profileError || !profile) {
        console.error('Erro ao verificar vídeo obrigatório:', profileError);
        setVideoGate({
          status: 'error',
          error: 'Não foi possível validar seu perfil e a confirmação do vídeo. Verifique a conexão e tente novamente.'
        });
        return;
      }

      if (
        currentUser.email !== profile.email ||
        currentUser.motorista !== profile.motorista ||
        Boolean(currentUser.admin) !== Boolean(profile.admin) ||
        currentUser.role === 'validador' ||
        currentUser.role === 'programacao'
      ) {
        setCurrentUser({ ...authenticatedUser, ...profile, role: null });
      }

      setVideoGate({
        status: profile.admin || profile.video_obrigatorio_assistido ? 'complete' : 'required',
        error: ''
      });
    };

    checkMandatoryVideo();

    return () => {
      cancelled = true;
    };
  }, [currentUser, videoCheckAttempt]);

  const fetchData = async () => {
    if (!currentUser) return;

    if (videoGate.status !== 'complete') {
      return;
    }

    if (
      currentUser.role === 'validador' ||
      currentUser.email === 'validacao@premio.com' ||
      currentUser.role === 'programacao' ||
      currentUser.email === 'programacao@premio.com'
    ) {
      return;
    }

    setIsLoadingData(true);

    try {
      const { data: configData } = await supabase
        .from('configuracoes')
        .select('*')
        .eq('id', 1)
        .single();

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
      console.error('Erro ao buscar dados:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser, videoGate.status]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    localStorage.removeItem('statusDiario_User');
  };

  const handleMandatoryVideoComplete = async () => {
    const { data, error } = await supabase
      .from('motoristas_cadastrados')
      .update({ video_obrigatorio_assistido: true })
      .eq('id', currentUser.id)
      .select('id, video_obrigatorio_assistido')
      .single();

    if (error || !data?.video_obrigatorio_assistido) {
      console.error('Erro ao confirmar vídeo obrigatório:', error);
      throw new Error('Não foi possível salvar a confirmação no Supabase. Tente novamente.');
    }

    setCurrentUser((user) => ({
      ...user,
      video_obrigatorio_assistido: true
    }));
    setVideoGate({ status: 'complete', error: '' });
  };

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} supabase={supabase} />;
  }

  if (['idle', 'checking'].includes(videoGate.status)) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4 px-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
        <p className="font-semibold text-center">Validando seu acesso...</p>
      </div>
    );
  }

  if (videoGate.status === 'error') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl border border-rose-800 bg-slate-900 p-7 text-center shadow-2xl">
          <p className="text-rose-200 font-semibold">{videoGate.error}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => setVideoCheckAttempt((attempt) => attempt + 1)}
              className="rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-3 font-bold"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-600 hover:bg-slate-800 px-5 py-3 font-bold"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (videoGate.status === 'required') {
    return (
      <MandatoryVideoScreen
        videoId={MANDATORY_VIDEO_ID}
        driverName={currentUser.motorista}
        onComplete={handleMandatoryVideoComplete}
      />
    );
  }

  if (currentUser.role === 'validador' || currentUser.email === 'validacao@premio.com') {
    return <ValidacaoExtrasScreen supabase={supabase} onLogout={handleLogout} />;
  }

  if (currentUser.role === 'programacao' || currentUser.email === 'programacao@premio.com') {
    return <ProgramacaoViagensScreen supabase={supabase} onLogout={handleLogout} />;
  }

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
              onClick={handleLogout}
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
            viagens={viagens}
            setViagens={setViagens}
            pendentes={pendentes}
            setPendentes={setPendentes}
            premiosLiberados={premiosLiberados}
            setPremiosLiberados={setPremiosLiberados}
            correcoesBloqueadas={correcoesBloqueadas}
            setCorrecoesBloqueadas={setCorrecoesBloqueadas}
            ultimaAtualizacao={ultimaAtualizacao}
            refreshData={fetchData}
            supabase={supabase}
          />
        ) : (
          <DriverDashboard
            currentUser={currentUser}
            viagens={viagens}
            setViagens={setViagens}
            pendentes={pendentes}
            setPendentes={setPendentes}
            resumos={resumos}
            diesel={diesel}
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
