import './index.css'
import { addCode, deleteCode, listCodes, listSubmissions, setSubmissionFeatured, setSubmissionRead, verifyAdminPassword } from '@/lib/codes-api'
import { format } from 'date-fns'

const ADMIN_PASSWORD_KEY = 'admin_password'

const root = document.getElementById('admin-root')
if (!root) throw new Error('admin root not found')

root.innerHTML = `
  <main style="max-width:840px;margin:40px auto;padding:0 16px;">
    <section class="glass-card" style="position:sticky;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:20;padding:14px 18px;border-radius:16px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div id="auth-status-wrap" style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:13px;color:hsl(var(--muted-foreground));">权限状态：</span>
          <strong id="auth-status" style="font-size:13px;color:hsl(var(--muted-foreground));">未验证 🔒</strong>
        </div>
        <div id="auth-actions" style="display:flex;align-items:center;gap:8px;">
          <input id="header-password" placeholder="管理员密码" style="height:34px;border:1px solid hsl(var(--input));border-radius:10px;padding:0 10px;background:#fff;font-size:12px;" type="password" />
          <button id="header-verify-btn" type="button" style="height:34px;padding:0 12px;border:none;border-radius:10px;background:hsl(var(--primary));color:white;font-weight:700;cursor:pointer;font-size:12px;">验证</button>
          <button id="reset-password-btn" type="button" style="display:none;border:0;background:transparent;color:hsl(var(--foreground));text-decoration:underline;cursor:pointer;font-size:12px;">退出/重置密码</button>
        </div>
      </div>
    </section>
    <section class="glass-card" style="padding:24px;border-radius:24px;">
      <h1 style="margin:0 0 8px;font-size:32px;">管理员录入</h1>
      <p style="margin:0 0 20px;color:hsl(var(--muted-foreground));">输入密码后可新增兑换码</p>
      <div style="margin-bottom:14px;padding:14px;border:1px solid hsl(var(--border));border-radius:16px;background:rgba(255,255,255,0.75);">
        <h2 style="margin:0 0 8px;font-size:18px;">AI 助手</h2>
        <p style="margin:0 0 8px;font-size:12px;color:hsl(var(--muted-foreground));">粘贴文本或拖入截图，自动提取兑换码信息。</p>
        <textarea id="ai-text" placeholder="把公告文本粘贴到这里..." style="width:100%;min-height:90px;border:1px solid hsl(var(--input));border-radius:12px;padding:10px;background:#fff;resize:vertical;"></textarea>
        <div id="ai-dropzone" style="margin-top:8px;padding:12px;border:1px dashed hsl(var(--border));border-radius:12px;background:rgba(255,255,255,0.8);font-size:12px;color:hsl(var(--muted-foreground));">
          拖入截图到这里，或选择图片
          <input id="ai-image" type="file" accept="image/*" style="display:block;margin-top:8px;font-size:12px;" />
        </div>
        <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <p id="ai-status" style="margin:0;font-size:12px;color:hsl(var(--muted-foreground));"></p>
          <button id="ai-extract-btn" type="button" style="height:36px;padding:0 14px;border:none;border-radius:10px;background:hsl(var(--primary));color:white;font-weight:700;cursor:pointer;">识别</button>
        </div>
      </div>
      <div style="margin-bottom:14px;padding:14px;border:1px solid hsl(var(--border));border-radius:16px;background:rgba(255,255,255,0.75);">
        <h2 style="margin:0 0 8px;font-size:18px;">AI 待验证列表 (Pending Verification)</h2>
        <div id="pending-list"></div>
      </div>
      <form id="code-form" style="display:grid;gap:12px;">
        <select name="gameName" class="h-11 w-full rounded-xl border border-input bg-white px-4">
          <option value="无限暖暖">无限暖暖</option>
          <option value="闪耀暖暖">闪耀暖暖</option>
        </select>
        <input name="codeText" placeholder="兑换码" class="h-11 w-full rounded-xl border border-input bg-white px-4" required />
        <input name="diamondReward" placeholder="钻石奖励（可选；留空则低价值）" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <input name="otherReward" placeholder="其他奖励（可选）" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <input name="expiryAt" type="datetime-local" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <input name="source" placeholder="来源（可选）" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <button class="rounded-xl bg-primary text-primary-foreground" style="height:44px;border:none;font-weight:700;cursor:pointer;">保存到 Supabase</button>
      </form>
      <p id="status" style="margin-top:10px;"></p>
    </section>
    <section class="glass-card" style="padding:24px;border-radius:24px;margin-top:20px;">
      <h2 style="margin:0 0 12px;font-size:24px;">进行中兑换码</h2>
      <div id="list-active"></div>
      <div style="margin-top:14px;border-top:1px solid hsl(var(--border));padding-top:12px;">
        <button id="toggle-expired-btn" type="button" style="display:flex;align-items:center;justify-content:space-between;width:100%;border:1px solid hsl(var(--border));background:#fff;border-radius:12px;padding:10px 12px;font-weight:700;cursor:pointer;">
          <span id="expired-title">查看已过期的兑换码 (0)</span>
          <span id="expired-chevron">▾</span>
        </button>
        <div id="list-expired" style="display:none;margin-top:10px;"></div>
      </div>
    </section>
    <section class="glass-card" style="padding:24px;border-radius:24px;margin-top:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <h2 style="margin:0;font-size:24px;">玩家投稿</h2>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:hsl(var(--muted-foreground));">
          <input id="show-history" type="checkbox" />
          查看历史/已阅投稿
        </label>
      </div>
      <div id="submissions" style="margin-top:12px;"></div>
    </section>
  </main>
`

