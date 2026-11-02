import Taro from '@tarojs/taro'

import type { NikkiCode } from '@/types/code'

const API_BASE_URL = 'https://www.nikkigift.top'
const TOKEN_KEY = 'nikki_mini_session_v2'

type ApiEnvelope<T> = T & { error?: string }

function sessionToken(): string {
  return Taro.getStorageSync<string>(TOKEN_KEY) || ''
}

async function request<T>(options: Taro.request.Option): Promise<T> {
  const token = sessionToken()
  const method = options.method || 'GET'
  const data = token && method !== 'GET'
    ? { ...((options.data || {}) as Record<string, unknown>), sessionToken: token }
    : options.data
  const response = await Taro.request<ApiEnvelope<T>>({
    ...options,
    data,
    url: `${API_BASE_URL}${options.url}`,
    header: {
      'content-type': 'application/json',
      ...(token ? { 'x-mini-session': token } : {}),
      ...(options.header || {}),
    },
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401) {
      Taro.removeStorageSync(TOKEN_KEY)
    }
    throw new Error(response.data?.error || `请求失败（${response.statusCode}）`)
  }
  return response.data
}

export async function ensureMiniSession(): Promise<void> {
  if (sessionToken()) return
  const login = await Taro.login()
  if (!login.code) throw new Error('微信登录失败')
  const payload = await request<{ token: string; expiresAt: string }>({
    url: '/api/mini/login',
    method: 'POST',
    data: { code: login.code },
  })
  Taro.setStorageSync(TOKEN_KEY, payload.token)
}

export async function listCodes(): Promise<NikkiCode[]> {
  const payload = await request<{ codes: NikkiCode[] }>({ url: '/api/mini/codes', method: 'GET' })
  return payload.codes
}

export async function listClaimedCodeIds(): Promise<number[]> {
  const payload = await request<{ claimedCodeIds: number[] }>({
    url: '/api/mini/claimed-codes',
    method: 'POST',
    data: { action: 'list' },
  })
  return payload.claimedCodeIds
}

export async function setCodeClaimed(codeId: number, claimed: boolean): Promise<void> {
  await request<{ ok: true }>({
    url: '/api/mini/claimed-codes',
    method: 'POST',
    data: { action: claimed ? 'claim' : 'unclaim', codeId },
  })
}

