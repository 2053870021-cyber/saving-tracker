'use strict';

/* ============================================================
   省钱记 — 纯本地 PWA，无后端、无依赖
   ============================================================ */

const APP_VERSION = '1.0.8';
const STORAGE_KEY = 'savetracker.v1';
const BACKUP_STALE_DAYS = 30;
const MAX_AMOUNT = 9999999;
const CYCLE_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const SWATCHES = ['#FF9F0A', '#FF375F', '#BF5AF2', '#5E5CE6', '#0A84FF', '#32ADE6',
  '#30D158', '#34C759', '#FFD60A', '#A2845E', '#8E8E93', '#FF6482'];
const EMOJIS = ['🍚', '🚇', '🛍️', '🎮', '🏠', '💊', '📦', '☕️', '🍔', '🍜', '🥤', '🚕',
  '✈️', '🎬', '🎁', '👕', '💡', '📱', '🐱', '💅', '📚', '🧾', '💰', '🍎'];
const PRESET_CATEGORIES = [
  { id: 'food', name: '餐饮', emoji: '🍚', color: '#FF9F0A', builtin: true, hidden: false },
  { id: 'transport', name: '交通', emoji: '🚇', color: '#0A84FF', builtin: true, hidden: false },
  { id: 'shopping', name: '购物', emoji: '🛍️', color: '#BF5AF2', builtin: true, hidden: false },
  { id: 'fun', name: '娱乐', emoji: '🎮', color: '#FF375F', builtin: true, hidden: false },
  { id: 'home', name: '居住', emoji: '🏠', color: '#5E5CE6', builtin: true, hidden: false },
  { id: 'health', name: '医疗', emoji: '💊', color: '#30D158', builtin: true, hidden: false },
  { id: 'other', name: '其他', emoji: '📦', color: '#8E8E93', builtin: true, hidden: false }
];

/* ---------------- 小工具 ---------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
const pad2 = n => (n < 10 ? '0' + n : '' + n);
const ymd = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const todayStr = () => ymd(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clampDate = s => (s && s > todayStr() ? todayStr() : s);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** ¥1,234.56 / -¥12.50 */
function money(n) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const neg = v < 0;
  const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + '¥' + s;
}

/** 键盘输入串 → 显示串（千分位，保留用户输入的末尾小数点） */
function displayAmount(s) {
  if (!s) return '0';
  const hasDot = s.indexOf('.') >= 0;
  const parts = s.split('.');
  const ip = parts[0] ? parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0';
  return hasDot ? ip + '.' + (parts[1] || '') : ip;
}

function parseAmountInput(s) {
  const v = parseFloat(s);
  return isFinite(v) && v > 0 ? Math.min(Math.round(v * 100) / 100, MAX_AMOUNT) : 0;
}

/** 解析用户填的金额：只留数字和一个小数点，最多两位小数（支持到分） */
function parseMoneyInput(str) {
  let s = String(str == null ? '' : str).replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  }
  const v = Number(s);
  if (!isFinite(v) || v <= 0) return 0;
  return Math.min(Math.round(v * 100) / 100, MAX_AMOUNT);
}

/* ---------------- 账单周期 ---------------- */
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

/** 含某天的周期是从哪天开始的（起始日超出当月天数时，用当月最后一天） */
function cycleStartFor(dateObj, startDay) {
  const y = dateObj.getFullYear();
  const m = dateObj.getMonth();
  const thisDay = Math.min(startDay, daysInMonth(y, m));
  if (dateObj.getDate() >= thisDay) return new Date(y, m, thisDay);
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 11 : m - 1;
  return new Date(py, pm, Math.min(startDay, daysInMonth(py, pm)));
}

function cycleOf(dateObj, startDay) {
  const start = cycleStartFor(dateObj, startDay);
  start.setHours(0, 0, 0, 0);
  const ny = start.getMonth() === 11 ? start.getFullYear() + 1 : start.getFullYear();
  const nm = start.getMonth() === 11 ? 0 : start.getMonth() + 1;
  const end = new Date(ny, nm, Math.min(startDay, daysInMonth(ny, nm)));
  end.setHours(0, 0, 0, 0);
  return { start: start, end: end };
}

function cycleRangeLabel(cycle) {
  const start = cycle.start instanceof Date ? cycle.start : new Date(cycle.startKey + 'T00:00:00');
  const endExclusive = cycle.end instanceof Date ? cycle.end : new Date(cycle.endKey + 'T00:00:00');
  const end = new Date(endExclusive.getTime() - 86400000);
  const left = start.getFullYear() + '年' + (start.getMonth() + 1) + '月' + start.getDate() + '日';
  const right = (end.getFullYear() === start.getFullYear() ? '' : end.getFullYear() + '年') +
    (end.getMonth() + 1) + '月' + end.getDate() + '日';
  return left + '–' + right;
}

function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

function currentCycle() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const c = cycleOf(t, state.settings.cycleStartDay);
  return {
    startKey: ymd(c.start),
    endKey: ymd(c.end),
    daysLeft: Math.max(1, daysBetween(t, c.end)),
    label: cycleRangeLabel(c)
  };
}

function expensesInCycle(cy) {
  return state.expenses.filter(e => (e.type || 'expense') === 'expense' && e.date >= cy.startKey && e.date < cy.endKey);
}

function balanceEffect(entry) {
  return entry.type === 'income' ? entry.amount : -entry.amount;
}

/* ---------------- 状态 ---------------- */
function defaultState() {
  return {
    version: 1,
    settings: {
      balance: 0,
      cycleStartDay: 1,
      categories: PRESET_CATEGORIES.map(c => Object.assign({}, c)),
      lastBackupAt: null
    },
    expenses: []
  };
}

