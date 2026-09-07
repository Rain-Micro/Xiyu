/**
 * 文件解析工具
 * 支持: .txt / .json / .doc / .docx / .png / .jpg / .jpeg
 */
import mammoth from 'mammoth'
import { createWorker, type Worker } from 'tesseract.js'

export interface ParsedTextResult {
  text: string
  /** 文件来源名 */
  fileName: string
}

/**
 * 字段匹配映射定义
 */
export interface FieldMapping {
  keys: string[]
  field: string
  isTag?: boolean
  label: string
}

/**
 * 判断文件是否为图片类型
 */
export function isImageFile(file: File): boolean {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  return (
    type.startsWith('image/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  )
}

/**
 * 判断文件是否为 Word 文档
 */
export function isWordFile(file: File): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return (
    name.endsWith('.doc') ||
    name.endsWith('.docx') ||
    type === 'application/msword' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

/**
 * 判断文件是否为文本类
 */
export function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.txt') || name.endsWith('.json') || name.endsWith('.csv')
}

/**
 * 读取文本类文件内容
 */
async function readTextFile(file: File): Promise<string> {
  return await file.text()
}

/**
 * 解析 Word 文档（.docx），mammoth 主要支持 .docx
 * 对于 .doc 格式，尝试以二进制方式读取，效果可能有限
 */
async function readWordFile(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value || ''
  } catch (err) {
    // 兜底：尝试以纯文本方式读取
    console.warn('mammoth 解析失败，尝试文本读取:', err)
    return await file.text()
  }
}

/**
 * 使用 Tesseract.js 对图片进行 OCR 文字识别
 */
async function readImageFile(file: File): Promise<string> {
  let worker: Worker | null = null
  try {
    worker = await createWorker(['chi_sim', 'eng'])
    const {
      data: { text },
    } = await worker.recognize(file)
    return text || ''
  } catch (err) {
    console.error('OCR 识别失败:', err)
    return ''
  } finally {
    if (worker) {
      try {
        await worker.terminate()
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 统一入口：根据文件类型解析文本内容
 * @param onOcrStart 可选回调，OCR 开始时触发（用于展示 loading）
 * @param onOcrEnd 可选回调，OCR 结束时触发
 */
export async function parseFileToText(
  file: File,
  onOcrStart?: () => void,
  onOcrEnd?: () => void
): Promise<ParsedTextResult> {
  let text = ''

  if (isImageFile(file)) {
    onOcrStart?.()
    try {
      text = await readImageFile(file)
    } finally {
      onOcrEnd?.()
    }
  } else if (isWordFile(file)) {
    text = await readWordFile(file)
  } else {
    // 默认按文本处理
    text = await readTextFile(file)
  }

  return { text, fileName: file.name }
}

// ─── 字段映射表（供外部复用）────────────────────────────────────────────────

export const fieldMappings: FieldMapping[] = [
  {
    keys: ['角色姓名', '姓名', '名字', '称呼', '昵称', '名称', 'name'],
    field: 'name',
    label: '角色姓名',
  },
  {
    keys: ['年纪', '年龄', '岁数', '几岁', '多大', 'age'],
    field: 'age',
    label: '年纪',
  },
  {
    keys: ['生日', '出生日期', '出生日', '诞辰', 'birthday'],
    field: 'birthday',
    label: '生日',
  },
  {
    keys: ['性别', '男女', 'gender'],
    field: 'gender',
    label: '性别',
  },
  {
    keys: ['关系', '身份', '与用户的关系', '角色与用户的关系', 'relationship'],
    field: 'relationship',
    label: '角色与用户的关系',
  },
  {
    keys: ['自定义关系', 'relationshipCustom'],
    field: 'relationshipCustom',
    label: '自定义关系',
  },
  {
    keys: ['对用户的称呼', '叫我', '怎么称呼', '用户称呼', 'userTitle'],
    field: 'userTitle',
    label: '对用户的称呼',
  },
  {
    keys: ['备注', '备注信息', '补充说明', '其他', '用户对角色的备注', 'userNote'],
    field: 'userNote',
    label: '用户对角色的备注',
  },
  {
    keys: ['纪念日', '相遇日', '重要日子', '重要纪念日', 'anniversary'],
    field: 'anniversary',
    label: '与角色的重要纪念日',
  },
  {
    keys: ['喜欢的食物', '喜欢食物', '爱吃', '最喜欢的食物', '最爱吃', 'likedFoods'],
    field: 'likedFoods',
    isTag: true,
    label: '角色喜欢的食物',
  },
  {
    keys: ['不喜欢的食物', '不喜欢食物', '忌口', '不爱吃', '讨厌食物', '不吃', '忌讳', '不能吃', 'dislikedFoods'],
    field: 'dislikedFoods',
    isTag: true,
    label: '角色不喜欢的食物/忌口',
  },
  {
    keys: ['兴趣爱好', '兴趣', '爱好', '喜欢做什么', '平时喜欢', 'hobbies'],
    field: 'hobbies',
    isTag: true,
    label: '角色的兴趣爱好',
  },
  {
    keys: ['讨厌的事', '讨厌', '厌恶', '不喜欢的事', 'dislikedThings'],
    field: 'dislikedThings',
    isTag: true,
    label: '角色讨厌的事',
  },
  {
    keys: ['性格', '特点', '个性', '特质', 'personalityTraits'],
    field: 'personalityTraits',
    isTag: true,
    label: '角色的性格',
  },
  {
    keys: ['会说的话', '口头禅', '常说的话', '喜欢说', 'characterSayings'],
    field: 'characterSayings',
    isTag: true,
    label: '角色会说的话',
  },
  {
    keys: ['开场白', '初次见面', '打招呼', '第一句', 'greeting'],
    field: 'greeting',
    label: '开场白',
  },
  {
    keys: ['用户不喜欢的事', '用户不喜欢', '用户讨厌', '用户忌讳', 'userDislikes'],
    field: 'userDislikes',
    isTag: true,
    label: '用户特别不喜欢的事',
  },
  {
    keys: ['OOC', '崩皮', '不符合角色', '不要做', '禁止', '不要出现的行为', 'oocBehaviors'],
    field: 'oocBehaviors',
    isTag: true,
    label: '希望角色不要出现OOC的行为',
  },
]

/**
 * 获取字段标签
 */
export function getFieldLabel(field: string): string {
  const mapping = fieldMappings.find((m) => m.field === field)
  return mapping?.label || field
}

/**
 * 尝试将文本内容解析为角色表单字段
 * 支持两种形式：
 * 1. JSON 字符串：直接尝试 JSON.parse
 * 2. 普通文本：按 "字段名: 值" 或 "字段名：值" 的行进行匹配
 */
export function parseTextToCharacterFields(
  text: string
): { data: Record<string, unknown>; unmatched: string } {
  const trimmed = text.trim()
  if (!trimmed) {
    return { data: {}, unmatched: '' }
  }

  // 尝试 JSON 解析
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      return { data: parsed, unmatched: '' }
    } catch {
      // 不是合法 JSON，继续按文本处理
    }
  }

  const data: Record<string, unknown> = {}
  const unmatchedLines: string[] = []
  const lines = trimmed.split(/\r?\n/)

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // 匹配 "字段名: 值" 或 "字段名：值"
    const match = trimmedLine.match(/^([^:：]+)[:：](.+)$/)
    if (!match) {
      unmatchedLines.push(trimmedLine)
      continue
    }

    const key = match[1].trim()
    const value = match[2].trim()

    let matched = false
    for (const mapping of fieldMappings) {
      if (mapping.keys.some((k) => key.includes(k))) {
        if (mapping.isTag) {
          // 标签字段：按逗号、顿号、分号、换行分割
          const tags = value
            .split(/[,，、；;]/)
            .map((t) => t.trim())
            .filter(Boolean)
          const existing = (data[mapping.field] as string[]) || []
          data[mapping.field] = [...existing, ...tags]
        } else {
          data[mapping.field] = value
        }
        matched = true
        break
      }
    }

    if (!matched) {
      unmatchedLines.push(trimmedLine)
    }
  }

  return {
    data,
    unmatched: unmatchedLines.join('\n'),
  }
}