const form = document.getElementById('code-form') as HTMLFormElement
const status = document.getElementById('status') as HTMLParagraphElement
const listActiveWrap = document.getElementById('list-active') as HTMLDivElement
const listExpiredWrap = document.getElementById('list-expired') as HTMLDivElement
const toggleExpiredBtn = document.getElementById('toggle-expired-btn') as HTMLButtonElement
const expiredTitle = document.getElementById('expired-title') as HTMLSpanElement
const expiredChevron = document.getElementById('expired-chevron') as HTMLSpanElement
const submissionsWrap = document.getElementById('submissions') as HTMLDivElement
const showHistoryInput = document.getElementById('show-history') as HTMLInputElement
const authStatus = document.getElementById('auth-status') as HTMLParagraphElement
const headerPasswordInput = document.getElementById('header-password') as HTMLInputElement
const headerVerifyBtn = document.getElementById('header-verify-btn') as HTMLButtonElement
const resetPasswordBtn = document.getElementById('reset-password-btn') as HTMLButtonElement
const gameNameInput = form.querySelector('select[name="gameName"]') as HTMLSelectElement
const aiTextInput = document.getElementById('ai-text') as HTMLTextAreaElement
const aiImageInput = document.getElementById('ai-image') as HTMLInputElement
const aiDropzone = document.getElementById('ai-dropzone') as HTMLDivElement
const aiExtractBtn = document.getElementById('ai-extract-btn') as HTMLButtonElement
const aiStatus = document.getElementById('ai-status') as HTMLParagraphElement
const pendingListWrap = document.getElementById('pending-list') as HTMLDivElement

let currentPassword = localStorage.getItem(ADMIN_PASSWORD_KEY) ?? ''
let currentImageBase64 = ''
let showExpired = false
let cachedExpiredRows: Awaited<ReturnType<typeof listCodes>> = []
let pendingItems: Array<{
  id: string
  gameName: string
  codeText: string
  diamondReward?: string
  otherReward?: string
  expiryAt?: string
  source?: string
  copied?: boolean
}> = []

function isAuthError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('管理员密码错误')
}

function persistPassword(password: string) {
  const trimmed = password.trim()
  if (!trimmed) return
  currentPassword = trimmed
  localStorage.setItem(ADMIN_PASSWORD_KEY, trimmed)
  renderAuthState()
}

function clearPasswordAndRequireInput(message?: string) {
  currentPassword = ''
  localStorage.removeItem(ADMIN_PASSWORD_KEY)
  renderAuthState()
  if (message) {
    status.textContent = message
    status.style.color = '#e11d48'
  }
}

function getAdminPassword(): string {
  if (currentPassword.trim()) return currentPassword.trim()
  const value = String(headerPasswordInput?.value ?? '').trim()
  return value
}