let state = defaultState();
let storageOK = true;
let logMonthCount = 1;
let balanceAdjustMode = 'add';

const draft = { amountStr: '', catId: 'food', date: todayStr(), note: '' };

function normalizeState(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  const rs = raw.settings || {};
  const legacyBudget = Math.min(MAX_AMOUNT, Math.max(0, Math.round((Number(rs.budget) || 0) * 100) / 100));
  const hasBalance = Object.prototype.hasOwnProperty.call(rs, 'balance') && isFinite(Number(rs.balance));
  if (hasBalance) s.settings.balance = Math.max(-MAX_AMOUNT, Math.min(MAX_AMOUNT, Math.round(Number(rs.balance) * 100) / 100));
  const cd = Math.round(Number(rs.cycleStartDay));
  s.settings.cycleStartDay = (cd >= 1 && cd <= 31) ? cd : 1;
  s.settings.lastBackupAt = rs.lastBackupAt || null;

  const list = [];
  const seen = {};
  if (Array.isArray(rs.categories)) {
    rs.categories.forEach(c => {
      if (!c || !c.id || seen[c.id]) return;
      seen[c.id] = true;
      list.push({
        id: String(c.id),
        name: String(c.name || '未命名').slice(0, 8),
        emoji: String(c.emoji || '📦').slice(0, 4),
        color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '#8E8E93',
        builtin: !!c.builtin,
        hidden: !!c.hidden
      });
    });
  }
  PRESET_CATEGORIES.forEach(p => {
    if (!seen[p.id]) list.push(Object.assign({}, p));
  });
  if (!list.some(c => c.id === 'other')) list.push(Object.assign({}, PRESET_CATEGORIES[6]));
  s.settings.categories = list;

  if (Array.isArray(raw.expenses)) {
    raw.expenses.forEach(e => {
      const amount = Math.round((Number(e && e.amount) || 0) * 100) / 100;
      const date = String((e && e.date) || '').slice(0, 10);
      if (!(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const catId = list.some(c => c.id === (e && e.catId)) ? String(e.catId) : 'other';
      const type = ['income', 'reduction'].indexOf(e && e.type) >= 0 ? e.type : 'expense';
      s.expenses.push({
        id: String((e && e.id) || uid()),
        amount: amount,
        catId: type === 'expense' ? catId : 'other',
        type: type,
        note: String((e && e.note) || '').slice(0, 30),
        date: date,
        createdAt: Number((e && e.createdAt)) || Date.parse(date + 'T12:00:00') || Date.now()
      });
    });
  }
  if (!hasBalance) {
    if (legacyBudget > 0) {
      const cy = cycleOf(new Date(), s.settings.cycleStartDay);
      const spent = s.expenses
        .filter(e => (e.type || 'expense') === 'expense' && e.date >= ymd(cy.start) && e.date < ymd(cy.end))
        .reduce((sum, e) => sum + e.amount, 0);
      s.settings.balance = Math.round((legacyBudget - spent) * 100) / 100;
    }
  }
  return s;
}

function load() {
  try {
    localStorage.setItem('__st_test__', '1');
    localStorage.removeItem('__st_test__');
  } catch (e) {
    storageOK = false;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = normalizeState(JSON.parse(raw));
  } catch (e) {
    console.warn('读取本地数据失败', e);
    storageOK = false;
  }
  if (!state.settings.categories.some(c => !c.hidden)) {
    state.settings.categories.forEach(c => { c.hidden = false; });
  }
  if (!catById(draft.catId) || catById(draft.catId).hidden) {
    const first = visibleCategories()[0];
    draft.catId = first ? first.id : 'other';
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    storageOK = false;
    toast('保存失败：本地存储不可用或已满');
  }
}

function catById(id) { return state.settings.categories.filter(c => c.id === id)[0] || null; }
function visibleCategories() { return state.settings.categories.filter(c => !c.hidden); }

/* ---------------- Toast / 浮层 ---------------- */
let toastTimer = null;
function toast(msg, ms) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms || 1900);
}

let modalResolver = null;
function openModal(html, onMask) {
  $('#modalBody').innerHTML = html;
  modalResolver = onMask || null;
  $('#modal').classList.remove('hidden');
}
function closeModal() {
  $('#modal').classList.add('hidden');
  modalResolver = null;
}
function openSheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.remove('hidden');
}
function closeSheet() { $('#sheet').classList.add('hidden'); }

function alertModal(title, body, okText) {
  return new Promise(resolve => {
    openModal(
      '<h2>' + esc(title) + '</h2><p class="modal-body">' + body + '</p>' +
      '<button class="btn-primary" id="mOk" style="width:100%">' + esc(okText || '知道了') + '</button>',
      () => resolve(false)
    );
    $('#mOk').onclick = () => { closeModal(); resolve(true); };
  });
}

function confirmModal(opts) {
  return new Promise(resolve => {
    openModal(
      '<h2>' + esc(opts.title) + '</h2><p class="modal-body">' + opts.body + '</p>' +
      '<div class="btn-row">' +
      '<button class="btn-mini" id="mCancel" style="flex:1;padding:13px">' + esc(opts.cancelText || '取消') + '</button>' +
      '<button class="btn-primary' + (opts.danger ? ' danger' : '') + '" id="mOk">' + esc(opts.okText || '确定') + '</button>' +
      '</div>',
      () => resolve(false)
    );
    $('#mCancel').onclick = () => { closeModal(); resolve(false); };
    $('#mOk').onclick = () => { closeModal(); resolve(true); };
  });
}

/* ---------------- 渲染：记一笔 ---------------- */
function renderHeader() {
  const d = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  $('#todayLabel').textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + week;
  $('#dateInput').max = todayStr();
}

