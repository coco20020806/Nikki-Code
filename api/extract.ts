import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'

type ExtractInput = {
  text?: string
  image?: string
}

const SYSTEM_PROMPT = `
你是一个“兑换码信息提取器”。
请从输入文本或截图中提取所有兑换码信息，并且只返回一个 JSON 数组，不要输出任何解释文字。

输出 JSON 结构必须是数组：
[
  {
    "gameName": "无限暖暖 | 闪耀暖暖 | 其他",
    "codeText": "兑换码",
    "diamondReward": "钻石数量或描述，没有则空字符串",
    "otherReward": "其他奖励描述，没有则空字符串",
    "expiryAt": "ISO8601时间字符串，没有则空字符串",
    "source": "信息来源，没有则空字符串"
  }
]

规则：
1) 不确定时给空字符串，不要编造。
2) 只返回合法 JSON。
3) 如果识别到多个兑换码，数组里要包含全部。
4) 如果没有识别到任何兑换码，返回空数组 []。
`

function extractJson(raw: string): string {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return trimmed
  }

  const matchArray = trimmed.match(/\[[\s\S]*\]/)
  if (matchArray) return matchArray[0]

  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('模型未返回 JSON')
  return match[0]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

    if (!['development', 'production'].includes(process.env.NODE_ENV ?? '')) {
      return res.status(403).json({ error: 'Environment not allowed' })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' })

    const body = (req.body ?? {}) as ExtractInput
    const text = (body.text ?? '').trim()
    const image = (body.image ?? '').trim()
    if (!text && !image) return res.status(400).json({ error: 'text or image is required' })

    const ai = new GoogleGenAI({ apiKey })

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: SYSTEM_PROMPT }]
    if (text) parts.push({ text: `待提取文本：\n${text}` })
    if (image) {
      const base64 = image.includes(',') ? image.split(',')[1] : image
      parts.push({
        inlineData: {
          // 新版 SDK 要求 inlineData 传纯 base64 字符串，不含 data:image 前缀
          mimeType: 'image/png',
          data: base64,
        },
      })
    }

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts }],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    })

    const raw = result.text ?? ''
    const jsonText = extractJson(raw)
    const parsed = JSON.parse(jsonText)
    const data = Array.isArray(parsed) ? parsed : [parsed]
    return res.status(200).json(data)
  } catch (error) {
    const statusCode = (error as { status?: number; code?: number })?.status ?? (error as { code?: number })?.code
    const message = error instanceof Error ? error.message : 'Extract failed'

    if (statusCode === 429) {
      return res.status(429).json({
        error: 'QUOTA_EXCEEDED',
        message: 'AI 助手需要休息（配额达上限），请一分钟后再试。',
      })
    }

    if (statusCode === 404 || /not found|model/i.test(message)) {
      console.error('[Gemini] MODEL_NOT_FOUND: 请检查模型ID或SDK版本。当前模型: gemini-3-flash-preview', {
        statusCode,
        message,
      })
      return res.status(500).json({
        error: 'MODEL_NOT_FOUND',
        message: 'Gemini 模型不可用，请检查模型名称或稍后重试。',
      })
    }

    console.error('[Gemini] EXTRACT_FAILED', { statusCode, message })
    return res.status(500).json({ error: message })
  }
}
