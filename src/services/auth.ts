import { supabase } from './supabase'

// 用户登录
export async function loginUser(identifier: string, password: string) {
  // 先用手机号查询，再用邮箱查询
  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', identifier)
    .maybeSingle()

  if (error || !user) {
    const { data: emailUser, error: emailError } = await supabase
      .from('users')
      .select('*')
      .eq('email', identifier)
      .maybeSingle()
    
    if (emailError || !emailUser) {
      return { error: '账号不存在' }
    }
    user = emailUser
  }

  // 验证密码（简单比对，后续升级为bcrypt）
  if (user.password_hash !== password) {
    return { error: '密码错误' }
  }

  // 获取用户的助手列表
  const { data: characters, error: charError } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', user.id)

  if (charError) {
    return { error: '获取助手列表失败' }
  }

  // 生成临时token（后续升级为JWT）
  const token = `user_${user.id}_${Date.now()}`

  // 在localStorage中保存用户信息，模拟会话管理
  const userData = {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    token: token
  }

  return { 
    user: userData, 
    characters: characters || [],
    token 
  }
}

// 用户注册
export async function registerUser(email: string, phone: string, nickname: string, password: string) {
  // 检查邮箱是否已注册
  if (email) {
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    
    if (existingEmail) {
      return { error: '邮箱已被注册' }
    }
  }

  // 检查手机号是否已注册
  if (phone) {
    const { data: existingPhone } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()
    
    if (existingPhone) {
      return { error: '手机号已被注册' }
    }
  }

  // 创建新用户
  const { data: newUser, error: insertError } = await supabase
    .from('users')
    .insert({
      email: email || null,
      phone: phone || null,
      nickname: nickname,
      password_hash: password, // 后续升级为bcrypt
    })
    .select()
    .single()

  if (insertError) {
    return { error: '注册失败: ' + insertError.message }
  }

  // 为新用户创建五位内置助手
  const assistantNames = ['琉', '飒', '澈', '熠', '汐']
  const assistantIds = ['liu', 'sa', 'che', 'yi', 'xi']

  const assistantsData = assistantNames.map((name, index) => ({
    user_id: newUser.id,
    name: name,
    type: 'builtin_assistant',
    assistant_id: assistantIds[index],
    relationship: '朋友',
    user_title: '你',
    user_note: '',
    is_pinned: false
  }))

  const { error: assistantError } = await supabase
    .from('characters')
    .insert(assistantsData)

  if (assistantError) {
    return { error: '创建助手失败: ' + assistantError.message }
  }

  return { 
    user: {
      id: newUser.id,
      nickname: newUser.nickname,
      email: newUser.email,
      phone: newUser.phone
    },
    success: true 
  }
}

// 获取用户的所有角色（包括助手）
export async function getUserCharacters(userId: string) {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', userId)
    .order('is_pinned', { ascending: false })
    .order('name')

  if (error) {
    return { error: error.message }
  }
  return { characters: data || [] }
}

// 退出登录
export function logoutUser() {
  // 简单清除本地存储
  localStorage.removeItem('user')
}