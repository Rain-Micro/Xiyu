-- 栖屿数字人平台 · 权威数据库 schema（001 初始版）
-- 约定：云端 PostgreSQL 为唯一权威源；密码仅存 bcrypt 哈希；时间统一 TIMESTAMPTZ。
-- 角色客服复用 messages 表：character_id='customer-service'，内容前缀协议 [客服] / __CLOSED__: 由应用层维护。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ 用户 ============
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             TEXT UNIQUE,
  email             TEXT UNIQUE,
  nickname          TEXT NOT NULL,
  password_hash     TEXT NOT NULL,                -- bcrypt，禁止明文
  avatar_url        TEXT,                          -- 迁移期存相对路径；指向 server 静态文件端点
  birthday          DATE,
  is_new_user       BOOLEAN NOT NULL DEFAULT TRUE,
  pending_deletion  BOOLEAN NOT NULL DEFAULT FALSE,
  pending_deletion_at TIMESTAMPTZ,
  role              TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ 内置助手 / 简版角色 ============
CREATE TABLE IF NOT EXISTS characters (
  id                TEXT PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'builtin_assistant' CHECK (type IN ('builtin_assistant','custom')),
  assistant_id      TEXT,                          -- liu/sa/che/yi/xi
  relationship      TEXT,
  user_title        TEXT,
  user_note         TEXT,
  is_pinned         BOOLEAN NOT NULL DEFAULT FALSE,
  personality_traits TEXT,
  tone              TEXT,
  background        TEXT,
  character_sayings TEXT,
  greeting          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);

-- ============ 自定义角色（完整 Character 对象存 data JSONB） ============
CREATE TABLE IF NOT EXISTS user_characters (
  id                TEXT PRIMARY KEY,              -- 客户端生成 uuid
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data              JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_characters_user ON user_characters(user_id);

-- ============ 消息（含客服会话） ============
CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id      TEXT NOT NULL,                 -- 角色id 或 'customer-service'
  role              TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_user_char_time ON messages(user_id, character_id, created_at);

-- ============ 收藏 ============
CREATE TABLE IF NOT EXISTS favorites (
  id                TEXT PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data              JSONB NOT NULL,
  is_pinned         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

-- ============ 验证码（落库替代进程内存 Map，修复重启丢失） ============
CREATE TABLE IF NOT EXISTS verification_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             TEXT NOT NULL,
  code_hash         TEXT NOT NULL,                 -- sha256，不存明文
  expires_at        TIMESTAMPTZ NOT NULL,
  used              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verification_codes_phone ON verification_codes(phone, expires_at);
