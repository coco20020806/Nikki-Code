import type { VercelRequest, VercelResponse } from '@vercel/node'
import COS from 'cos-nodejs-sdk-v5'

function normalizeExt(raw: string): string {
  let ext = (raw ?? '').trim().toLowerCase()
  if (!ext.startsWith('.')) ext = `.${ext}`
  if (!/^\.[a-z0-9]{1,8}$/i.test(ext)) return '.jpg'
  return ext
}

function buildPublicUrl(bucket: string, region: string, key: string): string {
  const encodedKey = key.split('/').map((seg) => encodeURIComponent(seg)).join('/')
  return `https://${bucket}.cos.${region}.myqcloud.com/${encodedKey}`
}

/** cos-nodejs-sdk-v5 通过 getObjectUrl + Method PUT 生成预签名上传 URL */
function getPresignedUrl(
  cos: COS,
  bucket: string,
  region: string,
  key: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
        Method: 'PUT',
        Sign: true,
        Expires: 900,
      },
      (err, data) => {
        if (err) reject(err)
        else resolve(data.Url)
      },
    )
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      ext?: string
      suffix?: string
    }
    const ext = normalizeExt(body.ext ?? body.suffix ?? '.jpg')

    const secretId = (process.env.TENCENT_COS_SECRET_ID || '').trim()
    const secretKey = (process.env.TENCENT_COS_SECRET_KEY || '').trim()
    const bucket = (process.env.TENCENT_COS_BUCKET || '').trim()
    const region = (process.env.TENCENT_COS_REGION || '').trim()

    if (!secretId || !secretKey || !bucket || !region) {
      return res.status(500).json({ error: 'COS 服务端环境变量未配置完整' })
    }

    const key = `feedings/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`

    const cos = new COS({
      SecretId: secretId,
      SecretKey: secretKey,
    })

    const uploadUrl = await getPresignedUrl(cos, bucket, region, key)
    const publicUrl = buildPublicUrl(bucket, region, key)

    return res.status(200).json({ uploadUrl, publicUrl })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '签发失败'
    console.error('[get-cos-sign]', e)
    return res.status(500).json({ error: message })
  }
}
