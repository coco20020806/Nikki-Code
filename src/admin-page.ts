import './index.css'
import { registerNikkiServiceWorker } from '@/lib/register-sw'
import { getCodePushApiUrl, warnIfVapidKeysMissingInClient } from '@/lib/push-notifications'
import {
  type AdminCodeWithReports,
  addCode,
  deleteCode,
  fetchAdminCodesWithReports,
  listCodes,
  listSubmissions,
  setSubmissionFeatured,
  setSubmissionRead,
  updateCode,
  verifyAdminPassword,
} from '@/lib/codes-api'

registerNikkiServiceWorker()
warnIfVapidKeysMissingInClient()
import { format } from 'date-fns'

const ADMIN_PASSWORD_KEY = 'admin_password'
const SERVER_OPTIONS = {
  '闪耀暖暖': [
    { value: 'SN_CN', label: '国服 (SN_CN)' },
    { value: 'SN_TW', label: '台服 (SN_TW)' },
  ],
  '无限暖暖': [
    { value: 'IN_CN', label: '国服 (IN_CN)' },
    { value: 'IN_GL', label: '国际服 (IN_GL)' },
  ],
} as const

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
          <input id="header-password" placeholder="管理员密码" style="height:36px;border:1px solid hsl(var(--input));border-radius:999px;padding:0 14px;background:#fff;font-size:13px;" type="password" />
          <button id="header-verify-btn" type="button" style="height:36px;padding:0 16px;border:none;border-radius:999px;background:hsl(var(--primary));color:white;font-weight:500;cursor:pointer;font-size:13px;">验证</button>
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
          <button id="ai-extract-btn" type="button" style="height:38px;padding:0 18px;border:none;border-radius:999px;background:hsl(var(--primary));color:white;font-weight:500;cursor:pointer;font-size:14px;">识别</button>
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
        <select name="server" class="h-11 w-full rounded-xl border border-input bg-white px-4"></select>
        <input name="codeText" placeholder="兑换码" class="h-11 w-full rounded-xl border border-input bg-white px-4" required />
        <input name="diamondReward" placeholder="钻石奖励（可选；留空则低价值）" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <input name="otherReward" placeholder="其他奖励（可选）" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;">
          <input name="expiryDate" type="date" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
          <select name="expiryHour" class="h-11 rounded-xl border border-input bg-white px-2" style="min-width:76px;"></select>
          <select name="expiryMinute" class="h-11 rounded-xl border border-input bg-white px-2" style="min-width:76px;"></select>
          <button id="set-end-of-day-btn" type="button" style="height:44px;padding:0 12px;border:1px solid hsl(var(--border));border-radius:999px;background:#fff;color:hsl(var(--foreground));font-size:12px;font-weight:600;cursor:pointer;">
            23:59
          </button>
        </div>
        <input name="source" placeholder="来源（可选）" class="h-11 w-full rounded-xl border border-input bg-white px-4" />
        <button class="rounded-xl bg-primary text-primary-foreground" type="submit" style="height:44px;border:none;font-weight:500;cursor:pointer;border-radius:999px;">确认上线</button>
      </form>
      <p id="status" style="margin-top:10px;"></p>
    </section>
    <section class="glass-card" style="padding:24px;border-radius:24px;margin-top:20px;">
      <h2 style="margin:0 0 12px;font-size:24px;">进行中兑换码</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;">
        <select id="filter-game" style="height:40px;border:1px solid hsl(var(--input));border-radius:12px;padding:0 10px;background:#fff;font-size:13px;">
          <option value="全部">全部</option>
          <option value="闪耀暖暖">闪耀暖暖</option>
          <option value="无限暖暖">无限暖暖</option>
        </select>
        <select id="filter-server" style="height:40px;border:1px solid hsl(var(--input));border-radius:12px;padding:0 10px;background:#fff;font-size:13px;"></select>
      </div>
      <label style="display:inline-flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;color:hsl(var(--muted-foreground));cursor:pointer;">
        <input id="push-only-test" type="checkbox" />
        仅发送给测试设备
      </label>
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
    <div id="admin-toast" role="status" aria-live="polite" style="display:none;position:fixed;bottom:calc(22px + env(safe-area-inset-bottom,0px));left:50%;z-index:320;max-width:min(92vw,400px);padding:14px 20px;border-radius:16px;background:rgba(24,24,32,0.92);color:#fafafa;font-size:14px;font-weight:600;line-height:1.45;box-shadow:0 14px 44px rgba(0,0,0,0.28);backdrop-filter:blur(10px);text-align:center;transform:translateX(-50%);"></div>
    <div id="edit-modal" style="display:none;position:fixed;inset:0;z-index:200;align-items:center;justify-content:center;padding:20px;background:rgba(15,15,20,0.38);backdrop-filter:blur(6px);">
      <div id="edit-modal-panel" style="width:100%;max-width:420px;border-radius:22px;border:1px solid hsl(var(--border));background:rgba(255,255,255,0.96);padding:22px 20px 20px;box-shadow:0 20px 50px rgba(0,0,0,0.12);">
        <h3 style="margin:0 0 16px;font-size:18px;font-weight:600;color:hsl(var(--foreground));letter-spacing:-0.02em;">编辑兑换码</h3>
        <input type="hidden" id="edit-code-id" value="" />
        <label style="display:block;margin-bottom:14px;font-size:12px;font-weight:500;color:hsl(var(--muted-foreground));">兑换码文字
          <input id="edit-code-text" type="text" style="margin-top:6px;display:block;width:100%;height:42px;border:1px solid hsl(var(--input));border-radius:12px;padding:0 12px;background:#fff;font-size:15px;box-sizing:border-box;" />
        </label>
        <label style="display:block;margin-bottom:14px;font-size:12px;font-weight:500;color:hsl(var(--muted-foreground));">区服
          <select id="edit-server" style="margin-top:6px;display:block;width:100%;height:42px;border:1px solid hsl(var(--input));border-radius:12px;padding:0 12px;background:#fff;font-size:14px;box-sizing:border-box;">
            <option value="IN_CN">无限暖暖 - 国服</option>
            <option value="IN_GL">无限暖暖 - 国际服</option>
            <option value="SN_CN">闪耀暖暖 - 国服</option>
            <option value="SN_TW">闪耀暖暖 - 台服</option>
          </select>
        </label>
        <label style="display:block;margin-bottom:14px;font-size:12px;font-weight:500;color:hsl(var(--muted-foreground));">钻石奖励（留空则低价值）
          <input id="edit-diamond" type="text" style="margin-top:6px;display:block;width:100%;height:42px;border:1px solid hsl(var(--input));border-radius:12px;padding:0 12px;background:#fff;font-size:14px;box-sizing:border-box;" />
        </label>
        <label style="display:block;margin-bottom:14px;font-size:12px;font-weight:500;color:hsl(var(--muted-foreground));">其他奖励
          <input id="edit-other" type="text" style="margin-top:6px;display:block;width:100%;height:42px;border:1px solid hsl(var(--input));border-radius:12px;padding:0 12px;background:#fff;font-size:14px;box-sizing:border-box;" />
        </label>
        <label style="display:block;margin-bottom:14px;font-size:12px;font-weight:500;color:hsl(var(--muted-foreground));">过期时间
          <div style="margin-top:6px;display:grid;grid-template-columns:1fr auto auto;gap:8px;">
            <input id="edit-expiry-date" type="date" style="display:block;width:100%;height:42px;border:1px solid hsl(var(--input));border-radius:12px;padding:0 12px;background:#fff;font-size:14px;box-sizing:border-box;" />
            <select id="edit-expiry-hour" style="height:42px;border:1px solid hsl(var(--input));border-radius:12px;padding:0 10px;background:#fff;font-size:14px;box-sizing:border-box;min-width:76px;"></select>
            <select id="edit-expiry-minute" style="height:42px;border:1px solid hsl(var(--input));border-radius:12px;padding:0 10px;background:#fff;font-size:14px;box-sizing:border-box;min-width:76px;"></select>
          </div>
        </label>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:18px;font-size:13px;font-weight:500;color:hsl(var(--foreground));cursor:pointer;">
          <input id="edit-invalid" type="checkbox" style="width:18px;height:18px;accent-color:hsl(var(--destructive));" />
          标记为已失效（软删除）
        </label>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
          <button type="button" id="edit-cancel-btn" style="height:40px;padding:0 18px;border:1px solid hsl(var(--border));border-radius:999px;background:#fff;color:hsl(var(--foreground));font-weight:500;cursor:pointer;font-size:14px;">取消</button>
          <button type="button" id="edit-save-btn" style="height:40px;padding:0 18px;border:none;border-radius:999px;background:hsl(var(--foreground));color:hsl(var(--background));font-weight:500;cursor:pointer;font-size:14px;">保存</button>
        </div>
      </div>
    </div>
  </main>