function renderBudget() {
  const cy = currentCycle();
  const items = expensesInCycle(cy);
  const spent = Math.round(items.reduce((s, e) => s + e.amount, 0) * 100) / 100;
  const balance = state.settings.balance;

  $('#bcPeriod').textContent = '当前余额';
  const heroEl = $('#bcLeft');
  heroEl.className = 'bc-hero' + (balance < 0 ? ' over' : '');
  if (lastBalanceShown === null || lastBalanceShown === balance) {
    heroEl.textContent = money(balance);
  } else {
    animateMoney(heroEl, lastBalanceShown, balance);
  }
  lastBalanceShown = balance;

  $('#bcSpent').textContent = money(spent);
  $('#bcCycleStart').textContent = cy.startKey.slice(5).replace('-', '/');
  $('#bcDays').textContent = cy.daysLeft + ' 天';

  const hint = $('#bcHint');
  const staleDays = state.settings.lastBackupAt
    ? daysBetween(new Date(state.settings.lastBackupAt), new Date())
    : null;
  const endDate = ymd(new Date(new Date(cy.endKey).getTime() - 86400000));
  const backupHint = state.expenses.length > 0 && (staleDays === null || staleDays >= BACKUP_STALE_DAYS)
    ? (staleDays === null ? '还没有导出过备份，建议去设置里导出一份。' : '已经 ' + staleDays + ' 天没备份了，建议导出一次。')
    : '';
  hint.className = 'bc-hint';
  hint.textContent = '账单周期：' + cy.startKey + ' 至 ' + endDate + '。余额会跨周期结转。' +
    (backupHint ? ' ' + backupHint : '');
}

/** 数字滚动动画：记账或调整余额时显示余额变化 */
let lastBalanceShown = null;

function animateMoney(el, from, to) {
  if (el.__raf) cancelAnimationFrame(el.__raf);
  const t0 = performance.now();
  const dur = 420;
  const step = t => {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = money(from + (to - from) * eased);
    if (p < 1) {
      el.__raf = requestAnimationFrame(step);
    } else {
      el.__raf = null;
      el.textContent = money(to);
    }
  };
  el.__raf = requestAnimationFrame(step);
}

function renderChips() {
  const box = $('#catChips');
  const cats = visibleCategories();
  if (!cats.some(c => c.id === draft.catId) && cats.length) draft.catId = cats[0].id;
  box.innerHTML = cats.map(c =>
    '<button class="chip' + (c.id === draft.catId ? ' on' : '') + '" data-cat="' + esc(c.id) + '">' +
    '<span class="ce">' + esc(c.emoji) + '</span>' + esc(c.name) + '</button>'
  ).join('');
}

function renderAmount() {
  const el = $('#amountText');
  el.textContent = displayAmount(draft.amountStr);
  el.className = 'amount' + (draft.amountStr ? '' : ' empty');
  $('#saveBtn').disabled = parseAmountInput(draft.amountStr) <= 0;
}

function keypadPress(k) {
  let s = draft.amountStr;
  if (k === 'del') {
    s = s.slice(0, -1);
  } else if (k === '.') {
    if (s.indexOf('.') < 0) s = (s || '0') + '.';
  } else {
    const dot = s.indexOf('.');
    if (dot >= 0 && s.length - dot - 1 >= 2) return;
    if (dot < 0 && s.replace('.', '').length >= 7) return;
    if (s === '0') s = '';
    s = s + k;
    if (parseFloat(s) > MAX_AMOUNT) s = String(MAX_AMOUNT);
  }
  draft.amountStr = s;
  renderAmount();
}

/* ---------------- 保存一笔 ---------------- */
function addExpense() {
  const amount = parseAmountInput(draft.amountStr);
  if (amount <= 0) return;

  const note = $('#noteInput').value.trim().slice(0, 30);
  const date = clampDate($('#dateInput').value || todayStr());
  const cat = catById(draft.catId) || catById('other');

  state.expenses.push({
    id: uid(), amount: amount, catId: cat.id, type: 'expense',
    note: note, date: date, createdAt: Date.now()
  });
  state.settings.balance = Math.round((state.settings.balance - amount) * 100) / 100;
  save();

  draft.amountStr = '';
  draft.date = todayStr();
  draft.note = '';
  $('#noteInput').value = '';
  $('#dateInput').value = todayStr();
  renderAmount();
  renderBudget();
  renderLog();
  renderSettings();

  toast('已记 ' + money(amount) + ' · ' + cat.name);
}

/* ---------------- 渲染：记录 ---------------- */
function renderLog() {
  const box = $('#logList');
  $('#logTotal').textContent = state.expenses.length ? state.expenses.length + ' 笔记录' : '';
  const now = new Date();
  const todayCycle = currentCycle();
  renderAnalytics(todayCycle);
  const groups = [];
  for (let i = 0; i < logMonthCount; i++) {
    const base = cycleStartFor(now, state.settings.cycleStartDay);
    const month = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const start = new Date(month.getFullYear(), month.getMonth(),
      Math.min(state.settings.cycleStartDay, daysInMonth(month.getFullYear(), month.getMonth())));
    const cycle = cycleOf(start, state.settings.cycleStartDay);
    const key = ymd(cycle.start);
    const endKey = ymd(cycle.end);
    const items = state.expenses
      .filter(e => e.date >= key && e.date < endKey)
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1)));
    const totals = items.reduce((sum, e) => {
      const type = e.type || 'expense';
      if (type === 'income') sum.income += e.amount;
      else if (type === 'reduction') sum.reduction += e.amount;
      else sum.expense += e.amount;
      return sum;
    }, { expense: 0, income: 0, reduction: 0 });
    groups.push({
      key: key,
      label: cycleRangeLabel(cycle),
      items: items,
      totals: totals
    });
  }
  box.innerHTML = groups.map(g => {
    const rows = g.items.length
      ? g.items.map(e => {
        const type = e.type || 'expense';
        const c = catById(e.catId) || { emoji: '📦', color: '#8E8E93', name: '其他' };
        const label = type === 'income' ? '生活费到账' : (type === 'reduction' ? '减少余额' : c.name);
        const symbol = type === 'income' ? '+' : '−';
        const amountClass = type === 'income' ? ' income' : (type === 'reduction' ? ' reduction' : ' expense');
        const icon = type === 'income' ? '＋' : (type === 'reduction' ? '−' : c.emoji);
        const iconColor = type === 'income' ? 'var(--green)' : (type === 'reduction' ? 'var(--orange)' : c.color);
        return '<div class="exp-row" data-id="' + esc(e.id) + '">' +
          '<div class="exp-ico" style="background:color-mix(in srgb, ' + iconColor + ' 14%, transparent);color:' + iconColor + '">' + esc(icon) + '</div>' +
          '<div class="exp-mid"><div class="exp-name">' + esc(label) + '</div>' +
          (e.note ? '<div class="exp-note">' + esc(e.note) + '</div>' : '') + '</div>' +
          '<div class="exp-right"><div class="exp-amt' + amountClass + '">' + symbol + money(e.amount) + '</div>' +
          '<div class="exp-date">' + e.date.slice(5).replace('-', '/') + '</div></div></div>';
      }).join('')
      : '<div class="empty-tip">' + (g.key === todayCycle.startKey ? '本期还没有记录' : '这个账期没有记录') + '</div>';
    return '<div class="month-group"><div class="month-head"><span>' + g.label + '</span>' +
      '<span class="msum">' + g.items.length + ' 笔</span></div>' +
      (g.items.length ? '<div class="month-summary"><span>支出 ' + money(g.totals.expense) + '</span>' +
        '<span>加钱 <b class="income">+' + money(g.totals.income) + '</b></span>' +
        '<span>减钱 <b class="reduction">−' + money(g.totals.reduction) + '</b></span></div>' : '') + rows + '</div>';
  }).join('');

  const earliest = state.expenses.reduce((m, e) => (m === null || e.date < m ? e.date : m), null);
  const shown = groups[groups.length - 1].key;
  $('#loadMoreMonths').classList.toggle('hidden', !(earliest && earliest < shown));
}

function renderAnalytics(cycle) {
  const cycleLabel = cycleRangeLabel(cycle);
  $('#analyticsPeriod').textContent = cycleLabel + ' · 当前账单周期';
  const items = expensesInCycle(cycle);
  const total = Math.round(items.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
  $('#pieTotal').textContent = money(total);
  const totals = {};
  items.forEach(e => { totals[e.catId] = (totals[e.catId] || 0) + e.amount; });
  const categories = Object.keys(totals).map(id => ({
    category: catById(id) || { name: '其他', color: '#8E8E93', emoji: '📦' },
    total: totals[id]
  })).sort((a, b) => b.total - a.total);
  const pie = $('#expensePie');
  if (total > 0) {
    let degree = 0;
    const segments = categories.map(item => {
      const end = degree + item.total / total * 360;
      const segment = item.category.color + ' ' + degree.toFixed(2) + 'deg ' + end.toFixed(2) + 'deg';
      degree = end;
      return segment;
    });
    pie.style.background = 'conic-gradient(' + segments.join(',') + ')';
    pie.setAttribute('aria-label', '本期支出分类占比，共 ' + money(total));
  } else {
    pie.style.background = 'conic-gradient(var(--line) 0deg 360deg)';
    pie.setAttribute('aria-label', '本期暂无支出');
  }
  $('#pieLegend').innerHTML = categories.length ? categories.map(item => {
    const pct = item.total / total * 100;
    return '<div class="pie-legend-row"><span class="pie-dot" style="background:' + esc(item.category.color) + '"></span>' +
      '<span class="pie-legend-name">' + esc(item.category.name) + '</span>' +
      '<span class="pie-legend-value">' + pct.toFixed(pct < 10 ? 1 : 0) + '% · ' + money(item.total) + '</span></div>';
  }).join('') : '<div class="analytics-empty">本账期还没有支出</div>';

  const byDay = {};
  items.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + e.amount; });
  const days = Object.keys(byDay).sort().reverse();
  const max = days.reduce((m, key) => Math.max(m, byDay[key]), 0);
  $('#dailySpendCount').textContent = days.length ? days.length + ' 天有支出' : '';
  $('#dailySpendList').innerHTML = days.length ? days.map(key => {
    const date = new Date(key + 'T12:00:00');
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    const label = key === todayStr() ? '今天' : ((date.getMonth() + 1) + '月' + date.getDate() + '日 周' + weekday);
    const width = Math.max(4, byDay[key] / max * 100);
    return '<div class="daily-spend-row"><span class="daily-date">' + label + '</span>' +
      '<span class="daily-track"><i style="width:' + width.toFixed(1) + '%"></i></span>' +
      '<strong class="daily-amount">' + money(byDay[key]) + '</strong></div>';
  }).join('') : '<div class="analytics-empty">本账期还没有每日支出</div>';
}

/* ---------------- 记录：编辑 ---------------- */
function openExpenseSheet(id) {
  const e = state.expenses.filter(x => x.id === id)[0];
  if (!e) return;
  const type = e.type || 'expense';
  const isExpense = type === 'expense';
  const cats = visibleCategories();
  const state_ = { catId: e.catId };
  openSheet(
    '<h2>编辑记录</h2>' +
    '<div class="field"><label>金额</label>' +
    '<input class="amount-lg" id="edAmount" type="number" inputmode="decimal" step="0.01" min="0.01" value="' + e.amount + '" /></div>' +
    (isExpense ? '<div class="field"><label>分类</label><div class="chips" id="edCats">' +
    cats.map(c => '<button class="chip' + (c.id === e.catId ? ' on' : '') + '" data-cat="' + esc(c.id) + '">' +
      '<span class="ce">' + esc(c.emoji) + '</span>' + esc(c.name) + '</button>').join('') +
    '</div></div>' : '') +
    '<div class="field"><label>日期</label><input id="edDate" type="date" max="' + todayStr() + '" value="' + e.date + '" /></div>' +
    '<div class="field"><label>备注</label><input id="edNote" type="text" maxlength="30" value="' + esc(e.note) + '" /></div>' +
    '<div class="btn-row"><button class="btn-mini danger" id="edDel" style="padding:14px 16px">删除</button>' +
    '<button class="btn-primary" id="edSave">保存</button></div>'
  );
  if (isExpense) $('#edCats').addEventListener('click', ev => {
    const b = ev.target.closest('.chip');
    if (!b) return;
    state_.catId = b.getAttribute('data-cat');
    $$('.chip', $('#edCats')).forEach(x => x.classList.toggle('on', x === b));
  });
  $('#edSave').onclick = () => {
    const amt = parseAmountInput($('#edAmount').value);
    if (amt <= 0) { toast('请输入大于 0 的金额'); return; }
    state.settings.balance = Math.round((state.settings.balance + balanceEffect({ type: type, amount: amt }) - balanceEffect(e)) * 100) / 100;
    e.amount = amt;
    if (isExpense) e.catId = state_.catId;
    e.date = clampDate($('#edDate').value || e.date);
    e.note = $('#edNote').value.trim().slice(0, 30);
    save();
    closeSheet();
    renderAll();
    toast('已更新');
  };
  $('#edDel').onclick = () => {
    confirmModal({
      title: '删除这笔记录？',
      body: money(e.amount) + ' · ' + esc((catById(e.catId) || {}).name || '') + ' · ' + e.date + '，删除后无法恢复。',
      okText: '删除', danger: true
    }).then(ok => {
      if (!ok) return;
      state.expenses = state.expenses.filter(x => x.id !== e.id);
      state.settings.balance = Math.round((state.settings.balance - balanceEffect(e)) * 100) / 100;
      save();
      closeSheet();
      renderAll();
      toast('已删除');
    });
  };
}

/* ---------------- 渲染：设置 ---------------- */
function renderSettings() {
  const s = state.settings;
  $('#balanceCurrent').textContent = '当前 ' + money(s.balance);
  $$('#balanceAdjustMode button').forEach(b => {
    const selected = b.getAttribute('data-mode') === balanceAdjustMode;
    b.classList.toggle('on', selected);
    b.setAttribute('aria-pressed', String(selected));
  });
  $('#applyBalanceAdjustment').textContent = balanceAdjustMode === 'add' ? '添加生活费' : '确认减少余额';

  const sel = $('#setCycle');
  if (!sel.options.length) {
    sel.innerHTML = CYCLE_DAYS.map(d => '<option value="' + d + '">每月 ' + d + ' 号</option>').join('');
  }
  sel.value = String(s.cycleStartDay);
  const cy = currentCycle();
  $('#cycleHint').textContent = '当前账单周期：' + cy.startKey + ' 至 ' +
    ymd(new Date(new Date(cy.endKey).getTime() - 86400000)) + '，共 ' + cy.daysLeft + ' 天剩余。';

  $('#catList').innerHTML = s.categories.map(c =>
    '<div class="cat-row" data-id="' + esc(c.id) + '">' +
    '<span class="cat-handle" aria-label="拖动排序">☰</span>' +
    '<div class="cat-dot" style="background:' + esc(c.color) + '22">' + esc(c.emoji) + '</div>' +
    '<div class="cat-name">' + esc(c.name) +
    '<div class="cat-tag">' + (c.builtin ? '内置' : '自定义') + (c.hidden ? ' · 已隐藏' : '') + '</div></div>' +
    '<div class="cat-acts">' +
    '<button class="btn-mini" data-act="edit">编辑</button>' +
    '<button class="btn-mini" data-act="hide">' + (c.hidden ? '显示' : '隐藏') + '</button>' +
    (c.builtin ? '' : '<button class="btn-mini danger" data-act="del">删除</button>') +
    '</div></div>'
  ).join('');

  const hint = $('#backupHint');
  if (state.expenses.length === 0) {
    hint.classList.add('hidden');
  } else if (!s.lastBackupAt) {
    hint.classList.remove('hidden');
    hint.textContent = '还没有导出过备份。数据只在这台设备上，建议现在导出一份。';
  } else {
    const d = daysBetween(new Date(s.lastBackupAt), new Date());
    if (d >= BACKUP_STALE_DAYS) {
      hint.classList.remove('hidden');
      hint.textContent = '已经 ' + d + ' 天没备份了，建议导出一次。';
    } else {
      hint.classList.add('hidden');
    }
  }

  $('#verText').textContent = '省钱记 v' + APP_VERSION;
  $('#storageState').textContent = storageOK
    ? '本地存储：正常'
    : '⚠️ 本地存储不可用（可能是无痕浏览），数据无法保存，请用普通窗口打开。';
  $('#storageState').className = storageOK ? 'hint' : 'hint warn';
}

/* ---------------- 分类编辑 ---------------- */
function openCategorySheet(id) {
  const isNew = !id;
  const c = isNew
    ? { id: uid(), name: '', emoji: '📦', color: '#34C759', builtin: false, hidden: false }
    : Object.assign({}, catById(id));
  if (!c) return;
  const sel = { emoji: c.emoji, color: c.color };

  openSheet(
    '<h2>' + (isNew ? '新增分类' : '编辑分类') + '</h2>' +
    '<div class="field"><label>名称</label><input id="cName" type="text" maxlength="8" value="' + esc(c.name) + '" placeholder="如：咖啡" /></div>' +
    (isNew ? '' :
      '<div class="field"><label>顺序</label><div class="btn-row" style="margin-top:2px">' +
      '<button class="btn-mini" id="cUp" style="flex:1;padding:12px">↑ 上移</button>' +
      '<button class="btn-mini" id="cDown" style="flex:1;padding:12px">↓ 下移</button>' +
      '</div></div>') +
    '<div class="field"><label>图标</label><div class="emoji-grid" id="cEmoji">' +
    EMOJIS.map(x => '<button data-e="' + x + '" class="' + (x === c.emoji ? 'on' : '') + '">' + x + '</button>').join('') +
    '</div></div>' +
    '<div class="field"><label>颜色</label><div class="swatches" id="cColor">' +
    SWATCHES.map(x => '<button data-c="' + x + '" class="' + (x === c.color ? 'on' : '') + '" style="background:' + x + '"></button>').join('') +
    '</div></div>' +
    '<div class="btn-row">' +
    (isNew ? '' : '<button class="btn-mini danger" id="cDel" style="padding:14px 16px">删除</button>') +
    '<button class="btn-primary" id="cSave">保存</button></div>'
  );
  $('#cEmoji').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    sel.emoji = b.getAttribute('data-e');
    $$('button', $('#cEmoji')).forEach(x => x.classList.toggle('on', x === b));
  });
  $('#cColor').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    sel.color = b.getAttribute('data-c');
    $$('button', $('#cColor')).forEach(x => x.classList.toggle('on', x === b));
  });
  $('#cSave').onclick = () => {
    const name = $('#cName').value.trim().slice(0, 8);
    if (!name) { toast('请填名称'); return; }
    if (isNew) {
      state.settings.categories.push({ id: c.id, name: name, emoji: sel.emoji, color: sel.color, builtin: false, hidden: false });
    } else {
      const target = catById(c.id);
      target.name = name;
      target.emoji = sel.emoji;
      target.color = sel.color;
    }
    save();
    closeSheet();
    renderAll();
    toast('已保存');
  };
  if (!isNew) {
    $('#cDel').onclick = () => deleteCategory(c.id);
    const idx = state.settings.categories.findIndex(x => x.id === c.id);
    const upBtn = $('#cUp');
    const downBtn = $('#cDown');
    if (idx <= 0) upBtn.disabled = true;
    if (idx >= state.settings.categories.length - 1) downBtn.disabled = true;
    upBtn.onclick = () => { moveCategory(c.id, -1); closeSheet(); };
    downBtn.onclick = () => { moveCategory(c.id, 1); closeSheet(); };
  }
}

function deleteCategory(id) {
  const c = catById(id);
  if (!c) return Promise.resolve(false);
  if (c.builtin) {
    toast('内置分类不能删除，可以改为隐藏');
    return Promise.resolve(false);
  }
  const n = state.expenses.filter(e => e.catId === id).length;
  return confirmModal({
    title: '删除分类「' + esc(c.name) + '」？',
    body: n > 0
      ? '该分类下有 <b>' + n + '</b> 笔记录，删除后这些记录会归入「其他」。'
      : '该分类下暂无记录。',
    okText: '删除', danger: true
  }).then(ok => {
    if (!ok) return false;
    state.expenses.forEach(e => { if (e.catId === id) e.catId = 'other'; });
    state.settings.categories = state.settings.categories.filter(x => x.id !== id);
    if (draft.catId === id) draft.catId = 'other';
    save();
    closeSheet();
    renderAll();
    toast('已删除分类');
    return true;
  });
}

/** 上移/下移一个分类 */
function moveCategory(id, delta) {
  const list = state.settings.categories;
  const i = list.findIndex(c => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  const tmp = list[i];
  list[i] = list[j];
  list[j] = tmp;
  save();
  renderAll();
  toast(delta < 0 ? '已上移' : '已下移');
}

/** 按住 ☰ 拖动排序（Pointer Events，兼容 iOS Safari） */
function initCatDrag() {
  const list = $('#catList');
  let dragRow = null;
  let pointerId = null;
  let lastY = 0;

  list.addEventListener('pointerdown', ev => {
    const handle = ev.target.closest ? ev.target.closest('.cat-handle') : null;
    if (!handle) return;
    dragRow = handle.closest('.cat-row');
    if (!dragRow) return;
    pointerId = ev.pointerId;
    lastY = ev.clientY;
    dragRow.classList.add('dragging');
    try { handle.setPointerCapture(pointerId); } catch (e) { /* 合成事件可能不支持 */ }
    ev.preventDefault();
  });

  list.addEventListener('pointermove', ev => {
    if (!dragRow || ev.pointerId !== pointerId) return;
    ev.preventDefault();
    const dy = ev.clientY - lastY;
    dragRow.style.transform = dy ? 'translateY(' + dy + 'px)' : '';

    let target = null;
    const rows = $$('.cat-row', list);
    for (let k = 0; k < rows.length; k++) {
      if (rows[k] === dragRow) continue;
      const rect = rows[k].getBoundingClientRect();
      if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) { target = rows[k]; break; }
    }
    if (target) {
      const rect = target.getBoundingClientRect();
      const after = ev.clientY > rect.top + rect.height / 2;
      list.insertBefore(dragRow, after ? target.nextSibling : target);
      lastY = ev.clientY;
      dragRow.style.transform = '';
    }
  });

  const finish = () => {
    if (!dragRow) return;
    dragRow.classList.remove('dragging');
    dragRow.style.transform = '';
    dragRow = null;
    pointerId = null;
    persistCategoryOrder();
  };
  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);
}

/** 把界面上的顺序写回数据 */
function persistCategoryOrder() {
  const ids = $$('.cat-row', $('#catList')).map(r => r.getAttribute('data-id'));
  const byId = {};
  state.settings.categories.forEach(c => { byId[c.id] = c; });
  const next = [];
  ids.forEach(id => { if (byId[id]) next.push(byId[id]); });
  state.settings.categories.forEach(c => { if (ids.indexOf(c.id) < 0) next.push(c); });
  const changed = next.map(c => c.id).join(',') !== state.settings.categories.map(c => c.id).join(',');
  state.settings.categories = next;
  save();
  renderAll();
  if (changed) toast('分类顺序已保存');
}

/* ---------------- 数据：导出 / 导入 / 清空 ---------------- */
function exportPayload() {
  return JSON.stringify({
    app: '省钱记',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    expenses: state.expenses
  }, null, 2);
}

function backupFileName() {
  const d = new Date();
  return 'saving-tracker-backup-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
    '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json';
}

function markBackedUp() {
  state.settings.lastBackupAt = new Date().toISOString();
  save();
  renderBudget();
  renderSettings();
}

function doExport() {
  const text = exportPayload();
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    markBackedUp();
    toast('已导出 ' + state.expenses.length + ' 笔记录');
  } catch (err) {
    toast('导出失败，请改用「复制备份到剪贴板」');
  }
}

function doCopy() {
  const text = exportPayload();
  const done = () => { markBackedUp(); toast('备份已复制到剪贴板'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  $('#pasteArea').classList.remove('hidden');
  const ta = $('#pasteText');
  ta.value = text;
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('请手动长按全选复制'); }
}

function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error('不是合法的 JSON 文本'); }
  if (!obj || typeof obj !== 'object') throw new Error('内容不是对象');
  if (Number(obj.version) > 1) throw new Error('备份来自更新版本（v' + obj.version + '）');
  if (!Array.isArray(obj.expenses)) throw new Error('缺少 expenses 数组');
  return normalizeState(obj);
}

function applyImport(text, mode) {
  let incoming;
  try { incoming = parseBackup(text); } catch (err) {
    alertModal('导入失败', esc(err.message) + '<br>请确认选择的是「省钱记」导出的备份文件。', '好');
    return;
  }
  if (!incoming.expenses.length) {
    alertModal('导入失败', '备份里没有任何记录。', '好');
    return;
  }
  const n = incoming.expenses.length;
  confirmModal({
    title: mode === 'replace' ? '替换全部数据？' : '合并数据？',
    body: mode === 'replace'
      ? '将用备份里的 <b>' + n + '</b> 笔记录<b>替换</b>当前全部数据，当前数据会被清掉。'
      : '将把备份里的 <b>' + n + '</b> 笔记录合并进来（相同 id 的记录会跳过）。',
    okText: mode === 'replace' ? '替换' : '合并',
    danger: mode === 'replace'
  }).then(ok => {
    if (!ok) return;
    if (mode === 'replace') {
      state = incoming;
    } else {
      const useIncomingBalance = state.expenses.length === 0 && state.settings.balance === 0;
      const have = {};
      state.expenses.forEach(e => { have[e.id] = true; });
      const existingCats = {};
      state.settings.categories.forEach(c => { existingCats[c.id] = true; });
      incoming.settings.categories.forEach(c => {
        if (!existingCats[c.id]) state.settings.categories.push(c);
      });
      const added = incoming.expenses.filter(e => !have[e.id]);
      added.forEach(e => state.expenses.push(e));
      if (useIncomingBalance) state.settings.balance = incoming.settings.balance;
      else state.settings.balance = Math.round((state.settings.balance + added.reduce((sum, e) => sum + balanceEffect(e), 0)) * 100) / 100;
    }
    save();
    logMonthCount = 1;
    renderAll();
    toast('导入完成，共 ' + state.expenses.length + ' 笔记录');
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('文件读取失败'));
    fr.readAsText(file);
  });
}

function doClear() {
  openModal(
    '<h2>清空全部数据</h2>' +
    '<p class="modal-body">这会删除本机上的所有记录和设置，且无法恢复。<br>请输入 <b>删除</b> 两个字确认。</p>' +
    '<div class="field"><input id="clearWord" type="text" placeholder="删除" /></div>' +
    '<div class="btn-row"><button class="btn-mini" id="mCancel" style="flex:1;padding:13px">取消</button>' +
    '<button class="btn-primary danger" id="mOk">确认清空</button></div>'
  );
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = () => {
    if ($('#clearWord').value.trim() !== '删除') { toast('请输入「删除」两个字'); return; }
    state = defaultState();
    draft.amountStr = '';
    draft.catId = 'food';
    draft.date = todayStr();
    logMonthCount = 1;
    save();
    closeModal();
    renderAll();
    toast('已清空全部数据');
  };
}

/* ---------------- 视图切换 ---------------- */
function setTab(name) {
  $$('#tabbar .tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-view') === name));
  $('#view-add').classList.toggle('hidden', name !== 'add');
  $('#view-log').classList.toggle('hidden', name !== 'log');
  $('#view-settings').classList.toggle('hidden', name !== 'settings');
  window.scrollTo(0, 0);
}

function renderAll() {
  renderHeader();
  renderBudget();
  renderChips();
  renderAmount();
  renderLog();
  renderSettings();
  renderInstallTip();
}

/* ---------------- 事件绑定 ---------------- */
function bind() {
  $('#keypad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']
    .map(k => '<button data-k="' + k + '"' + (k === 'del' ? ' class="del"' : '') + '>' +
      (k === 'del' ? '⌫' : k) + '</button>').join('');

  $('#keypad').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (b) keypadPress(b.getAttribute('data-k'));
  });
  $('#saveBtn').onclick = addExpense;

  $('#catChips').addEventListener('click', ev => {
    const b = ev.target.closest('.chip');
    if (!b) return;
    draft.catId = b.getAttribute('data-cat');
    renderChips();
  });

  $('#dateInput').value = todayStr();
  $('#dateInput').max = todayStr();
  $('#dateInput').onchange = () => {
    if ($('#dateInput').value > todayStr()) $('#dateInput').value = todayStr();
  };
  $('#noteInput').oninput = () => { draft.note = $('#noteInput').value; };

  $('#tabbar').addEventListener('click', ev => {
    const b = ev.target.closest('.tab');
    if (b) setTab(b.getAttribute('data-view'));
  });

  $('#logList').addEventListener('click', ev => {
    const row = ev.target.closest('.exp-row');
    if (row) openExpenseSheet(row.getAttribute('data-id'));
  });
  $('#loadMoreMonths').onclick = () => {
    logMonthCount += 3;
    renderLog();
  };

  /* 设置项 */
  $('#balanceAdjustMode').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-mode]');
    if (!b) return;
    balanceAdjustMode = b.getAttribute('data-mode');
    renderSettings();
  });
  $('#applyBalanceAdjustment').addEventListener('click', () => {
    const amount = parseMoneyInput($('#balanceAdjustAmount').value);
    if (amount <= 0) { toast('请输入大于 0 的调整金额'); return; }
    const current = state.settings.balance;
    if (balanceAdjustMode === 'add' && current + amount > MAX_AMOUNT) {
      toast('调整后余额不能超过 ' + money(MAX_AMOUNT));
      return;
    }
    if (balanceAdjustMode === 'subtract' && amount > current) {
      toast('减少金额不能超过当前余额');
      return;
    }
    const type = balanceAdjustMode === 'add' ? 'income' : 'reduction';
    const entry = {
      id: uid(), amount: amount, catId: 'other', type: type,
      note: '',
      date: todayStr(), createdAt: Date.now()
    };
    state.expenses.push(entry);
    state.settings.balance = Math.round((current + balanceEffect(entry)) * 100) / 100;
    save();
    $('#balanceAdjustAmount').value = '';
    renderBudget();
    renderSettings();
    renderLog();
    toast((balanceAdjustMode === 'add' ? '已添加生活费 ' : '已减少余额 ') + money(amount) + '，当前余额 ' + money(state.settings.balance));
  });
  $('#setCycle').addEventListener('change', () => {
    state.settings.cycleStartDay = Number($('#setCycle').value);
    save();
    renderAll();
    toast('账单起始日已改为每月 ' + state.settings.cycleStartDay + ' 号');
  });

  $('#catList').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const id = ev.target.closest('.cat-row').getAttribute('data-id');
    const act = b.getAttribute('data-act');
    if (act === 'edit') openCategorySheet(id);
    if (act === 'hide') {
      const c = catById(id);
      const shown = visibleCategories().length;
      if (!c.hidden && shown <= 1) { toast('至少保留一个显示的分类'); return; }
      c.hidden = !c.hidden;
      if (c.hidden && draft.catId === c.id) {
        const f = visibleCategories()[0];
        draft.catId = f ? f.id : 'other';
      }
      save();
      renderAll();
    }
    if (act === 'del') deleteCategory(id);
  });
  $('#addCatBtn').onclick = () => openCategorySheet(null);
  initCatDrag();

  /* 数据 */
  $('#exportBtn').onclick = doExport;
  $('#copyBtn').onclick = doCopy;
  $('#pasteToggle').onclick = () => $('#pasteArea').classList.toggle('hidden');
  $('#pasteMerge').onclick = () => {
    const t = $('#pasteText').value.trim();
    if (!t) { toast('请先粘贴备份内容'); return; }
    applyImport(t, 'merge');
  };
  $('#pasteReplace').onclick = () => {
    const t = $('#pasteText').value.trim();
    if (!t) { toast('请先粘贴备份内容'); return; }
    applyImport(t, 'replace');
  };
  $('#importFileBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = ev => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    readFileAsText(f).then(t => applyImport(t, 'merge'), err => toast(err.message));
  };
  $('#clearBtn').onclick = doClear;

  /* 浮层关闭 */
  document.addEventListener('click', ev => {
    const m = ev.target.closest('[data-close]');
    if (!m) return;
    const which = m.getAttribute('data-close');
    if (which === 'sheet') closeSheet();
    if (which === 'modal') {
      const r = modalResolver;
      closeModal();
      if (r) r();
    }
  });
}

/* ---------------- Service Worker ---------------- */
function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** iOS Safari 首次访问时提示「添加到主屏幕」，装上或手动关掉后不再出现 */
function renderInstallTip() {
  const el = $('#installTip');
  if (!el) return;
  let dismissed = false;
  try { dismissed = localStorage.getItem('savetracker.tip') === 'off'; } catch (e) { /* 忽略 */ }
  if (!isIOS() || isStandalone() || dismissed) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  $('#installTipClose').onclick = () => {
    try { localStorage.setItem('savetracker.tip', 'off'); } catch (e) { /* 忽略 */ }
    el.classList.add('hidden');
  };
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  $('#updateBtn').onclick = () => window.location.reload();
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            $('#updateBar').classList.remove('hidden');
          }
        });
      });
    }).catch(err => console.warn('SW 注册失败', err));
  });
}

/* ---------------- 启动 ---------------- */
load();
bind();
renderAll();
registerSW();

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderAll();
});

