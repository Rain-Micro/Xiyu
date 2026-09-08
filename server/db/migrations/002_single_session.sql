-- 002 · 单会话互斥：登录时刷新 last_token_iat（毫秒），鉴权时校验 token 签发时间，
-- 早于该值（留 60s 时钟容差）的旧 token 一律 401 —— 新登录踢旧会话。
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_token_iat BIGINT;
