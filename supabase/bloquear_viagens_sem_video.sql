-- Execute este arquivo no SQL Editor do Supabase.
-- Ele impede no banco de dados que um motorista sem o vídeo concluído
-- insira registros em viagens_extra ou viagens_pendentes.

begin;

alter table public.viagens_extra enable row level security;
alter table public.viagens_pendentes enable row level security;

revoke insert on table public.viagens_extra from anon;
revoke insert on table public.viagens_pendentes from anon;
grant insert on table public.viagens_extra to authenticated;
grant insert on table public.viagens_pendentes to authenticated;

-- Mantém um caminho permissivo explícito para o motorista inserir apenas
-- uma viagem vinculada ao próprio usuário autenticado.
drop policy if exists "Motorista insere a propria viagem extra"
  on public.viagens_extra;

create policy "Motorista insere a propria viagem extra"
  on public.viagens_extra
  as permissive
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

-- Políticas restritivas são combinadas com todas as permissivas usando AND.
-- Assim, mesmo que já exista uma política ampla de INSERT, esta condição
-- continua obrigatória.
drop policy if exists "Exigir video para inserir viagem extra"
  on public.viagens_extra;

create policy "Exigir video para inserir viagem extra"
  on public.viagens_extra
  as restrictive
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1
      from public.motoristas_cadastrados as motorista
      where motorista.id = (select auth.uid())
        and motorista.video_obrigatorio_assistido is true
    )
  );

-- Aplica a mesma proteção às solicitações criadas em "Faltou uma viagem?".
drop policy if exists "Motorista insere a propria viagem pendente"
  on public.viagens_pendentes;

create policy "Motorista insere a propria viagem pendente"
  on public.viagens_pendentes
  as permissive
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

drop policy if exists "Exigir video para inserir viagem pendente"
  on public.viagens_pendentes;

create policy "Exigir video para inserir viagem pendente"
  on public.viagens_pendentes
  as restrictive
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1
      from public.motoristas_cadastrados as motorista
      where motorista.id = (select auth.uid())
        and motorista.video_obrigatorio_assistido is true
    )
  );

commit;

-- Verificação: devem aparecer as duas políticas de INSERT abaixo.
select
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('viagens_extra', 'viagens_pendentes')
  and policyname in (
    'Motorista insere a propria viagem extra',
    'Exigir video para inserir viagem extra',
    'Motorista insere a propria viagem pendente',
    'Exigir video para inserir viagem pendente'
  )
order by tablename, policyname;