function renderAuthState() {
  const authed = verifyAdminPassword(currentPassword)
  headerPasswordInput.style.display = authed ? 'none' : 'inline-block'
  headerVerifyBtn.style.display = authed ? 'none' : 'inline-block'
  resetPasswordBtn.style.display = authed ? 'inline-block' : 'none'
  authStatus.textContent = authed ? '已验证 ✅' : '未验证 🔒'
  authStatus.style.color = authed ? '#15803d' : 'hsl(var(--muted-foreground))'
  headerPasswordInput.value = currentPassword
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function renderPendingList() {
  if (!pendingItems.length) {
    pendingListWrap.innerHTML = `<p style="margin:0;font-size:12px;color:hsl(var(--muted-foreground));">暂无待验证结果。点击“识别”后会出现在这里。</p>`
    return
  }

  pendingListWrap.innerHTML = pendingItems
    .map(
      (item) => `
      <div style="padding:12px;border:1px solid hsl(var(--border));border-radius:12px;background:white;margin-top:8px;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:start;">
          <div style="font-weight:800;">${item.gameName || '未知游戏'}</div>
          <div style="font-size:11px;color:hsl(var(--muted-foreground));">${item.expiryAt ? format(new Date(item.expiryAt), 'yyyy-MM-dd HH:mm') : '无过期时间'}</div>
        </div>
        <div style="margin-top:6px;font-family:ui-monospace,Consolas,monospace;font-weight:700;">${item.codeText || '(未识别到兑换码)'}</div>
        <div style="margin-top:6px;font-size:12px;color:hsl(var(--muted-foreground));">钻石：${item.diamondReward || '无'} / 其他：${item.otherReward || '无'}</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" data-action="copy-pending" data-id="${item.id}" style="border:1px solid hsl(var(--border));background:#fff;border-radius:10px;padding:6px 10px;cursor:pointer;">${item.copied ? '已复制 ✅' : '一键复制'}</button>
          <button type="button" data-action="approve-pending" data-id="${item.id}" style="border:0;background:hsl(var(--primary));color:white;border-radius:10px;padding:6px 10px;cursor:pointer;font-weight:700;">一键上线</button>
          <button type="button" data-action="discard-pending" data-id="${item.id}" style="border:1px solid hsl(var(--destructive)/0.4);background:#fff;color:hsl(var(--destructive));border-radius:10px;padding:6px 10px;cursor:pointer;">删除</button>
        </div>
      </div>
    `,
    )
    .join('')
}

function diamondSvg() {
  return `
    <svg viewBox="0 0 24 24" width="14" height="14" style="display:inline-block;vertical-align:middle;margin-right:6px;">
      <path d="M12 2 2 12l10 10 10-10L12 2Z" fill="hsl(var(--accent))" opacity="0.9"/>
    </svg>
  `
}

async function refreshList() {
  try {
    const rows = await listCodes()
    const now = Date.now()
    const activeRows = rows.filter((code) => !(code.expiryAt && new Date(code.expiryAt).getTime() < now))
    cachedExpiredRows = rows.filter((code) => code.expiryAt && new Date(code.expiryAt).getTime() < now)

    expiredTitle.textContent = `查看已过期的兑换码 (${cachedExpiredRows.length})`

    listActiveWrap.innerHTML = activeRows
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
    if (!activeRows.length) {
      listActiveWrap.innerHTML = `<p style="color:hsl(var(--muted-foreground));font-size:12px;">暂无进行中的兑换码。</p>`
    }

    if (showExpired) renderExpiredList()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '读取失败'
    listActiveWrap.innerHTML = `<p style="color:#e11d48;">读取失败：${msg}</p>`
  }
}

function renderExpiredList() {
  if (!cachedExpiredRows.length) {
    listExpiredWrap.innerHTML = `<p style="color:hsl(var(--muted-foreground));font-size:12px;">暂无已过期兑换码。</p>`
    return
  }
  listExpiredWrap.innerHTML = cachedExpiredRows
    .map(
      (code) => `
      <div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid hsl(var(--border));opacity:0.5;">
        <div style="min-width:0;flex:1;">
          <div style="font-weight:800;">${code.gameName} - <code>${code.codeText}</code></div>
          <div style="margin-top:6px;font-size:12px;color:hsl(var(--muted-foreground));">
            已过期：${code.expiryAt ? format(new Date(code.expiryAt), 'yyyy-MM-dd HH:mm') : '未知'} / ${code.diamondReward ? `${diamondSvg()}${code.diamondReward} 钻石` : code.otherReward || code.rewardDesc || ''}
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
}

async function refreshSubmissions() {
  const password = getAdminPassword()
  if (!password.trim()) {
    submissionsWrap.innerHTML = `<p style="color:hsl(var(--muted-foreground));font-size:12px;">输入管理员密码后可查看投稿。</p>`
    return
  }
  try {
    const rows = await listSubmissions(password, showHistoryInput.checked)
    if (!rows.length) {
      submissionsWrap.innerHTML = `<p style="color:hsl(var(--muted-foreground));font-size:12px;">暂无投稿。</p>`
      return
    }
    submissionsWrap.innerHTML = rows
      .map(
        (item) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid hsl(var(--border));opacity:${item.isRead ? '0.55' : '1'};">
          <div style="min-width:0;flex:1;">
            ${
              item.type === 'image' && item.imageUrl
                ? `<a href="${item.imageUrl}" target="_blank" rel="noreferrer"><img src="${item.imageUrl}" alt="投稿图片" style="width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid hsl(var(--border));" /></a>`
                : `<div style="font-size:13px;line-height:1.6;text-decoration:${item.isRead ? 'line-through' : 'none'};">${item.content}</div>`
            }
            <div style="margin-top:6px;font-size:11px;color:hsl(var(--muted-foreground));">
              ${format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm')} / ${item.type === 'image' ? '图片投稿' : '文字投稿'}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
            <button
              type="button"
              data-action="toggle-read"
              data-id="${item.id}"
              data-is-read="${item.isRead ? '1' : '0'}"
              style="flex:0 0 auto;align-self:flex-start;border:1px solid hsl(var(--border));background:white;color:hsl(var(--foreground));border-radius:12px;padding:8px 10px;cursor:pointer;font-weight:700;"
            >
              ${item.isRead ? '取消已阅' : '已阅'}
            </button>
            ${
              item.type === 'image'
                ? `<button
                    type="button"
                    data-action="toggle-featured"
                    data-id="${item.id}"
                    data-is-featured="${item.isFeatured ? '1' : '0'}"
                    style="flex:0 0 auto;align-self:flex-start;border:1px solid hsl(var(--accent)/0.45);background:${item.isFeatured ? 'hsl(var(--accent)/0.2)' : 'white'};color:hsl(var(--foreground));border-radius:12px;padding:8px 10px;cursor:pointer;font-weight:700;"
                  >
                    ${item.isFeatured ? '取消精选' : '精选展示'}
                  </button>`
                : ''
            }
          </div>
        </div>
      `,
      )
      .join('')
    persistPassword(password)
  } catch (err) {
    if (isAuthError(err)) {
      clearPasswordAndRequireInput('密码失效，请重新输入管理员密码')
      submissionsWrap.innerHTML = `<p style="color:#e11d48;">密码失效，请重新输入。</p>`
      return
    }
    const msg = err instanceof Error ? err.message : '读取失败'
    submissionsWrap.innerHTML = `<p style="color:#e11d48;">读取失败：${msg}</p>`
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
      password: getAdminPassword(),
      gameName: String(data.get('gameName') ?? ''),
      // 直接获取输入值，不再强制转换大小写
      codeText: String(data.get('codeText') ?? '').trim(),
      diamondReward: diamondReward || undefined,
      otherReward: otherReward || undefined,
      expiryAt: data.get('expiryAt') ? new Date(String(data.get('expiryAt'))).toISOString() : undefined,
      source: String(data.get('source') ?? ''),
    })
    status.textContent = '保存成功'
    status.style.color = '#15803d'
    persistPassword(getAdminPassword())
    form.reset()
    await refreshList()
    await refreshSubmissions()
  } catch (err) {
    if (isAuthError(err)) {
      clearPasswordAndRequireInput('密码错误，请重新输入管理员密码')
      return
    }
    const msg = err instanceof Error ? err.message : '保存失败'
    status.textContent = `保存失败：${msg}`
    status.style.color = '#e11d48'
  }
})

