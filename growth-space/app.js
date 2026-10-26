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
  function flowerSvg(index) {
    const palette = [['#edc48f', '#ad7144'], ['#dba398', '#9a6259'], ['#b8b4d5', '#746990'], ['#e6d799', '#9b8244']];
    const [petal, center] = palette[index % palette.length];
    const stem = index % 2 ? 'M34 118C34 96 27 73 34 41' : 'M34 118C28 96 40 70 34 41';
    const petals = [0, 60, 120, 180, 240, 300].map(angle => '<path d="M34 40C19 33 23 15 34 18C45 15 49 33 34 40Z" transform="rotate(' + angle + ' 34 40)" fill="' + petal + '"/>').join('');
    return '<svg viewBox="0 0 68 130" aria-hidden="true"><path d="' + stem + '" stroke="#668565" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M34 91C15 92 12 78 15 76C29 75 35 84 34 91Z" fill="#9daf83"/><path d="M34 75C47 74 55 63 51 60C39 60 32 68 34 75Z" fill="#7f9a74"/>' + petals + '<circle cx="34" cy="40" r="6.5" fill="' + center + '"/><circle cx="32.5" cy="38.5" r="1" fill="#fff" opacity=".5"/></svg>';
  }
  function renderGarden(bloom = false) {
    const keys = savedKeys();
    $('beginLabel').textContent = hasRecord(today) ? '继续今天的记录' : '开始今天的记录';
    $('gardenCount').textContent = keys.length;
    $('gardenCaption').textContent = keys.length ? '每一朵花，都是你认真生活过的一天。' : '先写一句话，种下属于你的第一朵花。';
    const garden = $('gardenFlowers'); garden.replaceChildren();
    $('gardenSeedling').toggleAttribute('hidden', keys.length > 0);
    $('gardenMore').textContent = keys.length > 9 ? '最近 9 朵 · 共 ' + keys.length + ' 个日子' : '点一朵花，看看那天的自己';
    $('gardenMore').hidden = keys.length === 0;
    const positions = [50, 25, 72, 39, 85, 12, 60, 32, 77];
    keys.slice(0, 9).reverse().forEach((key, index) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'garden-flower';
      b.setAttribute('aria-label', prettyDate(key) + '，查看这天的记录'); b.title = prettyDate(key);
      b.style.left = positions[index] + '%'; b.style.bottom = (index > 4 ? 18 : 8) + 'px';
      b.style.width = (index > 4 ? 60 : 78) + 'px';
      b.innerHTML = flowerSvg(Number(key.replaceAll('-', '')) % 4);
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
  async function exportNotes() {
    rememberDraft();
    const keys = [...new Set([...savedKeys(), ...drafts.keys()])].sort().reverse();
    if (!keys.length) { toast('还没有可导出的记录，保存一条后就能备份。'); return; }
    const entries = keys.map(key => {
      const draft = drafts.get(key), record = draft || state.dailyRecords[key] || {};
      const values = [
        ['快乐的事情', record.happy || ''],
        ['不快乐的事情', record.unhappy || ''],
        ['对于今天的思考', record.thoughts || ''],
        ['当天注释', draft ? (draft.note || '') : (state.calendarNotes[key] || '')]
      ].map(([label, value]) => [label, String(value || '').trim()]).filter(([, value]) => value);
      return values.length ? { key, values } : null;
    }).filter(Boolean);
    const sections = entries.map(({ key, values }) => '## ' + prettyDate(key) + '\n\n' + values.map(([label, value]) => '### ' + label + '\n\n' + value).join('\n\n'));
    const markdown = '# 留一页给自己｜日记备份\n\n导出于 ' + prettyDate(today) + '\n\n' + sections.join('\n\n---\n\n') + '\n';
    const shareText = '留一页给自己｜成长记录\n导出于 ' + prettyDate(today) + '\n\n' + entries.map(({ key, values }) => prettyDate(key) + '\n' + values.map(([label, value]) => label + '\n' + value).join('\n\n')).join('\n\n──────────\n\n');
    const filename = '留一页给自己-备忘录备份-' + today + '.md';
    const file = new File(['\ufeff', markdown], filename, { type: 'text/markdown;charset=utf-8' });
    if (navigator.share) {
      try {
        await navigator.share({ title: '留一页给自己｜成长记录', text: shareText });
        toast('已打开分享菜单，选择「备忘录」即可保存全部记录。');
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      toast('已复制全部记录，打开备忘录后粘贴即可。');
      return;
    } catch (error) { /* 继续提供文件下载 */ }
    const url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('备忘录文件已下载，可导入 Apple 备忘录。');
  }
  $('exportNotes').addEventListener('click', exportNotes);
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

