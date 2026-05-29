import React, { useState } from 'react';
import { Truck, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

export default function LoginScreen({ onLogin, supabase }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const EMAIL_VALIDADOR = import.meta.env.VITE_EMAIL_VALIDACAO;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw new Error('Credenciais inválidas. Verifique os seus dados.');

    
      if (email.toLowerCase() === EMAIL_VALIDADOR.toLowerCase()) {
        onLogin({ ...authData.user, email: email, role: 'validador' });
        return; 
      }

      const { data: profile, error: profileError } = await supabase
        .from('motoristas_cadastrados')
        .select('*')
        .eq('email', email)
        .single();

      if (profileError || !profile) throw new Error('Perfil não encontrado na base de motoristas.');

      onLogin({ ...authData.user, ...profile });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-blue-400/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-teal-400/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-md w-full bg-white backdrop-blur-2xl rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden border border-slate-100 relative z-10">
        <div className="pt-12 pb-6 text-center px-6">
          <div className="inline-flex bg-gradient-to-br from-blue-600 to-teal-500 p-4 rounded-2xl shadow-lg shadow-blue-500/20 mb-6">
            <Truck className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">BD FLOW</h2>
          <p className="text-slate-500 text-sm mt-2 font-medium">Logística & Fidelidade Operacional</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-8 pt-2 space-y-6">
          {error && (
            <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-sm flex items-start space-x-3 border border-rose-100">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700 ml-1">Login</label>
            <input 
              type="email" 
              required
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3.5 focus:bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
              placeholder="nome@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700 ml-1">Senha</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'} 
                required
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3.5 pr-12 focus:bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                aria-label={showPassword ? 'Ocultar senha' : 'Revelar senha'}
                title={showPassword ? 'Ocultar senha' : 'Revelar senha'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white py-4 px-4 rounded-2xl transition-all font-bold text-lg shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none mt-2"
          >
            {isLoggingIn ? <Loader2 className="w-6 h-6 animate-spin" /> : <span>Entrar </span>}
          </button>
        </form>
      </div>
    </div>
  );
}