const handleDeleteClick = async (btn: HTMLButtonElement) => {
  const id = Number(btn.getAttribute('data-id') ?? 0)
  if (!id) return

  const password = getAdminPassword()
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
    persistPassword(password)
    await refreshList()
    await refreshSubmissions()
  } catch (err) {
    if (isAuthError(err)) {
      clearPasswordAndRequireInput('密码错误，请重新输入管理员密码')
      return
    }
    const msg = err instanceof Error ? err.message : '删除失败'
    status.textContent = `删除失败：${msg}`
    status.style.color = '#e11d48'
  }
}

listActiveWrap.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement | null
  const btn = target?.closest('button[data-action="delete"]') as HTMLButtonElement | null
  if (!btn) return
  await handleDeleteClick(btn)
})

listExpiredWrap.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement | null
  const btn = target?.closest('button[data-action="delete"]') as HTMLButtonElement | null
  if (!btn) return
  await handleDeleteClick(btn)
})

submissionsWrap.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement | null
  const btn = target?.closest('button[data-action]') as HTMLButtonElement | null
  if (!btn) return
  const action = btn.getAttribute('data-action')
  const id = Number(btn.getAttribute('data-id') ?? 0)
  if (!id) return

  const password = getAdminPassword()
  if (!password.trim()) {
    status.textContent = '请输入管理员密码后操作投稿'
    status.style.color = '#e11d48'
    return
  }

  if (action === 'toggle-read') {
    const isRead = btn.getAttribute('data-is-read') === '1'
    status.textContent = isRead ? '取消已阅中...' : '标记已阅中...'
    status.style.color = 'hsl(var(--muted-foreground))'
    try {
      await setSubmissionRead(password, id, !isRead)
      status.textContent = isRead ? '已恢复为未读' : '已标记为已阅'
      status.style.color = '#15803d'
      persistPassword(password)
      await refreshSubmissions()
    } catch (err) {
      if (isAuthError(err)) {
        clearPasswordAndRequireInput('密码错误，请重新输入管理员密码')
        return
      }
      const msg = err instanceof Error ? err.message : '更新失败'
      status.textContent = `投稿操作失败：${msg}`
      status.style.color = '#e11d48'
    }
    return
  }

  if (action === 'toggle-featured') {
    const isFeatured = btn.getAttribute('data-is-featured') === '1'
    status.textContent = isFeatured ? '取消精选中...' : '设置精选中...'
    status.style.color = 'hsl(var(--muted-foreground))'
    try {
      await setSubmissionFeatured(password, id, !isFeatured)
      status.textContent = isFeatured ? '已取消精选' : '已设置为精选展示'
      status.style.color = '#15803d'
      persistPassword(password)
      await refreshSubmissions()
    } catch (err) {
      if (isAuthError(err)) {
        clearPasswordAndRequireInput('密码错误，请重新输入管理员密码')
        return
      }
      const msg = err instanceof Error ? err.message : '更新失败'
      status.textContent = `精选操作失败：${msg}`
      status.style.color = '#e11d48'
    }
  }
})