`

const form = document.getElementById('code-form') as HTMLFormElement
const status = document.getElementById('status') as HTMLParagraphElement
const listActiveWrap = document.getElementById('list-active') as HTMLDivElement
const filterGameInput = document.getElementById('filter-game') as HTMLSelectElement
const filterServerInput = document.getElementById('filter-server') as HTMLSelectElement
const pushOnlyTestInput = document.getElementById('push-only-test') as HTMLInputElement
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
const serverInput = form.querySelector('select[name="server"]') as HTMLSelectElement
const codeTextInput = form.querySelector('input[name="codeText"]') as HTMLInputElement
const diamondRewardInput = form.querySelector('input[name="diamondReward"]') as HTMLInputElement
const otherRewardInput = form.querySelector('input[name="otherReward"]') as HTMLInputElement
const expiryDateInput = form.querySelector('input[name="expiryDate"]') as HTMLInputElement
const expiryHourInput = form.querySelector('select[name="expiryHour"]') as HTMLSelectElement
const expiryMinuteInput = form.querySelector('select[name="expiryMinute"]') as HTMLSelectElement
const sourceInput = form.querySelector('input[name="source"]') as HTMLInputElement
const setEndOfDayBtn = document.getElementById('set-end-of-day-btn') as HTMLButtonElement
const aiTextInput = document.getElementById('ai-text') as HTMLTextAreaElement
const aiImageInput = document.getElementById('ai-image') as HTMLInputElement
const aiDropzone = document.getElementById('ai-dropzone') as HTMLDivElement
const aiExtractBtn = document.getElementById('ai-extract-btn') as HTMLButtonElement
const aiStatus = document.getElementById('ai-status') as HTMLParagraphElement
const pendingListWrap = document.getElementById('pending-list') as HTMLDivElement
const adminToastEl = document.getElementById('admin-toast') as HTMLDivElement | null

let adminToastTimer: ReturnType<typeof setTimeout> | null = null

function showAdminToast(message: string) {
  if (!adminToastEl) return
  if (adminToastTimer) clearTimeout(adminToastTimer)
  adminToastEl.textContent = message
  adminToastEl.style.display = 'block'
  adminToastTimer = setTimeout(() => {
    adminToastEl.style.display = 'none'
    adminToastTimer = null
  }, 4000)
}
const editModal = document.getElementById('edit-modal') as HTMLDivElement
const editIdInput = document.getElementById('edit-code-id') as HTMLInputElement
const editCodeTextInput = document.getElementById('edit-code-text') as HTMLInputElement
const editServerInput = document.getElementById('edit-server') as HTMLSelectElement
const editDiamondInput = document.getElementById('edit-diamond') as HTMLInputElement
const editOtherInput = document.getElementById('edit-other') as HTMLInputElement
const editExpiryDateInput = document.getElementById('edit-expiry-date') as HTMLInputElement
const editExpiryHourInput = document.getElementById('edit-expiry-hour') as HTMLSelectElement
const editExpiryMinuteInput = document.getElementById('edit-expiry-minute') as HTMLSelectElement
const editInvalidCheckbox = document.getElementById('edit-invalid') as HTMLInputElement
const editCancelBtn = document.getElementById('edit-cancel-btn') as HTMLButtonElement
const editSaveBtn = document.getElementById('edit-save-btn') as HTMLButtonElement

let currentPassword = localStorage.getItem(ADMIN_PASSWORD_KEY) ?? ''
let currentImageBase64 = ''
let showExpired = false
let cachedExpiredRows: AdminCodeWithReports[] = []
let cachedActiveRows: AdminCodeWithReports[] = []
let filterGame = '全部'
let filterServer = 'ALL'
let pendingItems: Array<{
  id: string
  gameName: string
  codeText: string
  diamondReward?: string
  otherReward?: string
  expiryAt?: string
  source?: string
  server?: string
  copied?: boolean
}> = []

function defaultServerByGame(gameName: string): string {
  return gameName === '闪耀暖暖' ? 'SN_CN' : 'IN_CN'
}

function renderServerOptions(selectEl: HTMLSelectElement, gameName: string, preferredValue?: string) {
  const options = SERVER_OPTIONS[gameName as keyof typeof SERVER_OPTIONS] ?? SERVER_OPTIONS['无限暖暖']
  const keep = preferredValue && options.some((item) => item.value === preferredValue)
  selectEl.innerHTML = options
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join('')
  selectEl.value = keep ? preferredValue : options[0].value
}

function adminServerLabel(server: string): string {
  const all = [
    ...SERVER_OPTIONS['闪耀暖暖'],
    ...SERVER_OPTIONS['无限暖暖'],
  ]
  const found = all.find((item) => item.value === server)
  return found?.label ?? server
}

function renderFilterServerOptions() {
  let options: Array<{ value: string; label: string }> = [{ value: 'ALL', label: '全部区服' }]
  if (filterGame === '闪耀暖暖') {
    options = [
      ...options,
      ...SERVER_OPTIONS['闪耀暖暖'].map((item) => ({ value: item.value, label: item.label })),
    ]
  } else if (filterGame === '无限暖暖') {
    options = [
      ...options,
      ...SERVER_OPTIONS['无限暖暖'].map((item) => ({ value: item.value, label: item.label })),
    ]
  } else {
    options = [
      ...options,
      ...SERVER_OPTIONS['闪耀暖暖'].map((item) => ({ value: item.value, label: item.label })),
      ...SERVER_OPTIONS['无限暖暖'].map((item) => ({ value: item.value, label: item.label })),
    ]
  }
  filterServerInput.innerHTML = options
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join('')
  if (!options.some((item) => item.value === filterServer)) {
    filterServer = 'ALL'
  }
  filterServerInput.value = filterServer
}

function flashField(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const prevTransition = el.style.transition
  const prevBoxShadow = el.style.boxShadow
  const prevBorderColor = el.style.borderColor
  el.style.transition = 'box-shadow 0.28s ease, border-color 0.28s ease'
  el.style.borderColor = 'hsl(var(--primary))'
  el.style.boxShadow = '0 0 0 3px rgba(236, 72, 153, 0.2)'
  setTimeout(() => {
    el.style.boxShadow = prevBoxShadow
    el.style.borderColor = prevBorderColor
    el.style.transition = prevTransition
  }, 900)
}

function fillHourMinuteOptions(hourEl: HTMLSelectElement, minuteEl: HTMLSelectElement) {
  hourEl.innerHTML = Array.from({ length: 24 }, (_, i) => {
    const v = String(i).padStart(2, '0')
    return `<option value="${v}">${v}</option>`
  }).join('')
  minuteEl.innerHTML = Array.from({ length: 60 }, (_, i) => {
    const v = String(i).padStart(2, '0')
    return `<option value="${v}">${v}</option>`
  }).join('')
}

function expiryPartsFromIso(iso?: string): { date: string; hour: string; minute: string } {
  if (!iso) return { date: '', hour: '23', minute: '59' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', hour: '23', minute: '59' }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: pad(d.getHours()),
    minute: pad(d.getMinutes()),
  }
}

function buildExpiryIso(date: string, hour: string, minute: string): string | undefined {
  const dt = date.trim()
  if (!dt) return undefined
  const hh = hour.trim() || '00'
  const mm = minute.trim() || '00'
  return new Date(`${dt}T${hh}:${mm}:00`).toISOString()
}

function applyAiItemToForm(item: {
  gameName?: string
  server?: string
  codeText?: string
  diamondReward?: string
  otherReward?: string
  expiryAt?: string
  source?: string
}) {
  const game = item.gameName === '闪耀暖暖' || item.gameName === '无限暖暖' ? item.gameName : gameNameInput.value
  gameNameInput.value = game
  renderServerOptions(serverInput, game, item.server || undefined)
  codeTextInput.value = (item.codeText ?? '').trim()
  diamondRewardInput.value = item.diamondReward ?? ''
  otherRewardInput.value = item.otherReward ?? ''
  sourceInput.value = item.source ?? ''
  const exp = expiryPartsFromIso(item.expiryAt)
  expiryDateInput.value = exp.date
  expiryHourInput.value = exp.hour
  expiryMinuteInput.value = exp.minute

  flashField(gameNameInput)
  flashField(serverInput)
  flashField(codeTextInput)
  flashField(diamondRewardInput)
  flashField(otherRewardInput)
  flashField(expiryDateInput)
  flashField(expiryHourInput)
  flashField(expiryMinuteInput)
  flashField(sourceInput)
}

function isAuthError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('管理员密码错误')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
        <div style="margin-top:6px;font-size:12px;color:hsl(var(--muted-foreground));">区服：${item.server || '默认'} / 钻石：${item.diamondReward || '无'} / 其他：${item.otherReward || '无'}</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" data-action="copy-pending" data-id="${item.id}" style="border:1px solid hsl(var(--border));background:#fff;border-radius:999px;padding:8px 12px;cursor:pointer;font-weight:500;font-size:13px;">${item.copied ? '已复制 ✅' : '一键复制'}</button>
          <button type="button" data-action="fill-pending" data-id="${item.id}" style="border:0;background:hsl(var(--primary));color:white;border-radius:999px;padding:8px 12px;cursor:pointer;font-weight:500;font-size:13px;">填充表单</button>
          <button type="button" data-action="discard-pending" data-id="${item.id}" style="border:1px solid hsl(var(--destructive)/0.4);background:#fff;color:hsl(var(--destructive));border-radius:999px;padding:8px 12px;cursor:pointer;font-weight:500;font-size:13px;">删除</button>
        </div>
      </div>
    `,
    )
    .join('')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function reportBadgeHtml(code: AdminCodeWithReports): string {
  if (code.reportCount <= 0) return ''
  const tip = code.reportTypeLabels.length ? code.reportTypeLabels.join('、') : '玩家报错'
  return `<span title="${escapeAttr(tip)}" style="display:inline-flex;align-items:center;margin-left:8px;padding:2px 8px;border-radius:999px;background:rgba(220,38,38,0.12);color:#b91c1c;font-size:11px;font-weight:700;border:1px solid rgba(220,38,38,0.35);cursor:default;">⚠️ 有人报错</span>`
}

