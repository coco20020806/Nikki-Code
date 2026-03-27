-- 到期推送提醒：在 Supabase SQL Editor 执行（若表已存在可分段执行）

-- 1) 订阅表增加偏好：提前多少小时提醒（与前端选项一致：1 / 6 / 12 / 24）
alter table public.push_subscriptions
  add column if not exists reminder_hours integer not null default 24;

-- 2) 防重复：每个 endpoint + 兑换码 + 类型 只发一次（与 codes.id 对应）
create table if not exists public.sent_notifications (
  id bigint generated always as identity primary key,
  endpoint text not null,
  code_id bigint not null,
  kind text not null default 'expiry_reminder',
  sent_at timestamptz not null default now(),
  unique (endpoint, code_id, kind)
);

-- 可选：与 codes 表关联（若执行报错可注释掉下面两行）
-- alter table public.sent_notifications
--   add constraint sent_notifications_code_id_fkey foreign key (code_id) references public.codes (id) on delete cascade;

alter table public.sent_notifications enable row level security;
