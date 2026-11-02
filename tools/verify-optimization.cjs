const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const storage = new Map();
const localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
const ledgerSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8').split('/* ---------------- 启动 ---------------- */')[0];
const ledger = vm.createContext({ localStorage, console, setTimeout, clearTimeout });
vm.runInContext(ledgerSource, ledger);
storage.set('xiangqianyidian-v1', JSON.stringify({dailyRecords:{'2026-10-31':{happy:'吃了一顿好饭',thoughts:'继续努力'}},calendarNotes:{'2026-10-31':'晴天'}}));
const exported = vm.runInContext('exportPayload()', ledger);
assert.equal(JSON.parse(exported).journal.dailyRecords['2026-10-31'].happy, '吃了一顿好饭');
assert.equal(vm.runInContext('parseBackup(' + JSON.stringify(exported) + ').journal.calendarNotes["2026-10-31"]', ledger), '晴天');
assert.equal(vm.runInContext('parseBackup(JSON.stringify({version:1,expenses:[],settings:{}})).journal', ledger), undefined);
assert.throws(() => vm.runInContext('parseBackup("broken")', ledger));

function garden(days) {
  class Element {
    constructor() { this.children = []; this.attrs = {}; this.events = {}; this.style = {}; this.dataset = {}; this.value = ''; this.textContent = ''; this.hidden = false; this.classList = { toggle() {}, add() {}, remove() {} }; }
    replaceChildren() { this.children = []; }
    append(...children) { this.children.push(...children); }
    setAttribute(key, value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    toggleAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(key, callback) { this.events[key] = callback; }
    querySelector() { return null; }
    focus() {}
    scrollIntoView() {}
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const data = { dailyRecords: {}, calendarNotes: {} };
  for (let i = 1; i <= days; i++) data.dailyRecords['2026-10-' + String(i).padStart(2, '0')] = { happy: 'day ' + i };
  storage.set('xiangqianyidian-v1', JSON.stringify(data));
  const document = { getElementById: get, createElement: () => new Element(), documentElement: { dataset: {} } };
  const context = vm.createContext({document, localStorage, location:{hash:'#write'}, window:{addEventListener(){},scrollTo(){}}, console, setTimeout:()=>0,clearTimeout(){},matchMedia:()=>({matches:true}), requestAnimationFrame:fn=>fn()});
  vm.runInContext(fs.readFileSync(path.join(root,'growth-space/app.js'),'utf8'), context);
  return { get, document, context };
}
storage.delete('xiangqianyidian-drafts-v1');
storage.delete('xiangqianyidian-garden-mode-v1');
for (const [days, plants, upgrades] of [[0,0,0],[1,1,0],[4,4,0],[5,1,1],[6,2,1],[9,5,1],[10,2,2]]) {
  const view = garden(days);
  const plantsInGarden = view.get('gardenFlowers').children;
  assert.equal(plantsInGarden.length, plants, days + ' days has correct plant count');
  assert.equal(plantsInGarden.filter(p=>p.attrs['aria-label'].startsWith('双头')).length, upgrades);
  view.get('gardenModeToggle').events.click();
  assert.equal(view.document.documentElement.dataset.gardenTheme, 'night');
  assert.equal(view.get('gardenFlowers').children.filter(p=>p.style.width==='48px').length, days % 5);
  storage.delete('xiangqianyidian-garden-mode-v1');
}
const view = garden(0);
view.get('happyInput').value = '刷新后还要在的草稿';
view.get('happyInput').events.input();
const reopened = garden(0);
assert.equal(reopened.get('happyInput').value, '刷新后还要在的草稿');
assert.equal(reopened.get('gardenFlowers').children.length, 0, 'draft does not earn a plant before saving');
reopened.get('saveRecord').events.click();
assert.equal(JSON.parse(storage.get('xiangqianyidian-drafts-v1')).length, 0, 'saved draft is cleaned up');
assert.equal(reopened.get('gardenFlowers').children.length, 1);
assert.ok(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('data-src="./growth-space/'));
async function checkImportsAndOffline() {
  storage.set('xiangqianyidian-v1', JSON.stringify({dailyRecords:{'2026-10-31':{happy:'吃了一顿好饭'}},calendarNotes:{}}));
  ledger.document = { querySelector: () => ({ getAttribute: () => null }) };
  vm.runInContext('confirmModal = () => Promise.resolve(true); renderAll = () => {}; toast = () => {};', ledger);
  const incoming = JSON.stringify({version:1,settings:{},expenses:[],journal:{dailyRecords:{'2026-10-31':{happy:'备份里的快乐'},'2026-11-01':{thoughts:'新的一天'}},calendarNotes:{'2026-11-01':'新注释'}}});
  vm.runInContext('applyImport(' + JSON.stringify(incoming) + ',"merge")', ledger);
  await new Promise(setImmediate);
  assert.equal(JSON.parse(storage.get('xiangqianyidian-v1')).dailyRecords['2026-10-31'].happy, '吃了一顿好饭');
  assert.equal(JSON.parse(storage.get('xiangqianyidian-v1')).calendarNotes['2026-11-01'], '新注释');
  vm.runInContext('applyImport(' + JSON.stringify(incoming) + ',"replace")', ledger);
  await new Promise(setImmediate);
  assert.equal(JSON.parse(storage.get('xiangqianyidian-v1')).dailyRecords['2026-10-31'].happy, '备份里的快乐');
  const events = {}, cache = new Map([['./growth-space/index.html','JOURNAL'], ['./index.html','LEDGER']]);
  const unrelated = [];
  const self = { registration:{scope:'https://example.com/saving-tracker/'}, location:{origin:'https://example.com'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>events[name]=fn };
  const caches = { open:async()=>({match:async req=>cache.get(typeof req==='string'?req:req.url),addAll:async reqs=>assert.ok(reqs.every(r=>r.cache==='reload'))}),keys:async()=>['savetracker-old','other-app-cache'],delete:async key=>unrelated.push(key) };
  vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'), {self,caches,URL,Request,Response,fetch:async()=>{throw Error('offline');}});
  let done;
  events.install({waitUntil:p=>done=p}); await done;
  events.activate({waitUntil:p=>done=p}); await done;
  assert.deepEqual(unrelated,['savetracker-old']);
  events.fetch({request:{method:'GET',url:'https://example.com/saving-tracker/growth-space/?embedded=1',mode:'navigate'},respondWith:p=>done=p});
  assert.equal(await done,'JOURNAL');
  events.fetch({request:{method:'GET',url:'https://example.com/saving-tracker/?installed=1',mode:'navigate'},respondWith:p=>done=p});
  assert.equal(await done,'LEDGER');
  console.log('PASS: complete backups, legacy/merge/replace imports, 0–10 day plants, draft restore/save, offline routes and cache isolation.');
}
checkImportsAndOffline().catch(error=>{ console.error(error); process.exitCode=1; });

