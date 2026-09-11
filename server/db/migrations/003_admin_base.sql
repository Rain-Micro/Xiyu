-- 003 · 管理后台基座
-- 1) 用户状态（封禁）；2) 操作审计；3) 应用配置（公告/版本发布/客服邮箱）

ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'banned'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason TEXT;

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action        TEXT NOT NULL,          -- 如 user.ban / user.reset_password / config.update
  target_type   TEXT,                   -- user / config / ...
  target_id     TEXT,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,          -- announcement / latest_version / download_url / notify_email
  value      JSONB NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