showHistoryInput.addEventListener('change', () => {
  void refreshSubmissions()
})

form.addEventListener('input', () => {
  void refreshSubmissions()
})

headerVerifyBtn.addEventListener('click', () => {
  const pwd = String(headerPasswordInput.value ?? '').trim()
  if (!verifyAdminPassword(pwd)) {
    clearPasswordAndRequireInput('密码错误，请重新输入管理员密码')
    return
  }
  persistPassword(pwd)
  status.textContent = '验证成功'
  status.style.color = '#15803d'
  void refreshSubmissions()
})

resetPasswordBtn.addEventListener('click', () => {
  clearPasswordAndRequireInput()
  window.location.reload()
})

toggleExpiredBtn.addEventListener('click', () => {
  showExpired = !showExpired
  listExpiredWrap.style.display = showExpired ? 'block' : 'none'
  expiredChevron.textContent = showExpired ? '▴' : '▾'
  if (showExpired) renderExpiredList()
})

aiImageInput.addEventListener('change', async () => {
  const file = aiImageInput.files?.[0]
  if (!file) {
    currentImageBase64 = ''
    return
  }
  try {
    currentImageBase64 = await fileToDataUrl(file)
    aiStatus.textContent = '图片已载入，点击“识别”即可'
    aiStatus.style.color = '#15803d'
  } catch (err) {
    currentImageBase64 = ''
    aiStatus.textContent = err instanceof Error ? err.message : '图片读取失败'
    aiStatus.style.color = '#e11d48'
  }
})

aiDropzone.addEventListener('dragover', (e) => {
  e.preventDefault()
  aiDropzone.style.borderColor = 'hsl(var(--primary))'
})

aiDropzone.addEventListener('dragleave', () => {
  aiDropzone.style.borderColor = 'hsl(var(--border))'
})

aiDropzone.addEventListener('drop', async (e) => {
  e.preventDefault()
  aiDropzone.style.borderColor = 'hsl(var(--border))'
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  try {
    currentImageBase64 = await fileToDataUrl(file)
    aiStatus.textContent = '截图已载入，点击“识别”即可'
    aiStatus.style.color = '#15803d'
  } catch (err) {
    currentImageBase64 = ''
    aiStatus.textContent = err instanceof Error ? err.message : '图片读取失败'
    aiStatus.style.color = '#e11d48'
  }
})

