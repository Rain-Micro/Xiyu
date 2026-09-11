/**
 * 格式化日期字符串为 年/月/日 格式
 * @param dateStr 日期字符串（如 "2026-08-12" 或 ISO 格式）或时间戳
 * @returns 格式化后的日期字符串，未设置时返回 "未设置"
 */
export function formatDate(dateStr: string | number | undefined | null): string {
  if (dateStr === undefined || dateStr === null) return '未设置'
  if (typeof dateStr === 'string' && !dateStr.trim()) return '未设置'
  if (typeof dateStr === 'string') {
    const lower = dateStr.trim().toLowerCase()
    if (lower === 'yyyy/mm/日' || lower === 'yyyy/mm/dd' || lower === 'yyyy-mm-dd' || lower === 'yyyy年mm月dd日' || lower === 'yyyy/mm/dc' || lower.startsWith('yyyy/')) {
      return '未设置'
    }
  }
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '未设置'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

/**
 * 校验日期字符串是否为有效日期（非空、非占位符、可解析）
 * @param dateStr 日期字符串
 * @returns true 表示是有效日期，false 表示无效
 */
export function isValidDate(dateStr: string | undefined | null): boolean {
  if (!dateStr || (typeof dateStr === 'string' && !dateStr.trim())) return false
  if (typeof dateStr === 'string') {
    const lower = dateStr.trim().toLowerCase()
    if (lower === 'yyyy/mm/日' || lower === 'yyyy/mm/dd' || lower === 'yyyy-mm-dd' || lower === 'yyyy年mm月dd日' || lower === 'yyyy/mm/dc' || lower.startsWith('yyyy/')) {
      return false
    }
  }
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

/**
 * 清理日期值：如果无效则返回 undefined，有效则返回原值
 * @param dateStr 日期字符串
 * @returns 有效的日期字符串或 undefined
 */
export function sanitizeDate(dateStr: string | undefined | null): string | undefined {
  return isValidDate(dateStr) ? (dateStr as string) : undefined
}
