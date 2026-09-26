/**
 * 变更日志 UI 端到端验证（CDP 驱动 headless Chrome）
 *
 * 覆盖：新项目从 0.1.0 起、按 major.minor 分组折叠、「小版本 +1」/「大版本 +1」
 *       按钮与内联表单（小版本 B+1 / 大版本 A+1，C 位只由自动记录递增）、旧编号的一键重编。
 *
 * 前置（两个进程都要先起来）：
 *   1) pnpm dev
 *   2) /opt/chrome-headless/chrome-headless-shell --headless --no-sandbox \
 *        --remote-debugging-port=9222 --user-data-dir=/tmp/cdp-profile about:blank
 *
 * 运行：pnpm test:e2e-changelog
 *
 * 注意：开发期验证脚本，不参与构建；断言失败会以非 0 退出。
 */
const PORT = 9222;
const APP = 'http://localhost:1420/';

const mkTask = (id, title) => ({
  id, title, description: '', status: 'todo', priority: 'medium', tags: [], due_date: null,
  due_time: null, start_offset: null, dependencies: [], subtasks: [], comments: [],
  tracked_start: null, reminder: null,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
});

const SEED = [{
  id: 'p1', name: 'Legacy', description: '', color: '#4f46e5', template: 'default',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  archived: false, sync_enabled: true, sort_order: 0,
  tasks: [mkTask('t1', 'T1'), mkTask('t2', 'T2')],
  tags: [], milestones: [], readme: '# x',
  changelog: [
    { version: '1.0.0', date: '2026-01-01', info: '项目启动' },
    { version: '1.0.1', date: '2026-01-02', info: '创建任务 A' },
    { version: '1.0.2', date: '2026-01-03', info: '创建任务 B' },
    { version: '1.1.0', date: '2026-01-04', info: '第一个里程碑' },
  ],
}];

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { resolve, reject } = c.pending.get(m.id);
        c.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
    return r.result.value;
  }
}

let fails = 0;
const check = (cond, msg, extra = '') => {
  if (cond) console.log('ok   ', msg);
  else { fails++; console.log('FAIL ', msg, extra); }
};

const click = async (cdp, js) => {
  const ok = await cdp.eval(`(() => { const e = ${js}; if (!e) return false; e.click(); return true; })()`);
  await sleep(350);
  return ok;
};
const versions = `(JSON.parse(localStorage.pm_projects)[0].changelog || []).map(e => e.version)`;
const autos = `(JSON.parse(localStorage.pm_projects)[0].changelog || []).map(e => e.auto === true)`;
const groups = `[...document.querySelectorAll('.cl-group')].map(g => ({ label: g.querySelector('.cl-group-label').textContent.trim(), open: g.classList.contains('open'), items: g.querySelectorAll('.changelog-item').length, count: g.querySelector('.cl-group-count').textContent.trim() }))`;

async function preflight() {
  try {
    await fetch('http://localhost:1420/', { method: 'HEAD' });
  } catch {
    console.error('✗ 开发服务器未启动：请先运行 `pnpm dev`');
    process.exit(2);
  }
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    console.error('✗ 调试端口 9222 未就绪，请先启动：\n' +
      '  /opt/chrome-headless/chrome-headless-shell --headless --no-sandbox \\\n' +
      '    --remote-debugging-port=9222 --user-data-dir=/tmp/cdp-profile about:blank');
    process.exit(2);
  }
}