aiExtractBtn.addEventListener('click', async () => {
  if (aiExtractBtn.disabled) return
  const text = aiTextInput.value.trim()
  if (!text && !currentImageBase64) {
    aiStatus.textContent = '请先粘贴文本或上传截图'
    aiStatus.style.color = '#e11d48'
    return
  }
  aiExtractBtn.disabled = true
  aiStatus.textContent = '识别中...'
  aiStatus.style.color = 'hsl(var(--muted-foreground))'
  try {
    const resp = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text || undefined,
        image: currentImageBase64 || undefined,
      }),
    })
    const data = (await resp.json()) as
      | Array<{
          gameName?: string
          codeText?: string
          diamondReward?: string
          otherReward?: string
          expiryAt?: string
          source?: string
        }>
      | { error?: string; message?: string }
    if (!resp.ok) {
      const errObj = data as { error?: string; message?: string }
      if (errObj.error === 'QUOTA_EXCEEDED') {
        aiStatus.textContent = 'AI 识图配额已满，请一分钟后重试，或尝试先手动输入。'
        aiStatus.style.color = '#e11d48'
        return
      }
      throw new Error(errObj.message || errObj.error || '识别失败')
    }
    const list = (Array.isArray(data) ? data : []) as Array<{
      error?: string
      gameName?: string
      codeText?: string
      diamondReward?: string
      otherReward?: string
      expiryAt?: string
      source?: string
    }>
    const normalized = list
      .filter((item) => (item.codeText ?? '').trim())
      .map((item, index) => ({
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        gameName: item.gameName || '',
        codeText: item.codeText || '',
        diamondReward: item.diamondReward || '',
        otherReward: item.otherReward || '',
        expiryAt: item.expiryAt || '',
        source: item.source || '',
        copied: false,
      }))

    pendingItems = [...normalized, ...pendingItems]
    renderPendingList()
    aiStatus.textContent = `识别成功，已加入待验证列表（${normalized.length} 条）`
    aiStatus.style.color = '#15803d'
  } catch (err) {
    aiStatus.textContent = err instanceof Error ? err.message : '识别失败'
    aiStatus.style.color = '#e11d48'
  } finally {
    aiExtractBtn.disabled = false
  }
})

pendingListWrap.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement | null
  const btn = target?.closest('button[data-action]') as HTMLButtonElement | null
  if (!btn) return
  const action = btn.getAttribute('data-action')
  const id = btn.getAttribute('data-id') ?? ''
  if (!id) return
  const item = pendingItems.find((x) => x.id === id)
  if (!item) return

  if (action === 'copy-pending') {
    try {
      await navigator.clipboard.writeText(item.codeText || '')
      pendingItems = pendingItems.map((x) => (x.id === id ? { ...x, copied: true } : x))
      renderPendingList()
    } catch {
      status.textContent = '复制失败，请检查浏览器权限'
      status.style.color = '#e11d48'
    }
    return
  }

  if (action === 'discard-pending') {
    pendingItems = pendingItems.filter((x) => x.id !== id)
    renderPendingList()
    return
  }

  if (action === 'approve-pending') {
    const password = getAdminPassword()
    if (!password.trim()) {
      status.textContent = '请先输入管理员密码后再一键上线'
      status.style.color = '#e11d48'
      return
    }
    status.textContent = '上线中...'
    status.style.color = 'hsl(var(--muted-foreground))'
    try {
      await addCode({
        password,
        gameName: item.gameName || gameNameInput.value || '无限暖暖',
        codeText: item.codeText,
        diamondReward: item.diamondReward || undefined,
        otherReward: item.otherReward || undefined,
        expiryAt: item.expiryAt || undefined,
        source: item.source || undefined,
      })
      persistPassword(password)
      pendingItems = pendingItems.filter((x) => x.id !== id)
      renderPendingList()
      status.textContent = '已成功上线'
      status.style.color = '#15803d'
      await refreshList()
    } catch (err) {
      if (isAuthError(err)) {
        clearPasswordAndRequireInput('密码错误，请重新输入管理员密码')
        return
      }
      status.textContent = err instanceof Error ? err.message : '上线失败'
      status.style.color = '#e11d48'
    }
  }
})

renderAuthState()
renderPendingList()
void refreshList()
void refreshSubmissions()