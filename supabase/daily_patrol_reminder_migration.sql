-- 每日巡逻模式：推送偏好改为 24 / 72 / 168（1天 / 3天 / 7天），默认 7 天
-- 在 Supabase SQL Editor 执行一次

-- 1) 订阅表：默认值 168；把旧版 1/6/12/24 规范到新档位
alter table public.push_subscriptions
  alter column reminder_hours set default 168;

update public.push_subscriptions
set reminder_hours = case
  when reminder_hours in (24, 72, 168) then reminder_hours
  when reminder_hours in (1, 6, 12) then 24
  else 168
end;

-- 2) 兑换码：可选「从哪一档开始参与巡逻」（null = 7 天档起，即 168）
alter table public.codes
  add column if not exists reminder_hours integer null;

alter table public.codes
  drop constraint if exists codes_reminder_patrol_allowed;

alter table public.codes
  add constraint codes_reminder_patrol_allowed
  check (reminder_hours is null or reminder_hours in (24, 72, 168));

-- 3) 已发送记录：存储档位小时数（与 kind 中 expiry_reminder_${h} 一致）
alter table public.sent_notifications
  add column if not exists reminder_hours integer null;
