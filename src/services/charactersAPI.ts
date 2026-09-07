// src/services/charactersAPI.ts
import type { Character } from '@/types'
import { supabaseAdmin } from './supabase'

export async function getCharacters(userId: string): Promise<Character[]> {
  const { data, error } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createCharacterAPI(character: Character, userId: string): Promise<void> {
  if (character.isAssistant) {
    // 内置助手 → characters 表（不含 data 列）
    const { error } = await supabaseAdmin
      .from('characters')
      .insert({
        id: character.id,
        user_id: userId,
        name: character.profile?.name || character.name || '未知角色',
        type: 'builtin_assistant',
        assistant_id: character.assistantId || null,
        relationship: character.assistantEditable?.relationship || null,
        user_title: character.assistantEditable?.userTitle || null,
        user_note: character.assistantEditable?.userNote || null,
        is_pinned: character.isPinned || false,
        created_at: new Date(character.createdAt || Date.now()).toISOString(),
      })
    if (error) throw error
  } else {
    // 自定义角色 → user_characters 表（先查是否存在，避免 409 重复插入）
    const { data: existing } = await supabaseAdmin
      .from('user_characters')
      .select('id')
      .eq('id', character.id)
      .maybeSingle()

    if (existing) {
      // 已存在 → 更新
      const { error } = await supabaseAdmin
        .from('user_characters')
        .update({ data: character, user_id: userId })
        .eq('id', character.id)
      if (error) {
        console.warn('[CharactersAPI] user_characters 更新失败:', error.message)
      }
    } else {
      // 不存在 → 插入
      const { error } = await supabaseAdmin
        .from('user_characters')
        .insert({
          id: character.id,
          user_id: userId,
          data: character,
          created_at: character.createdAt || Date.now(),
        })
      if (error) {
        console.warn('[CharactersAPI] user_characters 插入失败:', error.message)
        const { error: fallbackError } = await supabaseAdmin
          .from('characters')
          .insert({
            id: character.id,
            user_id: userId,
            name: character.profile?.name || '未知角色',
            type: 'custom',
            is_pinned: character.isPinned || false,
            created_at: new Date(character.createdAt || Date.now()).toISOString(),
          })
        if (fallbackError) throw fallbackError
      }
    }
  }
}

export async function updateCharacterAPI(character: Character): Promise<void> {
  if (character.isAssistant) {
    // 内置助手 → 更新 characters 表
    const { error } = await supabaseAdmin
      .from('characters')
      .update({
        name: character.profile?.name || character.name || '未知角色',
        relationship: character.assistantEditable?.relationship || null,
        user_title: character.assistantEditable?.userTitle || null,
        user_note: character.assistantEditable?.userNote || null,
        is_pinned: character.isPinned || false,
      })
      .eq('id', character.id)
    if (error) throw error
  } else {
    // 自定义角色 → 优先 user_characters 表，失败则回退到 characters 表
    const { error } = await supabaseAdmin
      .from('user_characters')
      .update({
        name: character.profile?.name || '未知角色',
        data: character,
      })
      .eq('id', character.id)
    if (error) {
      console.warn('[CharactersAPI] user_characters 更新失败，回退到 characters 表:', error.message)
      const { error: fallbackError } = await supabaseAdmin
        .from('characters')
        .update({
          name: character.profile?.name || '未知角色',
          is_pinned: character.isPinned || false,
        })
        .eq('id', character.id)
      if (fallbackError) throw fallbackError
    }
  }
}

export async function deleteCharacterAPI(id: string): Promise<void> {
  // 同时从两个表删除（角色可能存在于其中一个）
  const [charResult, ucResult] = await Promise.all([
    supabaseAdmin.from('characters').delete().eq('id', id),
    supabaseAdmin.from('user_characters').delete().eq('id', id),
  ])

  if (charResult.error && ucResult.error) {
    console.warn('[CharactersAPI] 删除完成（characters 和 user_characters 表均未找到该角色）')
  } else {
    console.log(`[CharactersAPI] 已删除角色 ${id}`)
  }
}
