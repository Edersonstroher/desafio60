// =====================================================================
// CONFIG — valores públicos do Supabase.
// A anon key é segura para o navegador: ela só funciona através das
// regras de RLS definidas no schema.sql. NUNCA coloque a service_role
// key aqui nem em nenhum arquivo do frontend.
// =====================================================================

export const SUPABASE_URL = 'https://fmdyucwcayfsuyecyyfd.supabase.co';

// Troque pelo valor real em Project Settings > API > anon public.
// Se preferir não versionar, gere este arquivo a partir de env vars
// no seu processo de build/deploy (veja .env.example e README.md).
export const SUPABASE_ANON_KEY = 'sb_publishable_P4TadqYqCAc07oZ8qlrnQg_7Oxtsfqv';

export const APP_NAME = 'DESAFIO 60';
export const DEFAULT_COMPETITION_DURATION_DAYS = 60;