function sortCodesWithReportsFirst(rows: AdminCodeWithReports[]): AdminCodeWithReports[] {
  return [...rows].sort((a, b) => {
    const ar = a.reportCount > 0 ? 1 : 0
    const br = b.reportCount > 0 ? 1 : 0
    if (br !== ar) return br - ar
    if (a.isHighValue !== b.isHighValue) return a.isHighValue ? -1 : 1
    const ae = a.expiryAt ? new Date(a.expiryAt).getTime() : Infinity
    const be = b.expiryAt ? new Date(b.expiryAt).getTime() : Infinity
    return ae - be
  })
}

function openEditModal(id: number) {
  const code = cachedActiveRows.find((c) => c.id === id)
  if (!code) return
  editIdInput.value = String(id)
  editCodeTextInput.value = code.codeText
  editServerInput.value = code.server || (code.gameName === '闪耀暖暖' ? 'SN_CN' : 'IN_CN')
  editDiamondInput.value = code.diamondReward ?? ''
  editOtherInput.value = code.otherReward ?? code.rewardDesc ?? ''
  const exp = expiryPartsFromIso(code.expiryAt)
  editExpiryDateInput.value = exp.date
  editExpiryHourInput.value = exp.hour
  editExpiryMinuteInput.value = exp.minute
  editInvalidCheckbox.checked = Boolean(code.isInvalid)
  editModal.style.display = 'flex'
}

