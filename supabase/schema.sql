-- =====================================================================
-- DESAFIO 60 — SCHEMA SUPABASE / POSTGRESQL
-- Plataforma reutilizável de competições de evolução de peso
-- =====================================================================
-- Como usar: cole este arquivo inteiro no SQL Editor do seu projeto
-- Supabase (https://app.supabase.com/project/_/sql) e execute.
-- Idempotente: pode rodar mais de uma vez sem quebrar (usa IF NOT EXISTS
-- e DROP ... IF EXISTS antes de recriar views/functions).
-- =====================================================================

-- ---------------------------------------------------------------------
-- EXTENSÕES
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. PROFILES — perfil do usuário (1:1 com auth.users)
-- =====================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  apelido       text,
  email         text not null,
  avatar_url    text,
  altura_cm     numeric(5,1) check (altura_cm is null or (altura_cm > 50 and altura_cm < 260)),
  is_admin      boolean not null default false,
  modo_provocacao boolean not null default true,
  tema          text not null default 'dark' check (tema in ('dark','light')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Perfil do usuário. Peso NÃO fica aqui — pertence à inscrição na competição (competition_members).';

-- Cria o profile automaticamente quando um usuário se cadastra no Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 2. COMPETITIONS
-- =====================================================================
create table if not exists public.competitions (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  descricao           text,
  data_inicio         date not null,
  data_fim            date not null,
  duracao_dias        integer not null default 60 check (duracao_dias > 0),
  valor_inscricao     numeric(10,2) not null default 0,
  max_participantes   integer,
  status              text not null default 'DRAFT'
                        check (status in ('DRAFT','WAITING','ACTIVE','FINISHED','CANCELLED')),
  criado_por          uuid not null references public.profiles(id),
  codigo_convite      text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  regras              text,
  janela_inicio       time not null default '04:00',
  janela_fim          time not null default '10:00',
  consistencia_minima_pct numeric(5,2) not null default 80,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint data_fim_apos_inicio check (data_fim > data_inicio)
);

create index if not exists idx_competitions_status on public.competitions(status);
create index if not exists idx_competitions_codigo on public.competitions(codigo_convite);

-- =====================================================================
-- 3. COMPETITION_MEMBERS — inscrição de um usuário em uma competição
-- =====================================================================
create table if not exists public.competition_members (
  id                uuid primary key default gen_random_uuid(),
  competition_id    uuid not null references public.competitions(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  peso_inicial_kg   numeric(6,2) check (peso_inicial_kg is null or (peso_inicial_kg > 20 and peso_inicial_kg < 400)),
  peso_inicial_congelado boolean not null default false,
  data_entrada      timestamptz not null default now(),
  elegivel_premio   boolean not null default true,
  status            text not null default 'INVITED'
                       check (status in ('INVITED','ACTIVE','ELIMINATED','FINISHED','WITHDRAWN')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (competition_id, user_id)
);

create index if not exists idx_members_competition on public.competition_members(competition_id);
create index if not exists idx_members_user on public.competition_members(user_id);

-- =====================================================================
-- 4. WEIGH_INS — pesagens
-- =====================================================================
create table if not exists public.weigh_ins (
  id                       uuid primary key default gen_random_uuid(),
  competition_member_id    uuid not null references public.competition_members(id) on delete cascade,
  peso_kg                  numeric(6,2) not null check (peso_kg > 20 and peso_kg < 400),
  data_pesagem             date not null default current_date,
  hora_pesagem             time not null default current_time,
  dentro_da_janela         boolean,
  observacao               text,
  variacao_confirmada      boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (competition_member_id, data_pesagem)
);

create index if not exists idx_weighins_member on public.weigh_ins(competition_member_id);
create index if not exists idx_weighins_data on public.weigh_ins(data_pesagem);

-- Congela o peso_inicial da inscrição na primeira pesagem válida após o início
create or replace function public.freeze_initial_weight()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_member record;
begin
  select * into v_member from public.competition_members where id = new.competition_member_id;

  if v_member.peso_inicial_congelado = false then
    update public.competition_members
      set peso_inicial_kg = new.peso_kg,
          peso_inicial_congelado = true,
          status = case when status = 'INVITED' then 'ACTIVE' else status end,
          updated_at = now()
      where id = v_member.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_weighin_freeze_initial on public.weigh_ins;
create trigger on_weighin_freeze_initial
  before insert on public.weigh_ins
  for each row execute function public.freeze_initial_weight();

-- Marca automaticamente se a pesagem caiu dentro da janela recomendada da competição
create or replace function public.mark_weighin_window()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_comp record;
begin
  select c.* into v_comp
  from public.competitions c
  join public.competition_members m on m.competition_id = c.id
  where m.id = new.competition_member_id;

  if v_comp.id is not null then
    new.dentro_da_janela := (new.hora_pesagem >= v_comp.janela_inicio and new.hora_pesagem <= v_comp.janela_fim);
  end if;

  return new;
end;
$$;

drop trigger if exists on_weighin_window on public.weigh_ins;
create trigger on_weighin_window
  before insert on public.weigh_ins
  for each row execute function public.mark_weighin_window();

-- =====================================================================
-- 5. AUDIT_LOGS
-- =====================================================================
create table if not exists public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id),
  competition_id uuid references public.competitions(id),
  action         text not null,
  table_name     text not null,
  record_id      uuid,
  old_value      jsonb,
  new_value      jsonb,
  reason         text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_audit_competition on public.audit_logs(competition_id);

-- =====================================================================
-- 5.5 PUSH_SUBSCRIPTIONS — inscrições de notificação push do navegador
-- =====================================================================
alter table public.profiles add column if not exists horario_lembrete time not null default '08:00';
alter table public.profiles add column if not exists lembrete_ativo boolean not null default true;

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

-- =====================================================================
-- FONTE ÚNICA DE CÁLCULO — functions e views
-- Nenhuma fórmula deve existir duplicada no frontend.
-- =====================================================================

-- Média móvel das últimas até 7 pesagens válidas de uma inscrição, numa data de referência
drop function if exists public.fn_moving_avg_7(uuid, date);
create or replace function public.fn_moving_avg_7(p_member_id uuid, p_ref_date date default current_date)
returns numeric
language sql stable
as $$
  select round(avg(peso_kg)::numeric, 2)
  from (
    select peso_kg
    from public.weigh_ins
    where competition_member_id = p_member_id
      and data_pesagem <= p_ref_date
    order by data_pesagem desc
    limit 7
  ) ultimas;
$$;

-- Estatísticas completas de uma inscrição (usado no dashboard e no ranking).
-- SECURITY DEFINER de propósito: retorna só números agregados (média, %,
-- consistência), nunca as pesagens em si — por isso é seguro qualquer
-- membro da competição chamar essa função para ver o desempenho dos
-- colegas (necessário para o ranking funcionar), mesmo sem ter permissão
-- de SELECT direto na tabela weigh_ins de outra pessoa.
drop function if exists public.fn_member_stats(uuid);
create or replace function public.fn_member_stats(p_member_id uuid)
returns table (
  competition_member_id uuid,
  peso_inicial_kg numeric,
  peso_atual_kg numeric,
  media_movel_7 numeric,
  kg_perdidos numeric,
  percentual_perdido numeric,
  dias_com_pesagem integer,
  dias_decorridos integer,
  consistencia_pct numeric,
  sequencia_atual integer,
  melhor_sequencia integer,
  total_pesagens integer,
  ultima_pesagem_data date
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_member record;
  v_comp record;
begin
  select * into v_member from public.competition_members where id = p_member_id;
  select * into v_comp from public.competitions where id = v_member.competition_id;

  return query
  with dias as (
    select distinct data_pesagem
    from public.weigh_ins
    where weigh_ins.competition_member_id = p_member_id
    order by data_pesagem
  ),
  seq as (
    select data_pesagem,
           data_pesagem - (row_number() over (order by data_pesagem))::int as grp
    from dias
  ),
  sequencias as (
    select grp, count(*) as tamanho, max(data_pesagem) as fim
    from seq
    group by grp
  )
  select
    p_member_id,
    v_member.peso_inicial_kg,
    (select peso_kg from public.weigh_ins where weigh_ins.competition_member_id = p_member_id order by data_pesagem desc limit 1) as peso_atual_kg,
    public.fn_moving_avg_7(p_member_id, least(current_date, v_comp.data_fim)) as media_movel_7,
    round(coalesce(v_member.peso_inicial_kg,0) - coalesce(public.fn_moving_avg_7(p_member_id, least(current_date, v_comp.data_fim)),coalesce(v_member.peso_inicial_kg,0)), 2) as kg_perdidos,
    case when coalesce(v_member.peso_inicial_kg,0) > 0 then
      round(((v_member.peso_inicial_kg - public.fn_moving_avg_7(p_member_id, least(current_date, v_comp.data_fim))) / v_member.peso_inicial_kg) * 100, 2)
    else 0 end as percentual_perdido,
    (select count(*)::int from dias) as dias_com_pesagem,
    greatest(1, least(current_date, v_comp.data_fim) - v_comp.data_inicio + 1)::int as dias_decorridos,
    round(
      (select count(*)::numeric from dias) /
      greatest(1, least(current_date, v_comp.data_fim) - v_comp.data_inicio + 1) * 100
    , 2) as consistencia_pct,
    coalesce((select tamanho from sequencias where fim = (select max(data_pesagem) from dias) and fim >= current_date - 1), 0)::int as sequencia_atual,
    coalesce((select max(tamanho) from sequencias), 0)::int as melhor_sequencia,
    (select count(*)::int from public.weigh_ins where weigh_ins.competition_member_id = p_member_id) as total_pesagens,
    (select max(data_pesagem) from public.weigh_ins where weigh_ins.competition_member_id = p_member_id) as ultima_pesagem_data;
end;
$$;

-- View pública de ranking por competição (sem expor email)
drop view if exists public.view_ranking cascade;
create view public.view_ranking as
select
  cm.competition_id,
  p.id as user_id,
  p.nome,
  p.apelido,
  p.avatar_url,
  cm.status,
  cm.elegivel_premio,
  s.*
from public.competition_members cm
join public.profiles p on p.id = cm.user_id
cross join lateral public.fn_member_stats(cm.id) s
where cm.status in ('ACTIVE','FINISHED');

-- Ranking oficial ordenado (percentual > kg > consistência > sequência)
drop view if exists public.view_ranking_oficial cascade;
create view public.view_ranking_oficial as
select
  *,
  row_number() over (
    partition by competition_id
    order by percentual_perdido desc, kg_perdidos desc, consistencia_pct desc, melhor_sequencia desc
  ) as posicao
from public.view_ranking;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_members enable row level security;
alter table public.weigh_ins enable row level security;
alter table public.audit_logs enable row level security;
alter table public.push_subscriptions enable row level security;

-- Helper: é admin?
drop function if exists public.is_admin(uuid);
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = p_user_id), false);
$$;

-- Helper: é membro da competição?
drop function if exists public.is_competition_member(uuid, uuid);
create or replace function public.is_competition_member(p_competition_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.competition_members
    where competition_id = p_competition_id and user_id = p_user_id
  );
$$;

-- PROFILES: todo mundo autenticado vê perfis (nome/avatar públicos); só o dono edita o próprio
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and is_admin is not distinct from (select is_admin from public.profiles where id = auth.uid()));

-- COMPETITIONS: participante vê competições em que está inscrito; admin vê e gerencia tudo
drop policy if exists "competitions_select_member_or_admin" on public.competitions;
create policy "competitions_select_member_or_admin" on public.competitions
  for select using (
    public.is_admin() or public.is_competition_member(id) or status in ('WAITING','ACTIVE')
  );

drop policy if exists "competitions_insert_admin" on public.competitions;
create policy "competitions_insert_admin" on public.competitions
  for insert with check (public.is_admin());

drop policy if exists "competitions_update_admin" on public.competitions;
create policy "competitions_update_admin" on public.competitions
  for update using (public.is_admin());

-- COMPETITION_MEMBERS: usuário vê sua própria inscrição e as dos colegas da mesma competição (para ranking); só admin insere/edita status/peso
drop policy if exists "members_select_same_competition" on public.competition_members;
create policy "members_select_same_competition" on public.competition_members
  for select using (
    public.is_admin() or user_id = auth.uid() or public.is_competition_member(competition_id)
  );

drop policy if exists "members_insert_admin_or_self_invite" on public.competition_members;
create policy "members_insert_admin_or_self_invite" on public.competition_members
  for insert with check (public.is_admin() or user_id = auth.uid());

drop policy if exists "members_update_admin_only" on public.competition_members;
create policy "members_update_admin_only" on public.competition_members
  for update using (public.is_admin());
  -- Participante NÃO pode alterar peso_inicial_kg nem status: só update via admin/backend.

-- WEIGH_INS: usuário só vê/insere as próprias; ninguém deleta; ninguém edita (imutável, correções vão por audit_logs + admin)
drop policy if exists "weighins_select_own_or_admin" on public.weigh_ins;
create policy "weighins_select_own_or_admin" on public.weigh_ins
  for select using (
    public.is_admin()
    or exists (select 1 from public.competition_members cm where cm.id = competition_member_id and cm.user_id = auth.uid())
  );

drop policy if exists "weighins_insert_own" on public.weigh_ins;
create policy "weighins_insert_own" on public.weigh_ins
  for insert with check (
    exists (select 1 from public.competition_members cm where cm.id = competition_member_id and cm.user_id = auth.uid())
  );

drop policy if exists "weighins_update_admin_only" on public.weigh_ins;
create policy "weighins_update_admin_only" on public.weigh_ins
  for update using (public.is_admin());
  -- Nenhuma policy de DELETE é criada -> ninguém deleta pesagem, nem admin (correção é feita por UPDATE + audit log).

-- AUDIT_LOGS: só admin lê; inserção só via função security definer (chamada pelo admin)
drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin" on public.audit_logs
  for select using (public.is_admin());

drop policy if exists "audit_insert_admin" on public.audit_logs;
create policy "audit_insert_admin" on public.audit_logs
  for insert with check (public.is_admin());

-- PUSH_SUBSCRIPTIONS: cada usuário só vê/gerencia a própria inscrição.
-- Não existe policy de SELECT para outros usuários — a Edge Function de
-- envio de lembretes usa a service_role key, que ignora RLS por padrão.
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- =====================================================================
-- FUNÇÃO ADMIN: corrigir pesagem com auditoria obrigatória
-- =====================================================================
drop function if exists public.admin_correct_weighin(uuid, numeric, text);
create or replace function public.admin_correct_weighin(p_weighin_id uuid, p_novo_peso numeric, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old record;
  v_comp_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem corrigir pesagens';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'É obrigatório informar o motivo da correção';
  end if;

  select w.*, cm.competition_id into v_old
  from public.weigh_ins w
  join public.competition_members cm on cm.id = w.competition_member_id
  where w.id = p_weighin_id;

  update public.weigh_ins set peso_kg = p_novo_peso, updated_at = now() where id = p_weighin_id;

  insert into public.audit_logs (user_id, competition_id, action, table_name, record_id, old_value, new_value, reason)
  values (auth.uid(), v_old.competition_id, 'CORRECT_WEIGHIN', 'weigh_ins', p_weighin_id,
          jsonb_build_object('peso_kg', v_old.peso_kg), jsonb_build_object('peso_kg', p_novo_peso), p_motivo);
end;
$$;

-- =====================================================================
-- FIM DO SCHEMA
-- =====================================================================
