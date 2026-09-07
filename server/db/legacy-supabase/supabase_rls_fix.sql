-- ============================================================
-- Supabase RLS 策略修复
-- 执行位置：Supabase Dashboard → SQL Editor → New Query
-- 说明：本应用使用自定义认证（非 Supabase Auth），
--       所有操作通过 anon key 执行，需要为 anon 角色配置 RLS 策略
-- ============================================================

-- ── characters 表 ──────────────────────────────────────────

-- 方案一（推荐）：禁用 RLS（最简单，适用于自定义认证场景）
ALTER TABLE characters DISABLE ROW LEVEL SECURITY;

-- 方案二：为 anon 角色添加完整 RLS 策略（更安全）
-- 如果选择方案二，请注释掉上面的 DISABLE 语句，取消注释以下语句：

-- CREATE POLICY IF NOT EXISTS "允许 anon 插入角色" ON characters
--   FOR INSERT TO anon WITH CHECK (true);
--
-- CREATE POLICY IF NOT EXISTS "允许 anon 查询角色" ON characters
--   FOR SELECT TO anon USING (true);
--
-- CREATE POLICY IF NOT EXISTS "允许 anon 更新角色" ON characters
--   FOR UPDATE TO anon USING (true) WITH CHECK (true);
--
-- CREATE POLICY IF NOT EXISTS "允许 anon 删除角色" ON characters
--   FOR DELETE TO anon USING (true);


-- ── users 表（如已有策略可跳过）──────────────────────────────

-- 同样禁用 users 表的 RLS（确保登录/注册/更新操作正常）
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
