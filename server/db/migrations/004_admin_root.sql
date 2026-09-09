-- 004 · 账号名登录支持 + 内置管理员保护
-- users 增加 username（唯一），供 +00Root 这类命名账号登录；注册暂不开放 username。
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
