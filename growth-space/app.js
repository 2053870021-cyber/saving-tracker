(() => {
  const KEY = 'xiangqianyidian-v1';
  const $ = id => document.getElementById(id);
  const now = new Date();
  const dateKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = dateKey(now);
  let selectedDate = today, shownMonth = new Date(now.getFullYear(), now.getMonth(), 1), pendingRecord = '';
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { state = {}; }
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
  if (!state.dailyRecords) {
    state.dailyRecords = {};
    (state.entries || []).forEach(entry => {
      const match = String(entry.date || '').match(/(\d{1,2})月(\d{1,2})日/);
      if (match) state.dailyRecords[now.getFullYear() + '-' + String(match[1]).padStart(2, '0') + '-' + String(match[2]).padStart(2, '0')] = { happy: '', unhappy: '', thoughts: entry.text || '' };
    });
  }
  if (!state.calendarNotes) state.calendarNotes = {};
  const GARDEN_MODE_KEY = 'xiangqianyidian-garden-mode-v1';
  let gardenMode = 'day';
  try { gardenMode = localStorage.getItem(GARDEN_MODE_KEY) === 'night' ? 'night' : 'day'; } catch (e) { /* 使用白天模式 */ }
  const drafts = new Map();
  const recordInputs = ['happyInput', 'unhappyInput', 'thoughtInput'];
  const readRecord = () => ({ happy: $('happyInput').value.trim(), unhappy: $('unhappyInput').value.trim(), thoughts: $('thoughtInput').value.trim() });
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch { toast('没有保存成功，请保留文字并检查浏览器的存储设置。'); $('saveHint').textContent = '尚未保存，请保留文字'; return false; }
  }
  function prettyDate(key, full = true) {
    return new Intl.DateTimeFormat('zh-CN', full ? { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' } : { month: 'long', day: 'numeric' }).format(new Date(key + 'T12:00:00'));
  }
  function hasRecord(key) { const r = state.dailyRecords[key]; return !!(r && (r.happy || r.unhappy || r.thoughts)); }
  function savedKeys() { return [...new Set([...Object.keys(state.dailyRecords), ...Object.keys(state.calendarNotes)])].filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) && (hasRecord(key) || state.calendarNotes[key])).sort().reverse(); }
  function rememberDraft() { drafts.set(selectedDate, { ...readRecord(), note: $('calendarNoteInput').value }); }
  function updateWritingState() {
    const count = recordInputs.filter(id => $(id).value.trim()).length;
    $('writingStatus').textContent = count === 0 ? '一句话也可以，只写一项也可以。' : count === 3 ? '三件事，都有了着落。' : '已经写下 ' + count + ' 件小事，不必凑满。';
    $('saveRecord').textContent = count === 0 && hasRecord(selectedDate) ? '清空这天的三件事' : selectedDate === today ? '把今天留住' : '把这一天留住';
  }
  function renderSelectedDay() {
    const r = drafts.get(selectedDate) || state.dailyRecords[selectedDate] || {};
    $('journalTitle').textContent = selectedDate === today ? '今天的三件小事' : '这一天的三件小事';
    $('recordDateTag').textContent = selectedDate === today ? '今天' : prettyDate(selectedDate, false);
    $('happyInput').value = r.happy || '';
    $('unhappyInput').value = r.unhappy || '';
    $('thoughtInput').value = r.thoughts || '';
    $('calendarDateLabel').textContent = prettyDate(selectedDate, false);
    $('calendarNoteInput').value = drafts.has(selectedDate) ? r.note || '' : state.calendarNotes[selectedDate] || '';
    $('saveHint').textContent = hasRecord(selectedDate) ? '这一页，已经替你留好了。' : '写下后，记得把这一天留住。';
    updateWritingState();
  }
  function renderCalendar(focusDate = '') {
    $('monthLabel').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(shownMonth);
    const grid = $('calendarDays'); grid.replaceChildren();
    const y = shownMonth.getFullYear(), m = shownMonth.getMonth(), offset = new Date(y, m, 1).getDay(), count = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < offset; i++) { const s = document.createElement('span'); s.className = 'calendar-spacer'; s.setAttribute('aria-hidden', 'true'); grid.append(s); }
    for (let n = 1; n <= count; n++) {
      const key = dateKey(new Date(y, m, n)), b = document.createElement('button');
      b.type = 'button'; b.className = 'calendar-day';
      if (key === selectedDate) b.classList.add('selected');
      if (key === today) b.classList.add('today');
      if (hasRecord(key) || state.calendarNotes[key]) b.classList.add('has-note');
      b.textContent = n; b.dataset.date = key; b.setAttribute('aria-label', prettyDate(key) + (hasRecord(key) || state.calendarNotes[key] ? '，有记录' : '')); b.setAttribute('aria-pressed', key === selectedDate ? 'true' : 'false');
      b.addEventListener('click', () => { rememberDraft(); selectedDate = key; renderSelectedDay(); renderCalendar(key); });
      grid.append(b);
    }
    if (focusDate) grid.querySelector('[data-date="' + focusDate + '"]')?.focus({ preventScroll: true });
  }
  function plantHead(x, y, type, large) {
    if (type === 'sun') {
      const petals = Array.from({ length: 12 }, (_, i) => '<ellipse cx="' + x + '" cy="' + (y - 21) + '" rx="6" ry="12" transform="rotate(' + (i * 30) + ' ' + x + ' ' + y + ')" fill="#f5b42a" stroke="#d8871c" stroke-width="1.4"/>').join('');
      return petals + '<circle cx="' + x + '" cy="' + y + '" r="' + (large ? 17 : 14) + '" fill="#8a4f25" stroke="#61391e" stroke-width="2"/><ellipse cx="' + (x - 5) + '" cy="' + (y - 2) + '" rx="2.4" ry="3.8" fill="#fff5cc"/><ellipse cx="' + (x + 5) + '" cy="' + (y - 2) + '" rx="2.4" ry="3.8" fill="#fff5cc"/><circle cx="' + (x - 5) + '" cy="' + (y - 1) + '" r="1.1" fill="#402a20"/><circle cx="' + (x + 5) + '" cy="' + (y - 1) + '" r="1.1" fill="#402a20"/><path d="M' + (x - 5) + ' ' + (y + 6) + ' Q' + x + ' ' + (y + 11) + ' ' + (x + 5) + ' ' + (y + 6) + '" fill="none" stroke="#402a20" stroke-width="1.7" stroke-linecap="round"/>';
    }
    const cap = large
      ? '<path d="M' + (x - 29) + ' ' + (y + 3) + ' Q' + (x - 25) + ' ' + (y - 27) + ' ' + x + ' ' + (y - 28) + ' Q' + (x + 26) + ' ' + (y - 26) + ' ' + (x + 30) + ' ' + (y + 3) + ' Q' + x + ' ' + (y + 13) + ' ' + (x - 29) + ' ' + (y + 3) + 'Z' : '<path d="M' + (x - 23) + ' ' + (y + 3) + ' Q' + (x - 18) + ' ' + (y - 21) + ' ' + x + ' ' + (y - 22) + ' Q' + (x + 20) + ' ' + (y - 20) + ' ' + (x + 23) + ' ' + (y + 3) + ' Q' + x + ' ' + (y + 10) + ' ' + (x - 23) + ' ' + (y + 3) + 'Z';
    return '<path d="M' + (x - 11) + ' ' + (y + 2) + ' Q' + (x - 12) + ' ' + (y + 21) + ' ' + (x - 9) + ' ' + (y + 29) + ' L' + (x + 10) + ' ' + (y + 29) + ' Q' + (x + 13) + ' ' + (y + 16) + ' ' + (x + 11) + ' ' + (y + 2) + 'Z" fill="#e9d2a5" stroke="#9b7950" stroke-width="1.5"/>' + cap + '<path d="M' + (x - 8) + ' ' + (y - 5) + ' q3 -3 6 0 M' + (x + 2) + ' ' + (y - 5) + ' q3 -3 6 0" fill="none" stroke="#352b3d" stroke-width="1.7" stroke-linecap="round"/><circle cx="' + (x - 5) + '" cy="' + (y - 2) + '" r="1.5" fill="#352b3d"/><circle cx="' + (x + 5) + '" cy="' + (y - 2) + '" r="1.5" fill="#352b3d"/><path d="M' + (x - 3) + ' ' + (y + 6) + ' Q' + x + ' ' + (y + 9) + ' ' + (x + 3) + ' ' + (y + 6) + '" fill="none" stroke="#704050" stroke-width="1.5" stroke-linecap="round"/><circle cx="' + (x - 15) + '" cy="' + (y - 1) + '" r="3" fill="#ead6ed"/><circle cx="' + (x + 15) + '" cy="' + (y - 1) + '" r="3" fill="#ead6ed"/>';
  }
  function plantSvg(type, upgraded) {
    const heads = type === 'sun'
      ? upgraded ? plantHead(43, 39, 'sun', true) + plantHead(78, 39, 'sun', true) : plantHead(60, 42, 'sun', false)
      : plantHead(60, upgraded ? 39 : 42, 'mushroom', upgraded);
    const stems = type === 'sun' && upgraded
      ? '<path d="M60 120V71 M60 83Q47 72 43 58 M60 83Q72 72 78 58" fill="none" stroke="#59824c" stroke-width="5" stroke-linecap="round"/>'
      : '<path d="M60 120V68" fill="none" stroke="#59824c" stroke-width="5" stroke-linecap="round"/>';
    const puff = type === 'mushroom' && upgraded ? '<path d="M84 48q12 -6 17 0q-6 2 -9 7q-5 -3 -8 -7Z" fill="#c49ad2" stroke="#79528c" stroke-width="1.5"/>' : '';
    return '<svg viewBox="0 0 120 130" aria-hidden="true"><path d="M60 104Q35 92 27 99Q37 112 59 111 M61 95Q82 82 93 88Q84 103 61 103" fill="#86a96b" stroke="#59824c" stroke-width="2" stroke-linejoin="round"/>' + stems + heads + puff + '</svg>';
  }
  function renderGarden(bloom = false) {
    const keys = savedKeys();
    $('beginLabel').textContent = hasRecord(today) ? '继续今天的记录' : '开始今天的记录';
    $('gardenCount').textContent = keys.length;
    $('gardenCaption').textContent = keys.length ? (gardenMode === 'day' ? '白天晒晒太阳，每 5 个记录日长成一株双头向日葵。' : '夜里安静生长，每 5 个记录日长成一株大喷菇。') : (gardenMode === 'day' ? '先留下一天，种下第一株向日葵。' : '先留下一天，夜色里会长出第一株小喷菇。');
    const garden = $('gardenFlowers'); garden.replaceChildren();
    $('gardenSeedling').toggleAttribute('hidden', keys.length > 0);
    $('gardenSeedling').innerHTML = plantSvg(gardenMode === 'day' ? 'sun' : 'mushroom', false);
    $('garden').classList.toggle('night-mode', gardenMode === 'night');
    document.documentElement.dataset.gardenTheme = gardenMode;
    const modeButton = $('gardenModeToggle');
    modeButton.setAttribute('aria-pressed', gardenMode === 'night' ? 'true' : 'false');
    modeButton.setAttribute('aria-label', gardenMode === 'day' ? '切换到夜晚，显示小喷菇' : '切换到白天，显示向日葵');
    modeButton.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#' + (gardenMode === 'day' ? 'i-moon' : 'i-sun') + '"/></svg><span>' + (gardenMode === 'day' ? '夜晚' : '白天') + '</span>';
    const groups = [];
    for (let i = 0; i < keys.length; i += 5) groups.push(keys.slice(i, i + 5));
    $('gardenMore').textContent = groups.length > 9 ? '最近 9 株 · 共 ' + groups.length + ' 株；每株代表最多 5 天' : '点一株植物，回看最近一天的记录';
    $('gardenMore').hidden = keys.length === 0;
    const positions = [50, 25, 72, 39, 85, 12, 60, 32, 77];
    groups.slice(0, 9).reverse().forEach((group, index) => {
      const key = group[0], upgraded = group.length === 5;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'garden-flower';
      b.setAttribute('aria-label', (gardenMode === 'day' ? (upgraded ? '双头向日葵' : '向日葵') : (upgraded ? '大喷菇' : '小喷菇')) + '，代表 ' + group.length + ' 天记录，点击查看最近一天'); b.title = '代表 ' + group.length + ' 天 · ' + prettyDate(key);
      b.style.left = positions[index] + '%'; b.style.bottom = (index > 4 ? 18 : 8) + 'px';
      b.style.width = (upgraded ? 86 : index > 4 ? 60 : 74) + 'px';
      b.innerHTML = plantSvg(gardenMode === 'day' ? 'sun' : 'mushroom', upgraded);
      b.addEventListener('click', () => { pendingRecord = key; location.hash = '#records'; });
      garden.append(b);
    });
    const scene = $('gardenScene'); scene.classList.toggle('bloom', bloom);
    if (bloom) setTimeout(() => scene.classList.remove('bloom'), 1100);
  }
  const inspirations = [
    ['今天有没有一口好吃的、一阵风，或一句让你笑的话？', 'happyInput', '从一件快乐的小事开始'],
    ['如果今天的烦恼会说话，它最想让你听见什么？', 'unhappyInput', '给情绪一点空间'],
    ['今天的你，有哪件小事比昨天更勇敢了一点？', 'thoughtInput', '看看自己的变化'],
    ['今天谁让你觉得被理解？也可以是你自己。', 'happyInput', '想起一个温暖的瞬间'],
    ['有什么事情，你愿意先允许自己做得不那么好？', 'unhappyInput', '对自己宽容一点'],
    ['如果给今天的自己留一张便签，你会写什么？', 'thoughtInput', '留一句话给自己'],
    ['今天有没有一个瞬间，你希望时间走得慢一点？', 'happyInput', '留住一个喜欢的画面'],
    ['今天消耗你最多的是什么？你希望怎样被照顾？', 'unhappyInput', '听听自己的需要'],
    ['今天学到的一点点，明天可以怎样试一试？', 'thoughtInput', '把发现带到明天']
  ];
  let promptIndex = now.getDate() % inspirations.length;
  function renderInspiration() { const p = inspirations[promptIndex]; $('inspirationText').textContent = p[0]; $('promptCategory').textContent = p[2]; }
  $('beginWriting').addEventListener('click', () => {
    rememberDraft(); selectedDate = today; shownMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    renderSelectedDay(); renderCalendar();
    const field = recordInputs.map(id => $(id)).find(input => !input.value.trim()) || $('happyInput');
    field.focus({ preventScroll: true });
    field.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  });
  $('nextPrompt').addEventListener('click', () => { promptIndex = (promptIndex + 1) % inspirations.length; renderInspiration(); });
  $('gardenModeToggle').addEventListener('click', () => {
    gardenMode = gardenMode === 'day' ? 'night' : 'day';
    try { localStorage.setItem(GARDEN_MODE_KEY, gardenMode); } catch (e) { /* 模式仍可在本次打开中切换 */ }
    renderGarden();
  });
  $('startPrompt').addEventListener('click', () => { const field = $(inspirations[promptIndex][1]); field.focus(); field.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); });
  recordInputs.forEach(id => $(id).addEventListener('input', () => { $('saveHint').textContent = '正在写，记得把这一天留住。'; updateWritingState(); }));
  $('saveRecord').addEventListener('click', () => {
    const r = readRecord(), previous = state.dailyRecords[selectedDate], wasPlanted = savedKeys().includes(selectedDate);
    if (!r.happy && !r.unhappy && !r.thoughts) {
      if (!previous) { toast('从一句话开始就好。'); return; }
      delete state.dailyRecords[selectedDate];
    } else state.dailyRecords[selectedDate] = r;
    if (!persist()) { if (previous) state.dailyRecords[selectedDate] = previous; else delete state.dailyRecords[selectedDate]; return; }
    rememberDraft(); renderCalendar(); renderGarden(!wasPlanted && savedKeys().includes(selectedDate)); updateWritingState();
    $('saveHint').textContent = hasRecord(selectedDate) ? '这一页，已经替你留好了。' : '这天的三件事已清空。';
    toast(!wasPlanted && hasRecord(selectedDate) ? '一朵小花，替你记住了这一天。' : hasRecord(selectedDate) ? '写下的这一点点，已经留好了。' : '这天的三件事已清空。');
  });
  $('saveCalendarNote').addEventListener('click', () => {
    const note = $('calendarNoteInput').value.trim(), previous = state.calendarNotes[selectedDate], wasPlanted = savedKeys().includes(selectedDate);
    if (note) state.calendarNotes[selectedDate] = note; else delete state.calendarNotes[selectedDate];
    if (!persist()) { if (previous) state.calendarNotes[selectedDate] = previous; else delete state.calendarNotes[selectedDate]; return; }
    rememberDraft(); renderCalendar(); renderGarden(!wasPlanted && !!note); toast(note ? '这句话，替你留好了。' : '当天注释已清空。');
  });
  $('prevMonth').addEventListener('click', () => { shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1); renderCalendar(); });
  $('nextMonth').addEventListener('click', () => { shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1); renderCalendar(); });
  $('returnToday').addEventListener('click', () => { rememberDraft(); selectedDate = today; shownMonth = new Date(now.getFullYear(), now.getMonth(), 1); renderSelectedDay(); renderCalendar(); });
  let timer;
  function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(timer); timer = setTimeout(() => el.classList.remove('show'), 3200); }
  function parseArchiveMarkdown(markdown) {
    const clean = markdown.replace(/^\uFEFF/, '').replace(/\r/g, '');
    if (!clean.startsWith('# 留一页给自己｜日记备份')) return null;
    const result = {};
    const labelToKey = { '快乐的事情': 'happy', '不快乐的事情': 'unhappy', '对于今天的思考': 'thoughts', '当天注释': 'note' };
    const sections = clean.split(/^---\s*$/m);
    for (const section of sections) {
      const dateMatch = section.match(/^##\s+(\d{4})年(\d{1,2})月(\d{1,2})日/m);
      if (!dateMatch) continue;
      const [, year, month, day] = dateMatch;
      const date = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const headings = [...section.matchAll(/^###\s+(快乐的事情|不快乐的事情|对于今天的思考|当天注释)\s*$/gm)];
      const values = {};
      headings.forEach((heading, index) => {
        const start = heading.index + heading[0].length;
        const end = headings[index + 1]?.index ?? section.length;
        const value = section.slice(start, end).trim();
        const field = labelToKey[heading[1]];
        if (value) values[field] = value;
      });
      if (Object.keys(values).length) result[date] = values;
    }
    return Object.keys(result).length ? result : null;
  }
  $('importArchiveButton').addEventListener('click', () => $('importArchive').click());
  $('importArchive').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = parseArchiveMarkdown(await file.text());
      if (!imported) { toast('没有识别到旧站备忘录，请选择“导出备忘录”生成的 Markdown 文件。'); return; }
      const days = Object.keys(imported);
      const conflicts = days.filter(key => hasRecord(key) || state.calendarNotes[key]).length;
      if (!window.confirm('将导入 ' + days.length + ' 个日子的记录' + (conflicts ? '，其中 ' + conflicts + ' 天与现有内容重合，同栏将以备份为准' : '') + '。继续吗？')) return;
      const previous = JSON.parse(JSON.stringify(state));
      days.forEach(key => {
        const { note, ...record } = imported[key];
        if (Object.keys(record).length) state.dailyRecords[key] = { ...(state.dailyRecords[key] || {}), ...record };
        if (note) state.calendarNotes[key] = note;
      });
      if (!persist()) { state = previous; renderSelectedDay(); renderCalendar(); renderGarden(); return; }
      renderSelectedDay(); renderCalendar(); renderGarden();
      if (location.hash === '#records') renderRecords();
      toast('已导入 ' + days.length + ' 个日子的记录。');
    } catch { toast('文件读取失败，请重新导出后再试。'); }
  });
  function renderRecords() {
    const keys = savedKeys(), list = $('recordList'); list.replaceChildren();
    $('recordCount').textContent = keys.length ? '已经为自己留下 ' + keys.length + ' 个日子。最近的日子在前。' : '';
    $('recordsEmpty').hidden = keys.length > 0;
    keys.forEach(key => {
      const entry = document.createElement('article'); entry.className = 'archive-entry'; entry.id = 'entry-' + key;
      const heading = document.createElement('h2'), time = document.createElement('time'); time.dateTime = key; time.textContent = prettyDate(key); heading.append(time); entry.append(heading);
      const content = document.createElement('div'); content.className = 'archive-content'; entry.append(content);
      const r = state.dailyRecords[key] || {};
      [['快乐的事情', r.happy], ['不快乐的事情', r.unhappy], ['对于今天的思考', r.thoughts], ['当天注释', state.calendarNotes[key]]].forEach(([label, value]) => {
        if (!value) return; const title = document.createElement('h3'), body = document.createElement('p'); title.textContent = label; body.textContent = value; content.append(title, body);
      });
      list.append(entry);
    });
  }
  function renderPage(focusHeading = false) {
    const reading = location.hash === '#records';
    $('writePage').hidden = reading; $('recordsPage').hidden = !reading;
    $('writeNav').removeAttribute('aria-current'); $('recordsNav').removeAttribute('aria-current'); $(reading ? 'recordsNav' : 'writeNav').setAttribute('aria-current', 'page');
    document.title = reading ? '查记录 · 留一页给自己' : '留一页给自己 · 每日记录';
    if (reading) renderRecords();
    if (reading && pendingRecord) { const key = pendingRecord; pendingRecord = ''; requestAnimationFrame(() => { const entry = $('entry-' + key); if (entry) { entry.tabIndex = -1; entry.focus({ preventScroll: true }); entry.scrollIntoView({ block: 'center' }); entry.classList.add('highlighted'); } }); }
    else { window.scrollTo(0, 0); if (focusHeading) $(reading ? 'recordsTitle' : 'welcomeTitle').focus({ preventScroll: true }); }
  }
  $('todayLabel').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  window.addEventListener('hashchange', () => renderPage(true));
  renderSelectedDay(); renderCalendar(); renderInspiration(); renderGarden(); renderPage();
})();

