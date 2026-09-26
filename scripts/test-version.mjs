/**
 * 变更日志版本号纯逻辑自测（无测试框架，直接断言）
 *
 * 版本号语义：A.B.C
 *   A 大版本（按钮）｜B 小版本（按钮）｜C 只由软件自动递增
 *
 * 运行：pnpm test:version
 */
import {
  INITIAL_VERSION,
  MANUAL_BUMPS,
  bumpVersion,
  compareVersions,
  formatVersion,
  isLegacyChangelog,
  normalizeVersion,
  parseVersion,
  versionGroup,
  versionGroupLabel,
} from '../src/lib/utils/version.ts';

let fails = 0;
const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { fails++; console.log('FAIL', msg, '\n  got     ', JSON.stringify(a), '\n  expected', JSON.stringify(b)); }
  else console.log('ok  ', msg);
};

// ── 1. 初始版本 ────────────────────────────────────────────────────────────
eq(INITIAL_VERSION, '0.1.0', '新项目初始版本是 0.1.0（不再是 1.0.0）');

// ── 2. C 位：只由软件自动递增，不跨段 ──────────────────────────────────────
eq(bumpVersion('0.1.0', 'patch'), '0.1.1', '自动记录：C+1（0.1.0 → 0.1.1）');
eq(bumpVersion('0.1.1', 'patch'), '0.1.2', '自动记录：C+1（0.1.1 → 0.1.2）');
eq(bumpVersion('0.1.9', 'patch'), '0.1.10', '自动记录：C 可超过 9（0.1.10）');
eq(bumpVersion('0.2.3', 'patch'), '0.2.4', '自动记录：不跨段（B 不动）');
eq(bumpVersion('1.4.7', 'patch'), '1.4.8', '自动记录：大项目也只动 C');

// ── 3. 小版本按钮：B+1 且 C 归零 ───────────────────────────────────────────
eq(bumpVersion('0.1.2', 'minor'), '0.2.0', '小版本：0.1.2 → 0.2.0');
eq(bumpVersion('0.2.0', 'minor'), '0.3.0', '小版本：0.2.0 → 0.3.0');
eq(bumpVersion('0.1.9', 'minor'), '0.2.0', '小版本：C 位归零');
eq(bumpVersion('0.9.9', 'minor'), '0.10.0', '小版本：B 可超过 9（0.10.0）');
eq(bumpVersion('1.0.5', 'minor'), '1.1.0', '小版本：A 不动（1.0.5 → 1.1.0）');

// ── 3b. 大版本按钮：A+1 且 B/C 归零 ───────────────────────────────────────
eq(bumpVersion('0.3.0', 'major'), '1.0.0', '大版本：0.3.0 → 1.0.0');
eq(bumpVersion('0.1.7', 'major'), '1.0.0', '大版本：B/C 一起归零');
eq(bumpVersion('1.4.7', 'major'), '2.0.0', '大版本：1.4.7 → 2.0.0');
eq([...MANUAL_BUMPS], ['minor', 'major'], 'UI 上只有两个手动按钮（顺序：小版本、大版本）');

// ── 4. 解析容错 ───────────────────────────────────────────────────────────
eq(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3 }, '解析：容忍 v 前缀');
eq(parseVersion('0.2'), { major: 0, minor: 2, patch: 0 }, '解析：缺 patch 补 0');
eq(parseVersion('1'), { major: 1, minor: 0, patch: 0 }, '解析：只有 major');
eq(parseVersion(undefined), { major: 0, minor: 1, patch: 0 }, '解析：空值回退 0.1.0');
eq(parseVersion('abc'), { major: 0, minor: 1, patch: 0 }, '解析：非法值回退 0.1.0');
eq(normalizeVersion('0.1.0.5'), '0.1.0', '解析：多余段忽略');
eq(formatVersion({ major: 2, minor: 0, patch: 0 }), '2.0.0', '格式化');

// ── 5. 分组（概览里按大小版本折叠用） ──────────────────────────────────────
eq(versionGroup('0.1.3'), '0.1', '分组键：0.1.3 → 0.1');
eq(versionGroup('1.0.0'), '1.0', '分组键：1.0.0 → 1.0');
eq(versionGroupLabel('0.1'), '0.1.x', '分组标题：0.1 → 0.1.x');

// ── 6. 比较 ───────────────────────────────────────────────────────────────
eq(compareVersions('0.1.2', '0.1.10') < 0, true, '比较：0.1.2 < 0.1.10（按数值而非字符串）');
eq(compareVersions('0.2.0', '0.1.9') > 0, true, '比较：0.2.0 > 0.1.9');
eq(compareVersions('1.0.0', '1.0.0'), 0, '比较：相等');

// ── 7. 旧编号识别 + 重编 ──────────────────────────────────────────────────
eq(isLegacyChangelog('1.0.0'), true, '旧编号：1.0.0 开头 → 命中');
eq(isLegacyChangelog('0.1.0'), false, '旧编号：0.1.0 开头 → 不命中');
eq(isLegacyChangelog(undefined), false, '旧编号：空日志 → 不命中');
{
  // 复刻 store 里 renumberChangelog 的重编算法
  const versions = ['1.0.0', '1.0.1', '1.0.2', '1.0.3'].map(v => ({ version: v, info: v, auto: true }));
  let v = INITIAL_VERSION;
  const out = versions.map((e, i) => {
    if (i > 0) v = bumpVersion(v, 'patch');
    return { ...e, version: v };
  });
  eq(out.map(e => e.version), ['0.1.0', '0.1.1', '0.1.2', '0.1.3'], '重编：1.0.x 序列 → 0.1.x 序列');
  eq(out.map(e => e.info), versions.map(e => e.info), '重编：只改版本号，不动说明');
  eq(out.every(e => e.auto === true), true, '重编：保留 auto 标记');
}

console.log(fails === 0 ? '\n全部通过 ✅' : `\n${fails} 个失败 ❌`);
process.exit(fails === 0 ? 0 : 1);
