# 🏆 Desafio 60

PWA de competições de evolução de peso (perda percentual), com Supabase como fonte única da verdade. Reutilizável para múltiplas competições, grupos e participantes — não é feito sob medida para as três primeiras pessoas.

Stack: HTML5 + CSS3 + JavaScript ES6 puro (sem bundler), Supabase (Auth + Postgres + RLS), Chart.js. Hospedagem estática (Netlify).

---

## 1. Criar o projeto Supabase

Este projeto já assume que você tem (ou vai usar) o projeto Supabase em:

```
https://fmdyucwcayfsuyecyyfd.supabase.co
```

Se for começar um projeto novo: acesse [app.supabase.com](https://app.supabase.com), crie um projeto, e anote a **Project URL** e a **anon public key** em *Project Settings → API*.

## 2. Executar o schema

1. Abra **SQL Editor** no painel do Supabase.
2. Cole o conteúdo de `supabase/schema.sql` e execute.

Isso cria as 5 tabelas (`profiles`, `competitions`, `competition_members`, `weigh_ins`, `audit_logs`), triggers, functions de cálculo (média móvel, estatísticas, ranking), views e todas as políticas de RLS.

## 3. Executar o seed

1. Abra `supabase/seed.sql`.
2. Rode a **PARTE 1** para criar a competição inicial "Desafio Família — 60 Dias" (em rascunho).
3. Peça para os participantes criarem conta pelo app normalmente (tela de cadastro) — isso cria o `profile` automaticamente.
4. Rode a **PARTE 2** para tornar seu usuário administrador.
5. Rode a **PARTE 3** (uma vez por participante) para inscrevê-los na competição pelo e-mail.
6. Rode a **PARTE 4**, ou use o painel `/admin.html`, para ativar a competição.

> O seed nunca inventa IDs de usuários do Supabase Auth — os participantes precisam existir de fato antes de serem inscritos.

## 4. Configurar as variáveis

Edite `js/config.js` e cole sua **anon public key**:

```js
export const SUPABASE_URL = 'https://fmdyucwcayfsuyecyyfd.supabase.co';
export const SUPABASE_ANON_KEY = 'cole_aqui_sua_anon_key';
```

Veja `.env.example` para referência. Nunca coloque a `service_role key` em nenhum arquivo do frontend.

## 5. Rodar localmente

Como o projeto usa ES Modules (`import`/`export`), você precisa servir os arquivos por HTTP (não abrir o `index.html` direto com `file://`):

```bash
cd desafio60
python3 -m http.server 8080
# ou: npx serve .
```

Acesse `http://localhost:8080`.

## 6. Publicar no Netlify

1. Suba a pasta `desafio60/` para um repositório Git (GitHub/GitLab).
2. No Netlify: **Add new site → Import an existing project**.
3. Build command: (nenhum — é um site estático). Publish directory: `desafio60` (ou a raiz, se o repo só tiver esse projeto).
4. Deploy.

Não há servidor Node necessário em produção.

## 7. Conectar domínio

No Netlify: **Site settings → Domain management → Add custom domain**, siga as instruções de DNS (CNAME ou registros A fornecidos pela Netlify).

## 8. Instalar no celular

Duas formas:

**Pelo próprio app** (mais fácil): entre em **Perfil → 📲 Instalar app na tela inicial**. No Android/Chrome isso abre o instalador nativo direto. No iPhone/Safari, o app não pode acionar instalação automática (limitação da Apple), então ele mostra a instrução: toque no botão de compartilhar (□↑) e depois em **"Adicionar à Tela de Início"**.

**Manual, direto pelo navegador:**
- **Android (Chrome)**: menu ⋮ → "Adicionar à tela inicial" ou "Instalar app".
- **iPhone (Safari)**: botão de compartilhar (□↑) → "Adicionar à Tela de Início". *(Precisa ser pelo Safari — Chrome no iPhone não tem essa opção.)*

O `manifest.json` e o `sw.js` já deixam o app instalável e com abertura rápida (cache do app shell).

## 9. Criar administrador

Depois que a pessoa já tiver criado conta (tela de cadastro), rode no SQL Editor do Supabase:

```sql
update public.profiles set is_admin = true where email = 'email-do-admin@exemplo.com';
```

O administrador acessa o painel em `/admin.html`.

## 10. Adicionar participantes

Duas formas:

- **Pelo painel admin** (`admin.html`): campo "Adicionar participante por e-mail" dentro da competição selecionada (a pessoa precisa já ter criado conta).
- **Por convite**: gere/compartilhe o `codigo_convite` da competição (visível no admin) — o participante acessa `join.html?codigo=SEUCODIGO`, vê o preview da competição e entra sozinho.

---

## Estrutura de pastas

```
/desafio60
  index.html            → roteador (login vs dashboard)
  login.html / cadastro.html
  dashboard.html         → tela principal (posição, stats, distância pro líder, badges)
  pesagem.html           → registrar peso (ação principal do app)
  ranking.html           → ranking oficial + secundários + gráfico comparativo
  perfil.html            → dados pessoais, IMC, histórico, gráfico de evolução
  competicao.html        → "minhas competições"
  regras.html             → regras do desafio explicadas (fórmula, consistência, desempate)
  join.html              → entrar via código de convite
  admin.html             → painel administrativo
  /css                   → style.css (design system), responsive.css, components.css
  /js
    app.js               → tema, toasts, offline, service worker
    config.js             → URL e anon key do Supabase
    supabase.js           → client único
    calculations.js       → validação/formatação (NÃO recalcula ranking — isso é só no banco)
    achievements.js / notifications.js
    /services             → camada de acesso a dados (auth, competition, weighin, ranking, admin)
  /supabase
    schema.sql             → tabelas, triggers, functions, views, RLS
    seed.sql                → competição inicial + instruções de inscrição
  manifest.json / sw.js    → PWA
```

## Onde vive cada cálculo

Toda a matemática da competição (média móvel de 7 pesagens, percentual perdido, kg perdidos, consistência, sequência, ranking) é calculada **uma única vez, no Postgres**, através de:

- `fn_moving_avg_7(member_id, data)` — média móvel
- `fn_member_stats(member_id)` — estatísticas completas de uma inscrição
- `view_ranking_oficial` — ranking já ordenado por percentual > kg > consistência > sequência

O frontend só lê esses resultados; nenhuma fórmula de ranking está duplicada em JavaScript.

## Regras importantes já implementadas

- Peso inicial é **congelado automaticamente** (trigger) na primeira pesagem após a inscrição — o participante não consegue alterá-lo.
- Dias sem pesagem **não** entram na média — nada é preenchido ou repetido automaticamente.
- Pesagens são **imutáveis** para o usuário (sem policy de DELETE/UPDATE); correções só pelo admin via `admin_correct_weighin()`, que grava auditoria obrigatória em `audit_logs`.
- Offline: pesagens ficam em fila local (`localStorage`, não crítica) e sincronizam automaticamente ao reconectar — nunca aceitas como definitivas sem gravar no Supabase.
- RLS: participante só altera a própria pesagem/perfil; nunca vê e-mail de outros participantes; nunca acessa `audit_logs`.

## Próximos passos (arquitetura já preparada, não implementado ainda)

Pagamento/PIX, equipes, competições públicas, notificações push, integração WhatsApp, fotos de evolução, medidas corporais, % de gordura, patrocinadores — mantidos fora da v1 propositalmente (ver item 57 do briefing).
