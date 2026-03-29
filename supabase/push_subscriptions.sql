-- 在 Supabase SQL Editor 中执行一次，用于 Web Push 订阅持久化
-- 表名：push_subscriptions

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  reminder_hours integer not null default 168,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- 匿名（站点访客）可写入/更新自己的订阅；生产环境可按需收紧策略
create policy "push_subscriptions_anon_insert"
  on public.push_subscriptions for insert
  to anon
  with check (true);

create policy "push_subscriptions_anon_update"
  on public.push_subscriptions for update
  to anon
  using (true)
  with check (true);
