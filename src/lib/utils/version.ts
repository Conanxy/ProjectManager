/**
 * 项目变更日志的版本号工具
 *
 * 版本号是 `A.B.C` 三段：
 *
 * | 段 | 名称 | 谁来改 | 含义 |
 * |---|---|---|---|
 * | **A** | 大版本 | 「大版本 +1」按钮 | 里程碑式重构 / 不兼容变化；进位后 B、C 归零 |
 * | **B** | 小版本 | 「小版本 +1」按钮 | 一批功能；进位后 C 归零 |
 * | **C** | —（补丁位） | **只由软件自动递增**（新增/完成/删除任务、里程碑等） | 每次操作留痕 |
 *
 * 因此：
 * - 新项目从 **`0.1.0`** 开始
 * - 小版本 +1：`0.1.2 → 0.2.0`
 * - 大版本 +1：`0.3.0 → 1.0.0`
 * - 自动记录：`0.1.2 → 0.1.3`（只动 C，不跨段）
 *
 * @module utils/version
 */

/** 新项目的初始版本 */
export const INITIAL_VERSION = '0.1.0';

/**
 * 版本递增方式
 *
 * - `'major'`：A+1，B、C 归零（手动按钮）
 * - `'minor'`：B+1，C 归零（手动按钮）
 * - `'patch'`：C+1（仅供自动记录使用）
 */
export type VersionBump = 'major' | 'minor' | 'patch';

/** 解析后的版本号 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/** 取非负整数（非法值回退 0） */
function int(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * 解析版本号字符串
 *
 * 容错：`v1.2.3` / `1.2` / `1` / 空值都能解析，缺失部分补 0。
 */
export function parseVersion(v: string | null | undefined, fallback = INITIAL_VERSION): ParsedVersion {
  const raw = String(v ?? '').trim().replace(/^v/i, '');
  const parts = raw.split('.');
  if (!/^\d+$/.test(parts[0] ?? '')) {
    const f = fallback.split('.');
    return { major: int(f[0]), minor: int(f[1]), patch: int(f[2]) };
  }
  return { major: int(parts[0]), minor: int(parts[1]), patch: int(parts[2]) };
}

/** 格式化为 `major.minor.patch` */
export function formatVersion(v: ParsedVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** 归一化任意版本字符串 */
export function normalizeVersion(v: string | null | undefined): string {
  return formatVersion(parseVersion(v));
}

/**
 * 计算下一个版本号
 *
 * @param current - 当前版本（如 `0.1.2`）
 * @param kind - `'major'` A+1 且 B/C 归零；`'minor'` B+1 且 C 归零；`'patch'` C+1
 */
export function bumpVersion(current: string | null | undefined, kind: VersionBump): string {
  const v = parseVersion(current);
  switch (kind) {
    case 'major':
      return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
    default:
      return formatVersion({ major: v.major, minor: v.minor, patch: v.patch + 1 });
  }
}

/** 分组键：`major.minor`（变更日志按它折叠） */
export function versionGroup(v: string | null | undefined): string {
  const p = parseVersion(v);
  return `${p.major}.${p.minor}`;
}

/** 分组标题：`0.1` → `0.1.x` */
export function versionGroupLabel(group: string): string {
  return `${group}.x`;
}

/** 比较两个版本号（<0 / 0 / >0） */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

/**
 * 是否「旧版编号」（旧项目从 1.0.0 开始写的变更日志）
 *
 * 仅当首条就是 1.0.0 时成立；新项目从 0.1.0 开始，不会命中。
 */
export function isLegacyChangelog(firstVersion: string | null | undefined): boolean {
  return normalizeVersion(firstVersion) === '1.0.0';
}

/** 手动递增的两个按钮（顺序即 UI 顺序） */
export const MANUAL_BUMPS: readonly Exclude<VersionBump, 'patch'>[] = ['minor', 'major'];