function closeEditModal() {
  editModal.style.display = 'none'
}

function diamondSvg() {
  return `
    <svg viewBox="0 0 24 24" width="14" height="14" style="display:inline-block;vertical-align:middle;margin-right:6px;">
      <path d="M12 2 2 12l10 10 10-10L12 2Z" fill="hsl(var(--accent))" opacity="0.9"/>
    </svg>
  `
}

function renderActiveList() {
  const filteredRows = cachedActiveRows.filter((code) => {
    if (filterGame !== '全部' && code.gameName !== filterGame) return false
    if (filterServer !== 'ALL' && (code.server || defaultServerByGame(code.gameName)) !== filterServer) return false
    return true
  })

  listActiveWrap.innerHTML = filteredRows
    .slice(0, 80)
    .map(
      (code) => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 0;border-top:1px solid hsl(var(--border));">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:600;">
              ${code.gameName} - <code>${code.codeText}</code>${reportBadgeHtml(code)}
            </div>
            <div style="margin-top:6px;font-size:12px;color:hsl(var(--muted-foreground));line-height:1.5;">
              区服: ${adminServerLabel(code.server || defaultServerByGame(code.gameName))}<br/>
              过期: ${code.expiryAt ? format(new Date(code.expiryAt), 'yyyy-MM-dd HH:mm') : '永久'}
              ${
                code.diamondReward
                  ? `<br/>${diamondSvg()}${code.diamondReward} 钻石`
                  : code.otherReward
                    ? `<br/>${code.otherReward}`
                    : code.rewardDesc
                      ? `<br/>${code.rewardDesc}`
                      : ''
              }
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
            <button type="button" data-action="push" data-id="${code.id}" style="border:1px solid rgba(219,39,119,0.35);background:#fff;color:#be185d;border-radius:999px;padding:8px 14px;cursor:pointer;font-weight:600;font-size:13px;">
              📣 推送此码
            </button>
            <button type="button" data-action="edit" data-id="${code.id}" style="border:1px solid hsl(var(--border));background:#fff;color:hsl(var(--foreground));border-radius:999px;padding:8px 14px;cursor:pointer;font-weight:500;font-size:13px;">
              编辑
            </button>
            <button type="button" data-action="delete" data-id="${code.id}" style="border:1px solid rgba(225,29,72,0.35);background:#fff;color:hsl(var(--destructive));border-radius:999px;padding:8px 14px;cursor:pointer;font-weight:500;font-size:13px;">
              删除
            </button>
          </div>
        </div>
      `,
    )
    .join('')
  if (!filteredRows.length) {
    listActiveWrap.innerHTML = `<p style="color:hsl(var(--muted-foreground));font-size:12px;">当前筛选条件下暂无进行中的兑换码。</p>`
  }
}

async function refreshList() {
  try {
    const pwd = getAdminPassword()
    const rows: AdminCodeWithReports[] = verifyAdminPassword(pwd)
      ? await fetchAdminCodesWithReports(pwd)
      : (await listCodes()).map((c) => ({ ...c, reportCount: 0, reportTypeLabels: [] as string[] }))

    const now = Date.now()
    const activeRaw = rows.filter((code) => !(code.expiryAt && new Date(code.expiryAt).getTime() < now))
    const expiredRaw = rows.filter((code) => code.expiryAt && new Date(code.expiryAt).getTime() < now)
    const activeRows = sortCodesWithReportsFirst(activeRaw)
    cachedExpiredRows = sortCodesWithReportsFirst(expiredRaw)
    cachedActiveRows = activeRows

    expiredTitle.textContent = `查看已过期的兑换码 (${cachedExpiredRows.length})`
    renderActiveList()

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
          <div style="font-weight:800;">${code.gameName} - <code>${code.codeText}</code>${reportBadgeHtml(code)}</div>
          <div style="margin-top:6px;font-size:12px;color:hsl(var(--muted-foreground));">
            区服：${code.server || '默认'} / 已过期：${code.expiryAt ? format(new Date(code.expiryAt), 'yyyy-MM-dd HH:mm') : '未知'} / ${code.diamondReward ? `${diamondSvg()}${code.diamondReward} 钻石` : code.otherReward || code.rewardDesc || ''}
          </div>
        </div>
        <button
          type="button"
          data-action="delete"
          data-id="${code.id}"
          style="flex:0 0 auto;align-self:flex-start;border:1px solid rgba(225,29,72,0.35);background:#fff;color:hsl(var(--destructive));border-radius:999px;padding:8px 14px;cursor:pointer;font-weight:500;font-size:13px;"
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
                ? `<a href="${item.imageUrl}" target="_blank" rel="noreferrer"><img src="${item.imageUrl}" alt="投稿图片" style="width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid hsl(var(--border));" /></a>
                  <div style="margin-top:6px;font-size:12px;font-style:italic;color:hsl(var(--muted-foreground));">昵称：${escapeHtml(String(item.nickname ?? '').trim() || '热心玩家')}</div>`
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
              style="flex:0 0 auto;align-self:flex-start;border:1px solid hsl(var(--border));background:white;color:hsl(var(--foreground));border-radius:999px;padding:8px 14px;cursor:pointer;font-weight:500;font-size:13px;"
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
                    style="flex:0 0 auto;align-self:flex-start;border:1px solid hsl(var(--accent)/0.45);background:${item.isFeatured ? 'hsl(var(--accent)/0.2)' : 'white'};color:hsl(var(--foreground));border-radius:999px;padding:8px 14px;cursor:pointer;font-weight:500;font-size:13px;"
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
      server:
        String(data.get('server') ?? '').trim() || defaultServerByGame(String(data.get('gameName') ?? '无限暖暖')),
      // 直接获取输入值，不再强制转换大小写
      codeText: String(data.get('codeText') ?? '').trim(),
      diamondReward: diamondReward || undefined,
      otherReward: otherReward || undefined,
      expiryAt: buildExpiryIso(String(data.get('expiryDate') ?? ''), String(data.get('expiryHour') ?? ''), String(data.get('expiryMinute') ?? '')),
      source: String(data.get('source') ?? ''),
    })
    status.textContent = '保存成功'
    status.style.color = '#15803d'
    persistPassword(getAdminPassword())
    form.reset()
    renderServerOptions(serverInput, gameNameInput.value)
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

const handlePushCodeClick = async (btn: HTMLButtonElement) => {
  const id = Number(btn.getAttribute('data-id') ?? 0)
  if (!id) return
  const code = cachedActiveRows.find((x) => x.id === id)
  if (!code) return

  const password = getAdminPassword()
  if (!password.trim()) {
    status.textContent = '请输入管理员密码后再推送'
    status.style.color = '#e11d48'
    return
  }

  const ok = window.confirm(`确认向订阅用户推送该兑换码？\n${code.gameName} / ${adminServerLabel(code.server || defaultServerByGame(code.gameName))} / ${code.codeText}`)
  if (!ok) return

  status.textContent = '推送中...'
  status.style.color = 'hsl(var(--muted-foreground))'

  try {
    const res = await fetch(getCodePushApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password,
        gameName: code.gameName,
        server: code.server || defaultServerByGame(code.gameName),
        codeText: code.codeText,
        onlyTest: pushOnlyTestInput.checked,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string; sent?: number; failed?: number; total?: number }
    if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
    const sent = data.sent ?? 0
    const failed = data.failed ?? 0
    const total = data.total ?? 0
    status.textContent = `推送完成：共 ${total} 条，成功 ${sent}，失败 ${failed}`
    status.style.color = '#15803d'
    showAdminToast(`该码推送完成：成功 ${sent} 条`)
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : '推送失败'
    status.style.color = '#e11d48'
  }
}

listActiveWrap.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement | null
  const pushBtn = target?.closest('button[data-action="push"]') as HTMLButtonElement | null
  if (pushBtn) {
    await handlePushCodeClick(pushBtn)
    return
  }
  const editBtn = target?.closest('button[data-action="edit"]') as HTMLButtonElement | null
  if (editBtn) {
    const id = Number(editBtn.getAttribute('data-id') ?? 0)
    if (id) openEditModal(id)
    return
  }
  const delBtn = target?.closest('button[data-action="delete"]') as HTMLButtonElement | null
  if (!delBtn) return
  await handleDeleteClick(delBtn)
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

gameNameInput.addEventListener('change', () => {
  renderServerOptions(serverInput, gameNameInput.value)
})

filterGameInput.addEventListener('change', () => {
  filterGame = filterGameInput.value
  renderFilterServerOptions()
  renderActiveList()
})

filterServerInput.addEventListener('change', () => {
  filterServer = filterServerInput.value
  renderActiveList()
})

setEndOfDayBtn.addEventListener('click', () => {
  if (!expiryDateInput.value) {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    expiryDateInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  }
  expiryHourInput.value = '23'
  expiryMinuteInput.value = '59'
  flashField(expiryDateInput)
  flashField(expiryHourInput)
  flashField(expiryMinuteInput)
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
          server?: string
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
      server?: string
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
        server: item.server || '',
        codeText: item.codeText || '',
        diamondReward: item.diamondReward || '',
        otherReward: item.otherReward || '',
        expiryAt: item.expiryAt || '',
        source: item.source || '',
        copied: false,
      }))

    pendingItems = [...normalized, ...pendingItems]
    renderPendingList()
    if (normalized.length > 0) {
      applyAiItemToForm(normalized[0])
    }
    aiStatus.textContent =
      normalized.length > 0
        ? `识别成功，已自动填充首条到表单（共 ${normalized.length} 条），请核对后点击“确认上线”。`
        : '未识别到有效兑换码，请检查文本或截图。'
    aiStatus.style.color = normalized.length > 0 ? '#15803d' : '#e11d48'
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

  if (action === 'fill-pending') {
    applyAiItemToForm(item)
    status.textContent = '已填充到表单，请复核后点击“确认上线”'
    status.style.color = '#15803d'
    return
  }
})

editCancelBtn.addEventListener('click', () => closeEditModal())

editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeEditModal()
})

editSaveBtn.addEventListener('click', async () => {
  const id = Number(editIdInput.value)
  if (!id) return
  const password = getAdminPassword()
  if (!password.trim()) {
    status.textContent = '请输入管理员密码后再保存'
    status.style.color = '#e11d48'
    return
  }
  const codeText = editCodeTextInput.value.trim()
  if (!codeText) {
    status.textContent = '兑换码不能为空'
    status.style.color = '#e11d48'
    return
  }
  const expiryAt =
    buildExpiryIso(editExpiryDateInput.value, editExpiryHourInput.value, editExpiryMinuteInput.value) ?? null

  status.textContent = '保存中…'
  status.style.color = 'hsl(var(--muted-foreground))'
  try {
    await updateCode({
      password,
      id,
      codeText,
      server: editServerInput.value,
      expiryAt,
      diamondReward: editDiamondInput.value,
      otherReward: editOtherInput.value,
      isInvalid: editInvalidCheckbox.checked,
    })
    persistPassword(password)
    status.textContent = '已保存修改'
    status.style.color = '#15803d'
    closeEditModal()
    await refreshList()
  } catch (err) {
    if (isAuthError(err)) {
      clearPasswordAndRequireInput('密码错误，请重新输入管理员密码')
      closeEditModal()
      return
    }
    status.textContent = err instanceof Error ? err.message : '保存失败'
    status.style.color = '#e11d48'
  }
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && editModal.style.display === 'flex') closeEditModal()
})

renderAuthState()
fillHourMinuteOptions(expiryHourInput, expiryMinuteInput)
fillHourMinuteOptions(editExpiryHourInput, editExpiryMinuteInput)
expiryHourInput.value = '23'
expiryMinuteInput.value = '59'
editExpiryHourInput.value = '23'
editExpiryMinuteInput.value = '59'
renderServerOptions(serverInput, gameNameInput.value)
renderFilterServerOptions()
renderPendingList()
void refreshList()
void refreshSubmissions()