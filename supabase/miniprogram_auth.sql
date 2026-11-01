-- NikkiCode 微信小程序：静默登录会话与跨设备兑换记录
-- 在 Supabase SQL Editor 中执行一次。

create extension if not exists pgcrypto;

create table if not exists public.mini_users (
  id uuid primary key default gen_random_uuid(),
  openid_hash text not null unique,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table if not exists public.mini_sessions (
  token_hash text primary key,
  user_id uuid not null references public.mini_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists mini_sessions_user_id_idx on public.mini_sessions(user_id);
create index if not exists mini_sessions_expires_at_idx on public.mini_sessions(expires_at);

create table if not exists public.mini_claimed_codes (
  user_id uuid not null references public.mini_users(id) on delete cascade,
  code_id bigint not null references public.codes(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (user_id, code_id)
);

create index if not exists mini_claimed_codes_code_id_idx on public.mini_claimed_codes(code_id);

alter table public.mini_users enable row level security;
alter table public.mini_sessions enable row level security;
alter table public.mini_claimed_codes enable row level security;

-- 不创建 anon/authenticated 策略：这些表只允许 Vercel 服务端通过 service role 访问。


