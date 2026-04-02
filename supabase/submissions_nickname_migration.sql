-- 明信片投稿昵称（可选）。请在 Supabase SQL Editor 中执行。
-- 空值时前端展示为「热心玩家」。

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS nickname text;

COMMENT ON COLUMN public.submissions.nickname IS '投喂明信片昵称，可为空';
