import './index.css'
import { addCode, deleteCode, listCodes } from '@/lib/codes-api'
import { format } from 'date-fns'

const root = document.getElementById('admin-root')
if (!root) throw new Error('admin root not found')

root.innerHTML = `
  <main style="max-width:840px;margin:40px auto;padding:0 16px;">
    <section class="glass-card" style="padding:24px;border-radius:24px;">
      <h1 style="margin:0 0 8px;font-size:32px;">管理员录入</h1>
      <p style="margin:0 0 20px;color:hsl(var(--muted-foreground));">输入密码后可新增兑换码</p>
      <form id="code-form" style="display:grid;gap:12px;">
        <input name="password" placeholder="管理员密码" class="h-11 w-full rounded-xl border border-input bg-white px-4" type="password" required />
        <select name="gameName" class="h-11 w-full rounded-xl border border-input bg-white px-4">
          <option value="无限暖暖">无限暖暖</option>
          <option value="闪耀暖暖">闪耀暖暖</option>
        </select>
        <input name="codeText" placeholder="兑换码" class="h-11 w-full rounded-xl border border-input bg-white px-4 uppercase" required />
        <input name="diamondReward" placeholder="钻石奖励（可选；留空则低价值）" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <input name="otherReward" placeholder="其他奖励（可选）" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <input name="expiryAt" type="datetime-local" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <input name="source" placeholder="来源（可选）" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <button class="rounded-xl bg-primary text-primary-foreground" style="height:44px;border:none;font-weight:700;cursor:pointer;">保存到 Supabase</button>
      </form>
      <p id="status" style="margin-top:10px;"></p>
    </section>
    <section class="glass-card" style="padding:24px;border-radius:24px;margin-top:20px;">
      <h2 style="margin:0 0 12px;font-size:24px;">最近兑换码</h2>
      <div id="list"></div>
    </section>
  </main>
`

const form = document.getElementById('code-form') as HTMLFormElement
const status = document.getElementById('status') as HTMLParagraphElement
const listWrap = document.getElementById('list') as HTMLDivElement

function diamondSvg() {
  // 简单钻石SVG（避免依赖React组件库）
  return `
    <svg viewBox="0 0 24 24" width="14" height="14" style="display:inline-block;vertical-align:middle;margin-right:6px;">
      <path d="M12 2 2 12l10 10 10-10L12 2Z" fill="hsl(var(--accent))" opacity="0.9"/>
    </svg>
  `
}

async function refreshList() {
  try {
    const rows = await listCodes()
    listWrap.innerHTML = rows
      .slice(0, 20)
      .map(
        (code) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid hsl(var(--border));">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:800;">
              ${code.gameName} - <code>${code.codeText}</code>
            </div>
            <div style="margin-top:6px;font-size:12px;color:hsl(var(--muted-foreground));">
              过期: ${code.expiryAt ? format(new Date(code.expiryAt), 'yyyy-MM-dd HH:mm') : '永久'}
              ${
                code.diamondReward
                  ? ` / ${diamondSvg()}${code.diamondReward} 钻石`
                  : code.otherReward
                    ? ` / ${code.otherReward}`
                    : code.rewardDesc
                      ? ` / ${code.rewardDesc}`
                      : ''
              }
            </div>
          </div>
          <button
            type="button"
            data-action="delete"
            data-id="${code.id}"
            style="flex:0 0 auto;align-self:flex-start;border:1px solid hsl(var(--destructive)/0.35);background:transparent;color:hsl(var(--destructive));border-radius:12px;padding:8px 10px;cursor:pointer;font-weight:700;"
          >
            删除
          </button>
        </div>
      `,
      )
      .join('')
  } catch (err) {
    const msg = err instanceof Error ? err.message : '读取失败'
    listWrap.innerHTML = `<p style="color:#e11d48;">读取失败：${msg}</p>`
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const data = new FormData(form)
  status.textContent = '保存中...'
  status.style.color = 'hsl(var(--muted-foreground))'

  try {
    const diamondReward = String(data.get('diamondReward') ?? '').trim()
    const otherReward = String(data.get('otherReward') ?? '').trim()

    await addCode({
      password: String(data.get('password') ?? ''),
      gameName: String(data.get('gameName') ?? ''),
      codeText: String(data.get('codeText') ?? ''),
      diamondReward: diamondReward || undefined,
      otherReward: otherReward || undefined,
      expiryAt: data.get('expiryAt') ? new Date(String(data.get('expiryAt'))).toISOString() : undefined,
      source: String(data.get('source') ?? ''),
    })
    status.textContent = '保存成功'
    status.style.color = '#15803d'
    form.reset()
    await refreshList()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '保存失败'
    status.textContent = `保存失败：${msg}`
    status.style.color = '#e11d48'
  }
})

listWrap.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement | null
  const btn = target?.closest('button[data-action="delete"]') as HTMLButtonElement | null
  if (!btn) return

  const id = Number(btn.getAttribute('data-id') ?? 0)
  if (!id) return

  const passwordInput = form.querySelector('input[name="password"]') as HTMLInputElement | null
  const password = String(passwordInput?.value ?? '')
  if (!password.trim()) {
    status.textContent = '请输入管理员密码再删除'
    status.style.color = '#e11d48'
    return
  }

  if (!confirm('确认删除该兑换码吗？（会标记为无效）')) return

  status.textContent = '删除中...'
  status.style.color = 'hsl(var(--muted-foreground))'

  try {
    await deleteCode(id, password)
    status.textContent = '删除成功'
    status.style.color = '#15803d'
    await refreshList()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '删除失败'
    status.textContent = `删除失败：${msg}`
    status.style.color = '#e11d48'
  }
})

void refreshList()
