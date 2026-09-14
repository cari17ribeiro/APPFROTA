import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, KeyRound, Loader2, RefreshCw, Search, Trash2, UserPlus, Users } from 'lucide-react';

const initialForm = {
  nome: '',
  email: '',
  usuario: '',
  password: '',
  admin: false
};

export default function AppManagementScreen({ supabase, currentUser }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [form, setForm] = useState(initialForm);
  const [passwordForm, setPasswordForm] = useState({ userId: '', password: '' });

  const chamarGestao = useCallback(async (body) => {
    const { data, error } = await supabase.functions.invoke('app-management', { body });
    if (error) {
      throw new Error(error.message || 'Erro ao chamar a gestão do app.');
    }
    if (data?.error) {
      throw new Error(data.error);
    }
    return data;
  }, [supabase]);

  const carregarUsuarios = useCallback(async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const data = await chamarGestao({ action: 'list-users' });
      setUsuarios(data.users || []);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, [chamarGestao]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      carregarUsuarios();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [carregarUsuarios]);

  const usuariosFiltrados = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    if (!termo) return usuarios;
    return usuarios.filter((usuario) =>
      [usuario.email, usuario.motorista, usuario.usuario]
        .filter(Boolean)
        .some((valor) => valor.toLowerCase().includes(termo))
    );
  }, [usuarios, searchTerm]);

  const criarUsuario = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      await chamarGestao({
        action: 'create-user',
        email: form.email,
        password: form.password,
        motorista: form.nome,
        usuario: form.usuario,
        admin: form.admin
      });
      setForm(initialForm);
      setMessage({ type: 'success', text: 'Usuário criado com sucesso.' });
      await carregarUsuarios();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const trocarSenha = async (event) => {
    event.preventDefault();
    if (!passwordForm.userId) return;

    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      await chamarGestao({
        action: 'update-password',
        userId: passwordForm.userId,
        password: passwordForm.password
      });
      setPasswordForm({ userId: '', password: '' });
      setMessage({ type: 'success', text: 'Senha atualizada com sucesso.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const excluirUsuario = async (usuario) => {
    if (usuario.id === currentUser?.id) {
      setMessage({ type: 'error', text: 'Você não pode excluir o próprio usuário logado.' });
      return;
    }

    const confirmar = window.confirm(`Excluir o usuário ${usuario.email}? Essa ação remove o login e o cadastro do app.`);
    if (!confirmar) return;

    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      await chamarGestao({ action: 'delete-user', userId: usuario.id });
      setMessage({ type: 'success', text: 'Usuário excluído com sucesso.' });
      await carregarUsuarios();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const formatarData = (valor) => {
    if (!valor) return 'Nunca entrou';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(valor));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center">
            <Users className="w-5 h-5 mr-2 text-blue-600" />
            Gestão do app
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Crie usuários, altere senhas e remova acessos inativos sem abrir o Supabase.</p>
        </div>

        <button
          type="button"
          onClick={carregarUsuarios}
          disabled={loading || saving}
          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar lista
        </button>
      </div>

      {message.text && (
        <div className={`p-4 rounded-2xl border flex items-start gap-3 text-sm font-semibold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-black text-slate-800 flex items-center mb-5">
            <UserPlus className="w-5 h-5 mr-2 text-blue-600" />
            Novo usuário
          </h3>

          <form onSubmit={criarUsuario} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome</label>
              <input type="text" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Nome completo" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="nome@empresa.com" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Usuário</label>
              <input type="text" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Opcional" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Senha inicial</label>
              <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Mínimo 6 caracteres" />
            </div>
            <label className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={form.admin} onChange={(e) => setForm({ ...form, admin: e.target.checked })} className="w-4 h-4 accent-blue-600" />
              Acesso admin/fidelidade
            </label>
            <button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-bold transition-colors flex items-center justify-center disabled:opacity-60">
              {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
              Criar usuário
            </button>
          </form>
        </div>

        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="font-black text-slate-800">Usuários cadastrados</h3>
              <p className="text-sm text-slate-500 font-medium">{usuariosFiltrados.length} registros encontrados</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Buscar nome ou e-mail" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs font-black">
                <tr>
                  <th className="p-4">Usuário</th>
                  <th className="p-4">Perfil</th>
                  <th className="p-4">Último acesso</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                      Carregando usuários...
                    </td>
                  </tr>
                ) : usuariosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-500 font-medium">Nenhum usuário encontrado.</td>
                  </tr>
                ) : (
                  usuariosFiltrados.map((usuario) => (
                    <tr key={usuario.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="font-black text-slate-900">{usuario.motorista || usuario.email}</div>
                        <div className="text-xs text-slate-500 font-semibold">{usuario.email}</div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-black ${usuario.admin ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {usuario.admin ? 'Admin/Fidelidade' : 'Motorista'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600 font-semibold">{formatarData(usuario.last_sign_in_at)}</td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setPasswordForm({ userId: usuario.id, password: '' })} className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-100 px-3 py-2 rounded-lg font-bold flex items-center">
                            <KeyRound className="w-4 h-4 mr-1" />
                            Senha
                          </button>
                          <button type="button" onClick={() => excluirUsuario(usuario)} disabled={saving || usuario.id === currentUser?.id} className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 px-3 py-2 rounded-lg font-bold flex items-center disabled:opacity-50">
                            <Trash2 className="w-4 h-4 mr-1" />
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {passwordForm.userId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[120] p-4" onClick={() => setPasswordForm({ userId: '', password: '' })}>
          <form onSubmit={trocarSenha} className="bg-white rounded-3xl p-7 max-w-md w-full shadow-2xl space-y-5" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center">
                <KeyRound className="w-5 h-5 mr-2 text-amber-600" />
                Trocar senha
              </h3>
              <p className="text-sm text-slate-500 mt-1">Defina uma nova senha provisória para este usuário.</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nova senha</label>
              <input type="password" required minLength={6} value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/20" placeholder="Mínimo 6 caracteres" autoFocus />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setPasswordForm({ userId: '', password: '' })} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl font-bold">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center disabled:opacity-60">
                {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