(async () => {
  await preflight();
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const cdp = await CDP.connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 950, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP });
  await sleep(2500);
  await cdp.eval(`localStorage.clear(); localStorage.setItem('pm_tutorial_seen','1'); localStorage.setItem('pm_projects', ${JSON.stringify(JSON.stringify(SEED))});`);
  await cdp.send('Page.reload');
  await sleep(2500);   // 等导航真正提交，避免在旧 document 上查询

  // 选中项目 → 概览
  await cdp.eval(`document.querySelector('.project-list [data-sortable-item]').click()`);
  await sleep(500);
  await click(cdp, `[...document.querySelectorAll('.toggle-btn')].find(b => b.textContent.trim() === '概览')`);
  await sleep(300);
  check(await cdp.eval(`!!document.querySelector('.cl-header')`), '概览里有变更日志头部（标题 + 两个按钮）');

  // ── 分组与折叠 ─────────────────────────────────────────────────────────
  let g = await cdp.eval(groups);
  check(JSON.stringify(g.map(x => x.label)) === JSON.stringify(['1.1.x', '1.0.x']), '按 major.minor 分组且新的在前', JSON.stringify(g.map(x => x.label)));
  check(g[0].open === true && g[1].open === false, '默认：最新一组展开、旧组折叠', JSON.stringify(g.map(x => x.open)));
  check(g[1].count === '3 条', '分组计数展示（1.0.x → 3 条）', JSON.stringify(g.map(x => x.count)));
  check(g[1].items === 0, '折叠组不渲染条目');

  await click(cdp, `document.querySelectorAll('.cl-group-head')[1]`);
  g = await cdp.eval(groups);
  check(g[1].open === true && g[1].items === 3, '点分组头可展开旧组（3 条）', JSON.stringify(g[1]));
  await click(cdp, `document.querySelectorAll('.cl-group-head')[0]`);
  g = await cdp.eval(groups);
  check(g[0].open === false && g[0].items === 0, '再点可折叠最新组', JSON.stringify(g[0]));

  // ── 旧编号提示 + 重编 ───────────────────────────────────────────────────
  check(await cdp.eval(`!!document.querySelector('.cl-legacy')`), '检测到 1.0.0 旧编号 → 显示提示');
  check(await cdp.eval(`document.querySelector('.cl-current').textContent.trim()`) === 'v1.1.0', '当前版本徽标显示 v1.1.0');
  await click(cdp, `document.querySelector('.cl-legacy-btn')`);
  await click(cdp, `document.querySelector('.cl-legacy-btn.danger')`);
  check(JSON.stringify(await cdp.eval(versions)) === JSON.stringify(['0.1.0', '0.1.1', '0.1.2', '0.1.3']),
    '重编后：1.0.x/1.1.0 → 0.1.0 起', JSON.stringify(await cdp.eval(versions)));
  check(!(await cdp.eval(`!!document.querySelector('.cl-legacy')`)), '重编后旧编号提示消失');
  g = await cdp.eval(groups);
  check(JSON.stringify(g.map(x => x.label)) === JSON.stringify(['0.1.x']) && g[0].count === '4 条',
    '重编后归入同一组 0.1.x（4 条）', JSON.stringify(g));

  // ── 小版本按钮 ─────────────────────────────────────────────────────────
  const btnText = await cdp.eval(`[...document.querySelectorAll('.cl-btn')].map(b => b.textContent.replace(/\\s+/g,' ').trim())`);
  check(btnText.length === 2 && btnText[0].includes('0.2.0') && btnText[1].includes('1.0.0'),
    '两个按钮分别预览 小版本 0.2.0 / 大版本 1.0.0', JSON.stringify(btnText));

  await click(cdp, `document.querySelectorAll('.cl-btn')[0]`);
  check(await cdp.eval(`document.querySelector('.cl-ver-chip')?.textContent.trim()`) === '0.2.0', '小版本表单预览 0.2.0');
  await cdp.eval(`(() => { const i = document.querySelector('.cl-form .input'); i.value = '修了导出'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(200);
  await click(cdp, `document.querySelector('.cl-form .ms-submit')`);
  let v = await cdp.eval(versions);
  check(JSON.stringify(v) === JSON.stringify(['0.1.0', '0.1.1', '0.1.2', '0.1.3', '0.2.0']), '小版本按钮：新增 0.2.0（C 位归零）', JSON.stringify(v));
  check(await cdp.eval(`JSON.parse(localStorage.pm_projects)[0].changelog.at(-1).info`) === '修了导出', '自定义说明被写入');
  check(await cdp.eval(`JSON.parse(localStorage.pm_projects)[0].changelog.at(-1).auto`) === false, '手动发布条目：auto === false');
  check(await cdp.eval(`JSON.stringify(JSON.parse(localStorage.pm_projects)[0].changelog.slice(0,4).map(e => 'auto' in e))`) === JSON.stringify([false, false, false, false]),
    '旧数据不被硬塞 auto 标记（保持“普通”显示）');
  check(await cdp.eval(`document.querySelector('.cl-group.open .changelog-item .changelog-tag')?.textContent.trim()`) === '发布',
    'UI：最新一条手动发版显示「发布」标签');
  g = await cdp.eval(groups);
  check(JSON.stringify(g.map(x => x.label)) === JSON.stringify(['0.2.x', '0.1.x']), '小版本产生新分组 0.2.x', JSON.stringify(g.map(x => x.label)));

  // ── 大版本按钮（A+1，B/C 归零）────────────────────────────────────────
  await click(cdp, `document.querySelectorAll('.cl-btn')[1]`);
  check(await cdp.eval(`document.querySelector('.cl-ver-chip')?.textContent.trim()`) === '1.0.0', '大版本表单预览 1.0.0');
  await click(cdp, `document.querySelector('.cl-form .ms-submit')`);
  v = await cdp.eval(versions);
  check(v.at(-1) === '1.0.0', '大版本：新增 1.0.0（B/C 归零）', JSON.stringify(v));
  g = await cdp.eval(groups);
  check(JSON.stringify(g.map(x => x.label)) === JSON.stringify(['1.0.x', '0.2.x', '0.1.x']), '出现新分组 1.0.x 在最上', JSON.stringify(g.map(x => x.label)));
  check(g[0].open === true && g[1].open === false, '新分组默认展开、旧分组折叠', JSON.stringify(g.map(x => x.open)));
  check(await cdp.eval(`JSON.parse(localStorage.pm_projects)[0].changelog.at(-1).info`) === '发布大版本 1.0.0',
    '留空时用默认文案「发布大版本 1.0.0」');

  // ── 自动记录只动 C 位（新增任务）─────────────────────────────────────────
  await cdp.eval(`(() => {
    const list = JSON.parse(localStorage.pm_projects);
    list[0].changelog = [{ version: '0.2.3', date: '2026-02-01', info: '基线', auto: true }];
    localStorage.setItem('pm_projects', JSON.stringify(list));
  })()`);
  await cdp.send('Page.reload');
  await sleep(2500);
  await cdp.eval(`document.querySelector('.project-list [data-sortable-item]').click()`);
  await sleep(400);
  await click(cdp, `[...document.querySelectorAll('.toggle-btn')].find(b => b.textContent.trim() === '列表')`);
  await cdp.eval(`(() => {
    const i = document.querySelector('.task-add .add-input');
    i.value = '自动记录测试';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    const b = [...document.querySelectorAll('.task-add button')].find(x => x.textContent.trim() === '添加');
    if (b) b.click();
  })()`);
  await sleep(600);
  v = await cdp.eval(versions);
  check(v.at(-1) === '0.2.4', '自动记录：0.2.3 → 0.2.4（只动 C 位）', JSON.stringify(v));
  check((await cdp.eval(autos)).at(-1) === true, '自动记录的 auto 标记为 true');
  // 回到概览看视觉区分（上一步在列表视图，变更日志不在 DOM 里）
  await click(cdp, `[...document.querySelectorAll('.toggle-btn')].find(b => b.textContent.trim() === '概览')`);
  await sleep(300);
  check(await cdp.eval(`document.querySelector('.cl-group.open .changelog-item .changelog-tag')?.textContent.trim()`) === '自动',
    'UI：最新一条自动记录显示「自动」标签');
  check(await cdp.eval(`document.querySelector('.cl-group.open .changelog-item')?.classList.contains('auto')`) === true,
    'UI：自动记录条目带 .auto 样式（弱化显示）');

  // ── 新建项目从 0.1.0 开始 ───────────────────────────────────────────────
  await click(cdp, `[...document.querySelectorAll('.sidebar-new .btn')][0]`);
  await cdp.eval(`(() => { const i = document.querySelector('.modal-body input.input, .modal-body input'); i.value = 'Fresh'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(200);
  const created = await cdp.eval(`(() => { const b = [...document.querySelectorAll('.modal-footer .btn')].find(x => x.textContent.trim() === '创建'); if (!b) return false; b.click(); return true; })()`);
  await sleep(500);
  check(created, '新建项目表单可提交');
  const fresh = await cdp.eval(`(JSON.parse(localStorage.pm_projects).find(p => p.name === 'Fresh') || {}).changelog`);
  check(JSON.stringify((fresh || []).map(e => e.version)) === JSON.stringify(['0.1.0']),
    '新项目变更日志从 0.1.0 开始', JSON.stringify(fresh));

  console.log(fails === 0 ? '\n全部通过 ✅' : `\n${fails} 个失败 ❌`);
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('运行异常', e); process.exit(1); });
