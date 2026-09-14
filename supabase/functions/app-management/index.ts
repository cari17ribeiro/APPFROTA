import { createClient } from 'npm:@supabase/supabase-js@2.97.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });

const parseSecretDictionary = (value: string | undefined, fallbackName: string) => {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    const candidate = parsed?.default || parsed?.[fallbackName] || Object.values(parsed || {})[0] || '';
    return typeof candidate === 'string' ? candidate : '';
  } catch {
    return value;
  }
};

const getEnvKey = (legacyName: string, dictionaryName: string, fallbackName: string) =>
  Deno.env.get(legacyName) || parseSecretDictionary(Deno.env.get(dictionaryName), fallbackName);

const allowedEmails = () => {
  const configured = (Deno.env.get('APP_MANAGEMENT_ALLOWED_EMAILS') || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return new Set(['validacao@premio.com', ...configured]);
};

const normalizeEmail = (email: unknown) => String(email || '').trim().toLowerCase();
const normalizeText = (value: unknown) => String(value || '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = getEnvKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS', 'default');
  const serviceRoleKey = getEnvKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS', 'default');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Configuração do Supabase incompleta na Edge Function.' }, 500);
  }

  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return json({ error: 'Sessão não enviada. Entre novamente no app.' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const caller = userData?.user;

  if (userError || !caller?.email) {
    return json({ error: 'Não foi possível validar o usuário logado.' }, 401);
  }

  if (!allowedEmails().has(caller.email.trim().toLowerCase())) {
    return json({ error: 'Seu usuário não tem permissão para gerir acessos.' }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  try {
    if (body.action === 'list-users') {
      const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });

      if (authError) throw authError;

      const authUsers = authData?.users || [];
      const ids = authUsers.map((user) => user.id);

      const { data: profiles, error: profileError } = await adminClient
        .from('motoristas_cadastrados')
        .select('id, email, motorista, usuario, admin, video_obrigatorio_assistido')
        .in('id', ids);

      if (profileError) throw profileError;

      const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const users = authUsers
        .map((user) => {
          const profile = profileById.get(user.id) || {};
          return {
            id: user.id,
            email: user.email,
            motorista: profile.motorista || user.user_metadata?.motorista || '',
            usuario: profile.usuario || '',
            admin: Boolean(profile.admin),
            video_obrigatorio_assistido: Boolean(profile.video_obrigatorio_assistido),
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at
          };
        })
        .sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));

      return json({ users });
    }

    if (body.action === 'create-user') {
      const email = normalizeEmail(body.email);
      const password = normalizeText(body.password);
      const motorista = normalizeText(body.motorista);
      const usuario = normalizeText(body.usuario);
      const isAdmin = Boolean(body.admin);

      if (!email || !password || !motorista) {
        return json({ error: 'Informe nome, e-mail e senha.' }, 400);
      }

      if (password.length < 6) {
        return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { motorista }
      });

      if (createError) throw createError;

      const userId = created.user?.id;
      if (!userId) {
        return json({ error: 'Usuário criado sem ID retornado pelo Supabase.' }, 500);
      }

      const { error: profileError } = await adminClient
        .from('motoristas_cadastrados')
        .upsert({
          id: userId,
          email,
          motorista,
          usuario: usuario || null,
          precisa_trocar_senha: true,
          admin: isAdmin,
          video_obrigatorio_assistido: false
        });

      if (profileError) throw profileError;

      return json({ ok: true, userId });
    }

    if (body.action === 'update-password') {
      const userId = normalizeText(body.userId);
      const password = normalizeText(body.password);

      if (!userId || password.length < 6) {
        return json({ error: 'Informe o usuário e uma senha com pelo menos 6 caracteres.' }, 400);
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        password
      });

      if (updateError) throw updateError;

      await adminClient
        .from('motoristas_cadastrados')
        .update({ precisa_trocar_senha: true })
        .eq('id', userId);

      return json({ ok: true });
    }

    if (body.action === 'delete-user') {
      const userId = normalizeText(body.userId);

      if (!userId) {
        return json({ error: 'Informe o usuário que será excluído.' }, 400);
      }

      if (userId === caller.id) {
        return json({ error: 'Você não pode excluir o próprio usuário logado.' }, 400);
      }

      const { error: profileError } = await adminClient
        .from('motoristas_cadastrados')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;

      return json({ ok: true });
    }

    return json({ error: 'Ação não reconhecida.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado na gestão do app.';
    return json({ error: message }, 500);
  }
});
