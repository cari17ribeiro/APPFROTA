import React, { useState } from 'react';
import { Truck, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

export default function LoginScreen({ onLogin, supabase }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const EMAIL_VALIDADOR = import.meta.env.VITE_EMAIL_VALIDACAO;
  const EMAIL_PROGRAMACAO = import.meta.env.VITE_EMAIL_PROGRAMACAO || 'programacao@premio.com';

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);

    try {
      const emailNormalizado = email.trim().toLowerCase();

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailNormalizado,
        password
      });

      if (authError) {
        throw new Error('Credenciais inválidas. Verifique os seus dados.');
      }

      if (EMAIL_VALIDADOR && emailNormalizado === EMAIL_VALIDADOR.toLowerCase()) {
        onLogin({
          ...authData.user,
          email: emailNormalizado,
          role: 'validador'
        });
        return;
      }

      if (emailNormalizado === EMAIL_PROGRAMACAO.toLowerCase()) {
        onLogin({
          ...authData.user,
          email: emailNormalizado,
          motorista: 'Mesa de Programação',
          role: 'programacao',
          admin: false
        });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('motoristas_cadastrados')
        .select('*')
        .eq('email', emailNormalizado)
        .single();

      if (profileError || !profile) {
        throw new Error('Perfil não encontrado na base de motoristas.');
      }

      onLogin({ ...authData.user, ...profile });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };
