/**
 * 省钱记 端到端自检脚本（零依赖）
 *
 * 用本机已安装的 Edge/Chrome 打开本地站点，通过 DevTools 协议跑一遍核心流程。
 * 用法：
 *   1) 起静态服务： python -m http.server 8000
 *   2) 起浏览器：   msedge.exe --headless=new --remote-debugging-port=9222 --user-data-dir=<临时目录> about:blank
 *   3) node tools/e2e.mjs http://127.0.0.1:8000/ 9222
 */

const BASE = process.argv[2] || 'http://127.0.0.1:8000/';
const PORT = Number(process.argv[3] || 9222);
const ORIGIN = new URL(BASE).origin;

/* ---------------- DevTools 协议最小客户端 ---------------- */
async function pickTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (e) { /* 浏览器还没起来 */ }
    await sleep(250);
  }
  throw new Error('连不上浏览器调试端口 ' + PORT);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let seq = 0;
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
        else p.res(msg.result);
      }
    };
    ws.onerror = () => reject(new Error('WebSocket 连接失败'));
    ws.onopen = () => resolve({
      send(method, params) {
        return new Promise((res, rej) => {
          const id = ++seq;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
      },
      close() { ws.close(); }
    });
  });
}

/* ---------------- 断言 ---------------- */
const results = [];
let failed = 0;

function ok(name, pass, detail) {
  results.push((pass ? '  ✅ ' : '  ❌ ') + name + (pass ? '' : '  → ' + detail));
  if (!pass) failed++;
}

async function group(name, fn) {
  console.log('\n' + name);
  try {
    await fn();
  } catch (e) {
    ok(name + ' 执行异常', false, e.message);
  }
}

function parseMoney(text) {
  return Number(String(text).replace(/[^\d.-]/g, ''));
}

/** 等某个元素的文字变成期望值（首页「还剩」是滚动动画） */
async function waitText(sel, expected, timeout) {
  const limit = timeout || 2000;
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < limit) {
    last = await evaluate('window.__t.txt("' + sel + '")');
    if (last === expected) return true;
    await sleep(60);
  }
  return last;
}

/* ---------------- 主流程 ---------------- */
const target = await pickTarget();
const cdp = await connect(target.webSocketDebuggerUrl);
const { send } = cdp;

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 3, mobile: true
});

async function evaluate(expr, awaitPromise) {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: awaitPromise !== false,
    userGesture: true
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error('页面异常: ' + ((d.exception && d.exception.description) || d.text));
  }
  return r.result.value;
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const st = await evaluate('document.readyState');
      if (st === 'complete') return true;
    } catch (e) { /* 导航中 */ }
    await sleep(200);
  }
  throw new Error('页面加载超时');
}

async function reload() {
  await send('Page.reload', { ignoreCache: false });
  await sleep(300);
  await waitReady();
  await sleep(200);
  await installHelpers();
}

async function installHelpers() {
  await evaluate(`window.__t = {
    q: s => document.querySelector(s),
    click: s => { const e = document.querySelector(s); if (!e) throw new Error('找不到元素 ' + s); e.click(); },
    key: k => { const e = document.querySelector('#keypad button[data-k="' + k + '"]');
               if (!e) throw new Error('找不到按键 ' + k); e.click(); },
    type: (s, v) => { const e = document.querySelector(s); e.value = v;
               e.dispatchEvent(new Event('input', { bubbles: true }));
               e.dispatchEvent(new Event('change', { bubbles: true })); },
    txt: s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; },
    cls: s => { const e = document.querySelector(s); return e ? e.className : null; },
    shown: s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') &&
               e.getBoundingClientRect().height > 0; }
  }; true`);
}

console.log('目标：' + BASE);
await send('Page.navigate', { url: BASE });
await waitReady();
await evaluate('localStorage.clear(); sessionStorage.clear(); true');
await reload();

/* ---------- 1. 初始状态 ---------- */
await group('1. 初始状态', async () => {
  ok('键盘有 12 个按钮', await evaluate('document.querySelectorAll("#keypad button").length') === 12);
  ok('预置 7 个分类', await evaluate('document.querySelectorAll("#catChips .chip").length') === 7);
  ok('第一个分类是餐饮', (await evaluate('window.__t.txt("#catChips .chip")')).indexOf('餐饮') >= 0);
  ok('金额显示为 0', await evaluate('window.__t.txt("#amountText")') === '0');
  ok('保存按钮置灰', await evaluate('window.__t.q("#saveBtn").disabled') === true);
  ok('已花 ¥0.00', await evaluate('window.__t.txt("#bcSpent")') === '¥0.00');
  ok('未设可用金额时「还剩」显示 —', await evaluate('window.__t.txt("#bcLeft")') === '—');
  ok('提示去设置可用金额', (await evaluate('window.__t.txt("#bcHint")')).indexOf('还没设置每月可用金额') >= 0);
  ok('记录页显示空态', (await evaluate('window.__t.txt("#logList")')).indexOf('本月还没有记录') >= 0);
});

/* ---------- 2. 键盘输入规则 ---------- */
await group('2. 键盘输入规则', async () => {
  await evaluate('window.__t.key("1"); window.__t.key("2"); window.__t.key("."); window.__t.key("5"); true');
  ok('输入 12.5 显示 12.5', await evaluate('window.__t.txt("#amountText")') === '12.5');
  await evaluate('window.__t.key("0"); true');
  ok('补零后 12.50', await evaluate('window.__t.txt("#amountText")') === '12.50');
  await evaluate('window.__t.key("."); window.__t.key("3"); window.__t.key("9"); true');
  ok('第二个小数点被忽略', await evaluate('window.__t.txt("#amountText")') === '12.50');
  await evaluate('window.__t.key("del"); true');
  ok('退格后 12.5', await evaluate('window.__t.txt("#amountText")') === '12.5');
  await evaluate('window.__t.key("0"); true');
  ok('保存按钮可用', await evaluate('window.__t.q("#saveBtn").disabled') === false);
  await evaluate('window.__t.key("del"); window.__t.key("del"); window.__t.key("del"); window.__t.key("del"); window.__t.key("del"); true');
  ok('退格到底显示 0', await evaluate('window.__t.txt("#amountText")') === '0');
  ok('清空后按钮置灰', await evaluate('window.__t.q("#saveBtn").disabled') === true);
});

/* ---------- 3. 记一笔 ---------- */
await group('3. 记一笔', async () => {
  await evaluate('window.__t.key("1"); window.__t.key("2"); window.__t.key("."); window.__t.key("5"); window.__t.key("0"); true');
  await evaluate('window.__t.type("#noteInput", "午饭"); true');
  await evaluate('window.__t.click("#saveBtn"); true');
  ok('写入 1 笔记录', await evaluate('state.expenses.length') === 1);
  ok('金额 12.5', await evaluate('state.expenses[0].amount') === 12.5);
  ok('分类为餐饮', await evaluate('state.expenses[0].catId') === 'food');
  ok('备注已保存', await evaluate('state.expenses[0].note') === '午饭');
  ok('日期为今天', await evaluate('state.expenses[0].date') === todayStr());
  ok('金额已清零', await evaluate('window.__t.txt("#amountText")') === '0');
  ok('保存后按钮置灰', await evaluate('window.__t.q("#saveBtn").disabled') === true);
  ok('Toast 提示已记 12.50', (await evaluate('window.__t.txt("#toast")')).indexOf('已记 ¥12.50 · 餐饮') >= 0);
  ok('预算卡更新为 ¥12.50', await evaluate('window.__t.txt("#bcSpent")') === '¥12.50');
  ok('记录页出现餐饮条目', (await evaluate('window.__t.txt("#logList")')).indexOf('餐饮') >= 0);
  ok('本月合计 12.50', (await evaluate('window.__t.txt("#logList")')).indexOf('¥12.50') >= 0);
});

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------- 4. 设置预算 ---------- */
await group('4. 设置月预算', async () => {
  await evaluate('window.__t.type("#setBudget", "100"); true');
  ok('预算写入 100', await evaluate('state.settings.budget') === 100);
  ok('首页大字变成「还剩」', await waitText('#bcLeft', '¥87.50') === true,
    await evaluate('window.__t.txt("#bcLeft")'));
  ok('标签写明本月还剩', (await evaluate('window.__t.txt("#bcPeriod")')).indexOf('本月还剩') >= 0);
  const spent = parseMoney(await evaluate('window.__t.txt("#bcSpent")'));
  const left = parseMoney(await evaluate('window.__t.txt("#bcLeft")'));
  ok('已花 + 剩余 = 预算', Math.abs(spent + left - 100) < 0.001, spent + ' + ' + left);
  ok('剩余 ¥87.50', await evaluate('window.__t.txt("#bcLeft")') === '¥87.50');
  const days = Number((await evaluate('window.__t.txt("#bcDays")')).replace(/[^\d]/g, ''));
  ok('剩余天数 1-31', days >= 1 && days <= 31, String(days));
  const daily = parseMoney(await evaluate('window.__t.txt("#bcDaily")'));
  ok('日均可用 = 剩余 ÷ 天数', Math.abs(daily - Math.round((left / days) * 100) / 100) < 0.011, daily + ' vs ' + (left / days).toFixed(2));
  ok('进度条宽度反映占比', Math.abs(parseFloat(await evaluate('window.__t.q("#bcBar").style.width')) - 12.5) < 0.01);
  ok('胶囊显示已用 13%', (await evaluate('window.__t.txt("#bcPill")')).indexOf('13%') >= 0);
  ok('正常状态无横幅', await evaluate('window.__t.q("#warnBanner").classList.contains("hidden")') === true);
});

/* ---------- 5. 预警阈值 ---------- */
await group('5. 80% 预警', async () => {
  await evaluate('window.__t.key("7"); window.__t.key("0"); window.__t.click("#saveBtn"); true');
  await sleep(120);
  ok('已花 ¥82.50', await evaluate('window.__t.txt("#bcSpent")') === '¥82.50');
  ok('记一笔后「还剩」自动减到 ¥17.50', await waitText('#bcLeft', '¥17.50') === true,
    await evaluate('window.__t.txt("#bcLeft")'));
  ok('横幅为预警样式', await evaluate('window.__t.q("#warnBanner").className') === 'banner warn');
  ok('横幅文案含「注意」', (await evaluate('window.__t.txt("#warnBanner")')).indexOf('注意') >= 0);
  ok('弹出余额预警弹层', (await evaluate('window.__t.txt("#modalBody h2")')).indexOf('余额预警') >= 0);
  ok('弹层文案含 83%', (await evaluate('window.__t.txt("#modalBody")')).indexOf('83%') >= 0);
  await evaluate('window.__t.click("#mOk"); true');
  ok('弹层已关闭', await evaluate('window.__t.shown("#modal")') === false);
});

/* ---------- 6. 超支 ---------- */
await group('6. 超支告警', async () => {
  await evaluate('window.__t.key("2"); window.__t.key("0"); window.__t.click("#saveBtn"); true');
  await sleep(120);
  ok('已花 ¥102.50', await evaluate('window.__t.txt("#bcSpent")') === '¥102.50');
  ok('「还剩」数字变红', (await evaluate('window.__t.cls("#bcLeft")')).indexOf('over') >= 0);
  ok('「还剩」显示 -¥2.50', await waitText('#bcLeft', '-¥2.50') === true,
    await evaluate('window.__t.txt("#bcLeft")'));
  ok('每天可花显示已超支', await evaluate('window.__t.txt("#bcDaily")') === '已超支');
  ok('横幅为超支样式', await evaluate('window.__t.q("#warnBanner").className') === 'banner over');
  ok('横幅含超支金额', (await evaluate('window.__t.txt("#warnBanner")')).indexOf('还超了 ¥2.50') >= 0);
  ok('弹出钱花完了弹层', (await evaluate('window.__t.txt("#modalBody h2")')).indexOf('钱花完了') >= 0);
  await evaluate('window.__t.click("#mOk"); true');
  ok('进度条变红', (await evaluate('window.__t.cls("#bcBar")')).indexOf('over') >= 0);
  ok('进度条封顶 100%', parseFloat(await evaluate('window.__t.q("#bcBar").style.width')) === 100);
});

/* ---------- 7. 编辑与删除 ---------- */
await group('7. 编辑 / 删除记录', async () => {
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'log\']"); true');
  await evaluate('window.__t.click("#logList .exp-row"); true');
  ok('编辑弹层打开', await evaluate('window.__t.shown("#sheet")') === true);
  await evaluate('window.__t.type("#edAmount", "30"); window.__t.type("#edNote", "改过的备注"); true');
  await evaluate('document.querySelectorAll("#edCats .chip")[1].click(); true');
  await evaluate('window.__t.click("#edSave"); true');
  ok('弹层关闭', await evaluate('window.__t.shown("#sheet")') === false);
  ok('金额改为 30', await evaluate('state.expenses.filter(e => e.amount === 30).length') === 1);
  ok('分类改为交通', await evaluate('state.expenses.filter(e => e.catId === "transport").length') === 1);
  ok('备注已更新', await evaluate('state.expenses.filter(e => e.note === "改过的备注").length') === 1);
  ok('记录总数仍为 3', await evaluate('state.expenses.length') === 3);

  await evaluate('window.__t.click("#logList .exp-row"); true');
  await evaluate('window.__t.click("#edDel"); true');
  ok('弹出删除确认', (await evaluate('window.__t.txt("#modalBody h2")')).indexOf('删除这笔记录') >= 0);
  await evaluate('window.__t.click("#mOk"); true');
  await sleep(120);
  ok('记录减少到 2 笔', await evaluate('state.expenses.length') === 2);
});

/* ---------- 8. 回填上月不计入本月 ---------- */
await group('8. 回填上月', async () => {
  const before = await evaluate('window.__t.txt("#bcSpent")');
  const lastMonth = await evaluate(`(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); d.setDate(15);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getDate(); })()`);
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'add\']"); true');
  await evaluate('window.__t.key("9"); window.__t.key("."); window.__t.key("9"); window.__t.key("9"); true');
  await evaluate(`window.__t.type("#dateInput", "${lastMonth}"); true`);
  await evaluate('window.__t.click("#saveBtn"); true');
  ok('记录数变为 3', await evaluate('state.expenses.length') === 3);
  ok('上月记录的日期正确', await evaluate(`state.expenses.filter(e => e.date === "${lastMonth}").length`) === 1);
  ok('本月已花不变', await evaluate('window.__t.txt("#bcSpent")') === before, before + ' → ' + await evaluate('window.__t.txt("#bcSpent")'));
  ok('记录写在上月分组里', await evaluate(`state.expenses.filter(e => e.date.slice(0,7) === "${lastMonth.slice(0,7)}").length`) === 1);
});

/* ---------- 9. 加载更早的月份 ---------- */
await group('9. 加载更早的月份', async () => {
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'log\']"); true');
  ok('显示「更早的月份」按钮', await evaluate('window.__t.shown("#loadMoreMonths")') === true);
  const before = await evaluate('document.querySelectorAll("#logList .month-group").length');
  await evaluate('window.__t.click("#loadMoreMonths"); true');
  await sleep(80);
  const after = await evaluate('document.querySelectorAll("#logList .month-group").length');
  ok('月份分组增加', after > before, before + ' → ' + after);
  ok('加载后能看到上月那笔 9.99', (await evaluate('window.__t.txt("#logList")')).indexOf('9.99') >= 0);
});

/* ---------- 10. 预算周期起始日 ---------- */
await group('10. 预算周期起始日', async () => {
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'settings\']"); true');
  await evaluate('window.__t.type("#setCycle", "5"); true');
  ok('设置写入 5', await evaluate('state.settings.cycleStartDay') === 5);
  const hint = await evaluate('window.__t.txt("#cycleHint")');
  ok('周期提示按 5 号计算', /\d{4}-\d{2}-05 至 \d{4}-\d{2}-\d{2}/.test(hint), hint);
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'add\']"); true');
  ok('首页周期标签切换到跨月格式', (await evaluate('window.__t.txt("#bcPeriod")')).indexOf('/') >= 0);
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'settings\']"); true');
  await evaluate('window.__t.type("#setCycle", "1"); true');
  ok('切回 1 号', await evaluate('state.settings.cycleStartDay') === 1);
});

/* ---------- 11. 分类管理 ---------- */
await group('11. 分类管理', async () => {
  const before = await evaluate('state.settings.categories.length');
  await evaluate('window.__t.click("#addCatBtn"); true');
  await evaluate('window.__t.type("#cName", "咖啡"); true');
  await evaluate('document.querySelectorAll("#cEmoji button")[7].click(); true');
  await evaluate('document.querySelectorAll("#cColor button")[6].click(); true');
  await evaluate('window.__t.click("#cSave"); true');
  ok('新增分类成功', await evaluate('state.settings.categories.length') === before + 1);
  ok('新分类带图标和颜色', await evaluate('(state.settings.categories.filter(c => c.name === "咖啡")[0] || {}).color === "#30D158"'));

  await evaluate('window.__t.click("#tabbar .tab[data-view=\'add\']"); true');
  ok('新分类出现在首页 chips', (await evaluate('window.__t.txt("#catChips")')).indexOf('咖啡') >= 0);
  await evaluate('window.__t.click("#catChips .chip:last-child"); true');
  ok('可选中新分类', await evaluate('draft.catId === state.settings.categories.filter(c => c.name === "咖啡")[0].id'));

  await evaluate('window.__t.click("#tabbar .tab[data-view=\'settings\']"); true');
  const rows = await evaluate('document.querySelectorAll("#catList .cat-row").length');
  ok('设置页列出全部分类', rows === before + 1);
  await evaluate(`(() => { const row = Array.from(document.querySelectorAll("#catList .cat-row"))
      .find(r => r.textContent.indexOf("咖啡") >= 0);
    row.querySelector("[data-act=del]").click(); })(); true`);
  ok('弹出删除分类确认', (await evaluate('window.__t.txt("#modalBody h2")')).indexOf('删除分类') >= 0);
  await evaluate('window.__t.click("#mOk"); true');
  await sleep(120);
  ok('分类已删除', await evaluate('state.settings.categories.length') === before);

  await evaluate(`(() => { const row = Array.from(document.querySelectorAll("#catList .cat-row"))
      .find(r => r.textContent.indexOf("餐饮") >= 0);
    row.querySelector("[data-act=hide]").click(); })(); true`);
  ok('内置分类可隐藏', await evaluate('state.settings.categories.filter(c => c.id === "food")[0].hidden') === true);
  await evaluate(`(() => { const row = Array.from(document.querySelectorAll("#catList .cat-row"))
      .find(r => r.textContent.indexOf("餐饮") >= 0);
    row.querySelector("[data-act=hide]").click(); })(); true`);
  ok('可以再显示回来', await evaluate('state.settings.categories.filter(c => c.id === "food")[0].hidden') === false);
});

/* ---------- 12. 导出 ---------- */
await group('12. 导出备份', async () => {
  const payload = await evaluate('exportPayload()');
  const obj = JSON.parse(payload);
  ok('备份含 version', obj.version === 1);
  ok('备份含全部记录', obj.expenses.length === (await evaluate('state.expenses.length')));
  ok('备份含预算设置', obj.settings.budget === 100);
  const fn = await evaluate('backupFileName()');
  ok('文件名格式正确', /^saving-tracker-backup-\d{8}-\d{4}\.json$/.test(fn), fn);
});

/* ---------- 13. 导入 ---------- */
await group('13. 导入备份', async () => {
  const sample = JSON.stringify({
    app: '省钱记', version: 1,
    settings: { budget: 5000, cycleStartDay: 10, warnRatio: 0.7, categories: [], lastBackupAt: null },
    expenses: [
      { id: 'a1', amount: 11.1, catId: 'food', note: '导入1', date: todayStr(), createdAt: 1 },
      { id: 'a2', amount: 22.2, catId: '不存在的分类', note: '导入2', date: todayStr(), createdAt: 2 }
    ]
  });
  await evaluate(`applyImport(${JSON.stringify(sample)}, "replace"); true`);
  await sleep(80);
  ok('弹出替换确认', (await evaluate('window.__t.txt("#modalBody h2")')).indexOf('替换全部数据') >= 0);
  await evaluate('window.__t.click("#mOk"); true');
  await sleep(150);
  ok('替换后 2 笔记录', await evaluate('state.expenses.length') === 2);
  ok('预算替换为 5000', await evaluate('state.settings.budget') === 5000);
  ok('未知分类归入其他', await evaluate('state.expenses.filter(e => e.id === "a2")[0].catId') === 'other');
  ok('阈值替换为 70%', await evaluate('state.settings.warnRatio') === 0.7);

  const mergeOne = JSON.stringify({
    version: 1, expenses: [{ id: 'a3', amount: 5, catId: 'food', note: '合并进来的', date: todayStr(), createdAt: 3 }]
  });
  await evaluate(`applyImport(${JSON.stringify(mergeOne)}, "merge"); true`);
  await sleep(80);
  ok('弹出合并确认', (await evaluate('window.__t.txt("#modalBody h2")')).indexOf('合并数据') >= 0);
  await evaluate('window.__t.click("#mOk"); true');
  await sleep(150);
  ok('合并后 3 笔记录', await evaluate('state.expenses.length') === 3);

  await evaluate(`applyImport(${JSON.stringify(mergeOne)}, "merge"); true`);
  await sleep(80);
  await evaluate('window.__t.click("#mOk"); true');
  await sleep(150);
  ok('重复 id 不会重复写入', await evaluate('state.expenses.length') === 3);
});

/* ---------- 14. 损坏备份 ---------- */
await group('14. 损坏备份要有明确报错', async () => {
  await evaluate('applyImport("{坏掉的", "merge"); true');
  await sleep(80);
  ok('提示不是合法 JSON', (await evaluate('window.__t.txt("#modalBody")')).indexOf('不是合法的 JSON') >= 0);
  await evaluate('window.__t.click("#mOk"); true');

  await evaluate(`applyImport(${JSON.stringify(JSON.stringify({ version: 9, expenses: [] }))}, "merge"); true`);
  await sleep(80);
  ok('提示版本过新', (await evaluate('window.__t.txt("#modalBody")')).indexOf('更新版本') >= 0);
  await evaluate('window.__t.click("#mOk"); true');

  await evaluate(`applyImport(${JSON.stringify(JSON.stringify({ version: 1, expenses: [{ amount: 0, date: 'x' }] }))}, "merge"); true`);
  await sleep(80);
  ok('提示没有有效记录', (await evaluate('window.__t.txt("#modalBody")')).indexOf('没有任何记录') >= 0);
  await evaluate('window.__t.click("#mOk"); true');
  ok('损坏导入未污染数据', await evaluate('state.expenses.length') === 3);
});

/* ---------- 15. 持久化 ---------- */
await group('15. 关闭重开数据仍在', async () => {
  await reload();
  ok('刷新后记录仍在 3 笔', await evaluate('state.expenses.length') === 3);
  ok('刷新后预算仍是 5000', await evaluate('state.settings.budget') === 5000);
  ok('刷新后阈值仍是 70%', await evaluate('state.settings.warnRatio') === 0.7);
});

/* ---------- 16. 离线 ---------- */
await group('16. 离线可用（Service Worker）', async () => {
  let controlled = false;
  for (let i = 0; i < 20 && !controlled; i++) {
    controlled = await evaluate('!!navigator.serviceWorker.controller');
    if (!controlled) { await sleep(300); await evaluate('location.reload(); true').catch(() => {}); await sleep(600); await waitReady(); await installHelpers(); }
  }
  ok('页面已被 Service Worker 接管', controlled);
  const keys = await evaluate('caches.keys()');
  ok('缓存已建立', keys.length > 0 && keys[0].indexOf('savetracker') === 0, JSON.stringify(keys));

  await send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1
  });
  await reload();
  ok('离线仍能渲染首页', await evaluate('!!document.querySelector("#bcSpent")'));
  ok('离线可读到本地数据', await evaluate('state.expenses.length') === 3);
  ok('离线时界面文案正常', (await evaluate('window.__t.txt("#bcSpent")')).indexOf('¥') === 0);
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
  });
});

/* ---------- 17. 布局 ---------- */
await group('17. iPhone 视口布局', async () => {
  ok('无横向溢出', await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
    await evaluate('document.documentElement.scrollWidth + "/" + window.innerWidth'));
  const keyH = await evaluate('document.querySelector("#keypad button").getBoundingClientRect().height');
  ok('键盘按键 ≥ 44px', keyH >= 44, String(keyH));
  const saveH = await evaluate('document.querySelector("#saveBtn").getBoundingClientRect().height');
  ok('保存按钮 ≥ 44px', saveH >= 44, String(saveH));
  const chipH = await evaluate('document.querySelector("#catChips .chip").getBoundingClientRect().height');
  ok('分类标签 ≥ 30px', chipH >= 30, String(chipH));
  const tab = await evaluate('JSON.stringify(document.querySelector("#tabbar").getBoundingClientRect())');
  const rect = JSON.parse(tab);
  ok('Tab 栏贴底', Math.abs(rect.bottom - 844) < 6 && rect.height >= 40, tab);
  ok('三个 Tab 都在', await evaluate('document.querySelectorAll("#tabbar .tab").length') === 3);
});

/* ---------- 18. 深色模式 ---------- */
await group('18. 深色模式', async () => {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await sleep(120);
  const bg = await evaluate('getComputedStyle(document.body).backgroundColor');
  ok('深色背景变黑', bg === 'rgb(0, 0, 0)', bg);
  const card = await evaluate('getComputedStyle(document.querySelector("#view-add .card")).backgroundColor');
  ok('卡片使用深色底', card === 'rgb(28, 28, 30)', card);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await sleep(120);
  ok('浅色背景恢复', await evaluate('getComputedStyle(document.body).backgroundColor') === 'rgb(242, 242, 247)');
});

/* ---------- 19. 清空数据 ---------- */
await group('19. 清空全部数据', async () => {
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'settings\']"); true');
  await evaluate('window.__t.click("#clearBtn"); true');
  await evaluate('window.__t.type("#clearWord", "删掉"); true');
  await evaluate('window.__t.click("#mOk"); true');
  await sleep(80);
  ok('确认词不对时不清空', await evaluate('state.expenses.length') === 3);
  ok('提示输入删除两个字', (await evaluate('window.__t.txt("#toast")')).indexOf('删除') >= 0);
  ok('弹层保持打开', await evaluate('window.__t.shown("#modal")') === true);
  await evaluate('window.__t.type("#clearWord", "删除"); true');
  await evaluate('window.__t.click("#mOk"); true');
  await sleep(120);
  ok('数据已清空', await evaluate('state.expenses.length') === 0);
  ok('预算已重置', await evaluate('state.settings.budget') === 0);
  ok('弹层关闭', await evaluate('window.__t.shown("#modal")') === false);
  await reload();
  ok('清空后刷新仍为空', await evaluate('state.expenses.length') === 0);
});

/* ---------- 23. 分类顺序可调整 ---------- */
await group('23. 分类上下顺序可以调整', async () => {
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'settings\']"); true');
  await sleep(80);
  ok('每行都有拖动手柄', await evaluate('document.querySelectorAll("#catList .cat-handle").length') === 7,
    String(await evaluate('document.querySelectorAll("#catList .cat-handle").length')));

  const names0 = await evaluate('state.settings.categories.map(c => c.name).join(",")');
  await evaluate(`(() => {
    const list = document.querySelector('#catList');
    const rows = Array.from(list.querySelectorAll('.cat-row'));
    const handle = rows[0].querySelector('.cat-handle');
    const y0 = rows[0].getBoundingClientRect().top + 12;
    const r2 = rows[2].getBoundingClientRect();
    const y1 = r2.top + r2.height * 0.75;
    const mk = (type, y) => new PointerEvent(type, {
      pointerId: 1, bubbles: true, cancelable: true, clientX: 120, clientY: y
    });
    handle.dispatchEvent(mk('pointerdown', y0));
    list.dispatchEvent(mk('pointermove', (y0 + y1) / 2));
    list.dispatchEvent(mk('pointermove', y1));
    list.dispatchEvent(mk('pointerup', y1));
    return true;
  })()`);
  await sleep(180);

  const names1 = await evaluate('state.settings.categories.map(c => c.name).join(",")');
  ok('拖动后顺序确实变了', names1 !== names0, names0 + ' → ' + names1);
  ok('拖动不会丢分类', names1.split(',').length === names0.split(',').length, names1);
  ok('被拖的分类不再排第一', names1.split(',')[0] !== names0.split(',')[0], names1);
  ok('被拖的分类还在', names1.indexOf(names0.split(',')[0]) >= 0, names1);

  await reload();
  ok('刷新后顺序保持', await evaluate('state.settings.categories.map(c => c.name).join(",")') === names1,
    await evaluate('state.settings.categories.map(c => c.name).join(",")'));

  await evaluate('window.__t.click("#tabbar .tab[data-view=\'settings\']"); true');
  await sleep(80);
  const before = await evaluate('state.settings.categories.map(c => c.name).join(",")');
  await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('#catList .cat-row'));
    rows[3].querySelector('[data-act=edit]').click();
  })(); true`);
  ok('编辑弹层里有上移/下移', await evaluate('!!document.querySelector("#cUp") && !!document.querySelector("#cDown")'));
  await evaluate('window.__t.click("#cUp"); true');
  await sleep(150);
  const after = await evaluate('state.settings.categories.map(c => c.name).join(",")');
  ok('上移把第 4 项换到第 3 位',
    after.split(',')[2] === before.split(',')[3] && after.split(',')[3] === before.split(',')[2],
    before + ' → ' + after);
  ok('操作后弹层自动关闭', await evaluate('window.__t.shown("#sheet")') === false);

  await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('#catList .cat-row'));
    rows[0].querySelector('[data-act=edit]').click();
  })(); true`);
  ok('第一项的上移按钮不可用', await evaluate('document.querySelector("#cUp").disabled') === true);
  await evaluate('document.querySelector(".mask[data-close=sheet]").click(); true');
  ok('点蒙层可以关掉弹层', await evaluate('window.__t.shown("#sheet")') === false);

  await evaluate('window.__t.click("#tabbar .tab[data-view=\'add\']"); true');
  await sleep(80);
  const firstChip = await evaluate('window.__t.txt("#catChips .chip")');
  ok('首页分类按钮跟着改顺序', firstChip.indexOf(after.split(',')[0]) >= 0, firstChip);
});

/* ---------- 汇总 ---------- */
await group('20. iOS 安装引导', async () => {
  await send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone'
  });
  await reload();
  ok('iOS 上出现安装引导', await evaluate('window.__t.shown("#installTip")') === true);
  ok('引导文案提到添加到主屏幕', (await evaluate('window.__t.txt("#installTip")')).indexOf('添加到主屏幕') >= 0);
  await evaluate('window.__t.click("#installTipClose"); true');
  await sleep(80);
  ok('点知道了后引导消失', await evaluate('window.__t.shown("#installTip")') === false);
  ok('关闭状态已记住', await evaluate('localStorage.getItem("savetracker.tip")') === 'off');
  await reload();
  ok('重开后不再打扰', await evaluate('window.__t.shown("#installTip")') === false);
  await send('Emulation.setUserAgentOverride', { userAgent: '', platform: '' });
});

/* ---------- 21. 金额支持小数 ---------- */
await group('21. 每月可用金额支持小数', async () => {
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'settings\']"); true');
  await evaluate('window.__t.type("#setBudget", "3000.50"); true');
  ok('3000.50 原样保存', await evaluate('state.settings.budget') === 3000.5,
    String(await evaluate('state.settings.budget')));
  ok('还剩显示 ¥3,000.50', await waitText('#bcLeft', '¥3,000.50') === true,
    await evaluate('window.__t.txt("#bcLeft")'));
  ok('输入框回显 3000.5', await evaluate('window.__t.q("#setBudget").value') === '3000.5');

  await evaluate('window.__t.type("#setBudget", "12.345"); true');
  ok('超过两位小数只保留到分（12.345 → 12.34）', await evaluate('state.settings.budget') === 12.34,
    String(await evaluate('state.settings.budget')));

  await evaluate('window.__t.type("#setBudget", "3.4.5"); true');
  ok('多个小数点当作 3.45', await evaluate('state.settings.budget') === 3.45,
    String(await evaluate('state.settings.budget')));

  await evaluate('window.__t.type("#setBudget", "0.01"); true');
  ok('可以设到一分钱', await evaluate('state.settings.budget') === 0.01,
    String(await evaluate('state.settings.budget')));
  ok('还剩显示 ¥0.01', await waitText('#bcLeft', '¥0.01') === true,
    await evaluate('window.__t.txt("#bcLeft")'));

  await evaluate('window.__t.type("#setBudget", "abc"); true');
  ok('乱填会退回未设置', await evaluate('state.settings.budget') === 0);
  ok('未设置时还剩显示 —', await evaluate('window.__t.txt("#bcLeft")') === '—');

  await evaluate('window.__t.type("#setBudget", "888.88"); true');
  await reload();
  ok('小数金额刷新后仍在', await evaluate('state.settings.budget') === 888.88,
    String(await evaluate('state.settings.budget')));
});

/** 独立算一遍：含今天的那一期从哪天开始 */
function expectedCycleStart(day) {
  const t = new Date();
  const y = t.getFullYear();
  const m = t.getMonth();
  const dim = (yy, mm) => new Date(yy, mm + 1, 0).getDate();
  const thisDay = Math.min(day, dim(y, m));
  let s;
  if (t.getDate() >= thisDay) {
    s = new Date(y, m, thisDay);
  } else {
    const py = m === 0 ? y - 1 : y;
    const pm = m === 0 ? 11 : m - 1;
    s = new Date(py, pm, Math.min(day, dim(py, pm)));
  }
  const p2 = n => String(n).padStart(2, '0');
  return s.getFullYear() + '-' + p2(s.getMonth() + 1) + '-' + p2(s.getDate());
}

/* ---------- 22. 周期起始日支持任意日期 ---------- */
await group('22. 预算周期起始日支持任意一天', async () => {
  await evaluate('window.__t.click("#tabbar .tab[data-view=\'settings\']"); true');
  const optCount = await evaluate('document.querySelectorAll("#setCycle option").length');
  ok('可选 1–31 任意一天', optCount === 31, String(optCount));
  for (const d of [2, 8, 12, 18, 30, 31]) {
    ok('包含 ' + d + ' 号', await evaluate('!!document.querySelector("#setCycle option[value=\'' + d + '\']")') === true);
  }

  await evaluate('window.__t.type("#setCycle", "12"); true');
  ok('起始日写入 12', await evaluate('state.settings.cycleStartDay') === 12);
  const hint12 = await evaluate('window.__t.txt("#cycleHint")');
  ok('周期按 12 号计算', hint12.indexOf(expectedCycleStart(12)) >= 0, hint12);

  await evaluate('window.__t.type("#setCycle", "31"); true');
  const info = JSON.parse(await evaluate('JSON.stringify(currentCycle())'));
  const sy = Number(info.startKey.slice(0, 4));
  const sm = Number(info.startKey.slice(5, 7));
  const sd = Number(info.startKey.slice(8, 10));
  ok('没有 31 号的月份用当月最后一天（' + info.startKey + '）',
    sd === Math.min(31, new Date(sy, sm, 0).getDate()), info.startKey);
  const len = Math.round((new Date(info.endKey) - new Date(info.startKey)) / 86400000);
  ok('周期长度在 28–31 天之间', len >= 28 && len <= 31, String(len));
  ok('剩余天数合理', info.daysLeft >= 1 && info.daysLeft <= 31, String(info.daysLeft));
  ok('首页标签显示跨月区间', (await evaluate('window.__t.txt("#bcPeriod")')).indexOf('/') >= 0);

  await evaluate('window.__t.type("#setCycle", "1"); true');
  ok('切回 1 号', await evaluate('state.settings.cycleStartDay') === 1);
  await reload();
  ok('起始日刷新后仍是 1', await evaluate('state.settings.cycleStartDay') === 1);
});

console.log('\n' + results.join('\n'));
const total = results.length;
console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项失败') + '：' + (total - failed) + '/' + total);
cdp.close();
process.exit(failed === 0 ? 0 : 1);
