-- Execute este arquivo uma vez no SQL Editor do Supabase.
-- Ele guarda a confirmação diretamente na tabela motoristas_cadastrados.

begin;

alter table public.motoristas_cadastrados
  add column if not exists video_obrigatorio_assistido boolean not null default false;

comment on column public.motoristas_cadastrados.video_obrigatorio_assistido is
  'Indica que o motorista concluiu o vídeo obrigatório eFaztZv-aUM.';

-- Garante que usuários autenticados possam atualizar esta coluna.
-- As políticas RLS continuam decidindo qual linha cada usuário pode alterar.
grant update (video_obrigatorio_assistido)
  on table public.motoristas_cadastrados
  to authenticated;

-- Se a tabela já usa RLS, esta política permite que cada motorista confirme
-- somente a própria linha. USING e WITH CHECK são necessários em UPDATE.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'motoristas_cadastrados'
      and policyname = 'Motorista confirma o proprio video obrigatorio'
  ) then
    create policy "Motorista confirma o proprio video obrigatorio"
      on public.motoristas_cadastrados
      for update
      to authenticated
      using ((select auth.uid()) = id)
      with check ((select auth.uid()) = id);
  end if;
end
$$;

commit;

-- Verificação: deve retornar a coluna com data_type = boolean.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'motoristas_cadastrados'
  and column_name = 'video_obrigatorio_assistido';

-- Quando você trocar o vídeo no futuro, altere o ID em src/App.jsx e execute:
-- update public.motoristas_cadastrados
-- set video_obrigatorio_assistido = false;
