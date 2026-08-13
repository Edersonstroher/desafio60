-- =====================================================================
-- DESAFIO 60 — SEED
-- =====================================================================
-- IMPORTANTE: este seed NÃO cria usuários de autenticação. O Supabase
-- Auth cria os usuários (e o profile correspondente, via trigger) no
-- momento em que cada pessoa se cadastra pela tela de cadastro.html.
--
-- Ordem de uso:
--   1) Rode schema.sql.
--   2) Rode a PARTE 1 deste arquivo para criar a competição "Desafio
--      Família — 60 Dias" (ainda em DRAFT).
--   3) Peça para Ederson, Patricia e Felipe criarem conta no app
--      normalmente (tela de cadastro), OU crie-os pelo painel
--      Authentication > Users do Supabase Dashboard.
--   4) Depois que existirem, torne-se admin (PARTE 2) e rode a PARTE 3
--      para inscrever cada um pelo e-mail (isso NÃO grava peso/altura
--      automaticamente — cada participante define sua altura no
--      próprio perfil e registra o peso inicial na primeira pesagem,
--      que é congelada automaticamente pelo trigger do schema).
--   5) Ative a competição (PARTE 4) quando todos estiverem prontos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PARTE 1 — Cria a competição inicial (idempotente pelo nome)
-- ---------------------------------------------------------------------
do $$
declare
  v_admin_id uuid;
begin
  -- usa o primeiro usuário já cadastrado como criador provisório;
  -- troque para o id do admin real se souber (veja PARTE 2)
  select id into v_admin_id from public.profiles order by created_at asc limit 1;

  if v_admin_id is not null and not exists (
    select 1 from public.competitions where nome = 'Desafio Família — 60 Dias'
  ) then
    insert into public.competitions (
      nome, descricao, data_inicio, data_fim, duracao_dias,
      valor_inscricao, max_participantes, status, criado_por, regras
    ) values (
      'Desafio Família — 60 Dias',
      'Competição de evolução de peso entre a família — 60 dias, vence quem tiver maior percentual de perda.',
      date '2026-08-12',
      date '2026-08-12' + interval '59 days',
      60,
      0,
      10,
      'DRAFT',
      v_admin_id,
      'Vitória por maior percentual de perda de peso (média móvel de 7 pesagens). Desempate: kg perdidos, consistência, sequência.'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- PARTE 2 — Promover um usuário a administrador
-- Rode manualmente, trocando o e-mail:
-- ---------------------------------------------------------------------
-- update public.profiles set is_admin = true where email = 'seu-email@exemplo.com';

-- ---------------------------------------------------------------------
-- PARTE 3 — Inscrever participantes na competição pelo e-mail
-- Rode manualmente para cada pessoa, DEPOIS que ela já tiver criado
-- conta (o profile é criado automaticamente pelo trigger de Auth):
-- ---------------------------------------------------------------------
-- insert into public.competition_members (competition_id, user_id, status)
-- select c.id, p.id, 'INVITED'
-- from public.competitions c, public.profiles p
-- where c.nome = 'Desafio Família — 60 Dias'
--   and p.email = 'ederson@exemplo.com'
-- on conflict (competition_id, user_id) do nothing;
--
-- (repita trocando o e-mail para patricia@... e felipe@...)

-- ---------------------------------------------------------------------
-- PARTE 4 — Ativar a competição quando todos estiverem inscritos
-- ---------------------------------------------------------------------
-- update public.competitions set status = 'ACTIVE'
-- where nome = 'Desafio Família — 60 Dias';
