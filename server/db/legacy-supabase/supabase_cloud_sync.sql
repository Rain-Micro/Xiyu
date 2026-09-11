-- 收藏功能 + 角色数据 云端同步建表 SQL
-- 在 Supabase SQL Editor 中执行

-- 1. 收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE
);

-- 确保已有表补齐缺失列（防止 CREATE TABLE IF NOT EXISTS 跳过）
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS created_at BIGINT;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_is_pinned ON favorites(is_pinned);

ALTER TABLE favorites ROW LEVEL SECURITY DISABLE;

-- 2. 用户角色表（与现有 characters 表分离，存储完整角色数据）
CREATE TABLE IF NOT EXISTS user_characters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

ALTER TABLE user_characters ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE user_characters ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE user_characters ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE user_characters ADD COLUMN IF NOT EXISTS created_at BIGINT;

CREATE INDEX IF NOT EXISTS idx_user_characters_user_id ON user_characters(user_id);

ALTER TABLE user_characters ROW LEVEL SECURITY DISABLE;
