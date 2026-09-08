// src/services/charactersAPI.ts — 角色数据 REST 封装（userId 由 JWT 携带，参数保留仅为兼容旧调用点）
import type { Character } from '@/types'
import { api } from './apiClient'

/** 获取当前用户自定义角色列表 */
export async function getCharacters(_userId?: string): Promise<Character[]> {
  const res = await api<{ characters: Character[] }>({ path: '/api/characters' })
  return res.characters || []
}

/** 创建/更新自定义角色；内置助手则同步其用户自定义字段 */
export async function createCharacterAPI(character: Character, _userId?: string): Promise<void> {
  if (character.isAssistant) {
    await api({
      method: 'PATCH',
      path: `/api/characters/assistants/${encodeURIComponent(character.id)}`,
      body: {
        relationship: character.assistantEditable?.relationship ?? null,
        userTitle: character.assistantEditable?.userTitle ?? null,
        userNote: character.assistantEditable?.userNote ?? null,
        isPinned: character.isPinned ?? false,
      },
    })
    return
  }
  await api({
    method: 'POST',
    path: '/api/characters',
    body: { character },
  })
}

/** 更新角色 */
export async function updateCharacterAPI(character: Character): Promise<void> {
  if (character.isAssistant) {
    await api({
      method: 'PATCH',
      path: `/api/characters/assistants/${encodeURIComponent(character.id)}`,
      body: {
        relationship: character.assistantEditable?.relationship ?? null,
        userTitle: character.assistantEditable?.userTitle ?? null,
        userNote: character.assistantEditable?.userNote ?? null,
        isPinned: character.isPinned ?? false,
      },
    })
    return
  }
  await api({
    method: 'PATCH',
    path: `/api/characters/${encodeURIComponent(character.id)}`,
    body: { character },
  })
}

/** 删除角色（自定义表与内置表各试一次，哪个存在删哪个） */
export async function deleteCharacterAPI(id: string): Promise<void> {
  const results = await Promise.allSettled([
    api({ method: 'DELETE', path: `/api/characters/${encodeURIComponent(id)}` }),
    api({ method: 'DELETE', path: `/api/characters/assistants/${encodeURIComponent(id)}` }),
  ])
  if (results.every((r) => r.status === 'rejected')) {
    console.warn('[CharactersAPI] 删除完成（两张表均未找到该角色）')
  } else {
    console.log(`[CharactersAPI] 已删除角色 ${id}`)
  }
}
