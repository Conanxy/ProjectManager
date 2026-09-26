/**
 * `.pm` 数据格式：**版本 / 迁移 / 校验**
 *
 * 导入是最容易「静默变脏」的入口：旧实现只做 `JSON.parse` + 两个字段判空，
 * 畸形文件会半截落地。这里提供统一入口 `parsePmText()`：
 *
 * ```
 * 原文  →  体积检查  →  JSON.parse  →  迁移(detect+migrate)  →  校验(带字段路径)  →  PmFile
 * ```
 *
 * 设计原则：
 * - **版本驱动迁移**：以后改字段只在 `STEPS` 里加一步，不再到处写「兼容旧数据」
 * - **必需的少**：只校验会引发崩溃/数据错乱的字段（id/name/tasks 结构等）
 * - **容错的多**：可选字段缺失由迁移补默认值，不算错误
 * - **有上限**：防止畸形/超大文件把浏览器拖死（任务数、字符串长度、总体积）
 *
 * @module utils/pm-schema
 */

import type { PmFile, Task, Tag, Milestone, ChangelogEntry } from '$lib/types';

/** 合法循环频率（与 types/task.ts 的 RecurrenceFreq 保持一致） */
const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

/** 当前 `.pm` 结构版本（历史文件无此字段 → 视为 v1） */
export const CURRENT_PM_SCHEMA = 3;

/** 单个 `.pm` 文件体积上限（字符数）：32MB */
export const MAX_PM_CHARS = 32 * 1024 * 1024;
/** 任务数上限 */
export const MAX_TASKS = 20000;
/** 单个字符串字段长度上限 */
export const MAX_TEXT = 200_000;

export interface PmValidationError {
  /** 字段路径，如 `tasks[3].title` */
  path: string;
  /** 人类可读的原因 */
  message: string;
}

export type PmValidationResult =
  | { ok: true; pm: PmFile; warnings: string[] }
  | { ok: false; errors: PmValidationError[] };

/** 是否普通对象 */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 校验字符串字段 */
function checkText(
  value: unknown,
  path: string,
  errors: PmValidationError[],
  { required = false, max = MAX_TEXT }: { required?: boolean; max?: number } = {}
): void {
  if (value === undefined || value === null) {
    if (required) errors.push({ path, message: '缺失或为 null' });
    return;
  }
  if (typeof value !== 'string') {
    errors.push({ path, message: `应为字符串，实际是 ${Array.isArray(value) ? 'array' : typeof value}` });
    return;
  }
  if (value.length > max) errors.push({ path, message: `长度 ${value.length} 超过上限 ${max}` });
}

/** 校验数组字段 */
function checkArray(value: unknown, path: string, errors: PmValidationError[], max: number): unknown[] {
  if (!Array.isArray(value)) {
    errors.push({ path, message: `应为数组，实际是 ${value === null ? 'null' : typeof value}` });
    return [];
  }
  if (value.length > max) errors.push({ path, message: `元素数 ${value.length} 超过上限 ${max}` });
  return value;
}

/**
 * 校验一个已经 `JSON.parse` 过的 `.pm` 对象
 *
 * @param raw - 解析后的对象
 * @param opts - 可选：来源描述（用于错误信息）
 */
export function validatePm(raw: unknown, opts: { source?: string } = {}): PmValidationResult {
  const errors: PmValidationError[] = [];
  const warnings: string[] = [];
  const where = opts.source ? `（来自 ${opts.source}）` : '';

  if (!isObj(raw)) {
    return { ok: false, errors: [{ path: '', message: `顶层不是对象${where}` }] };
  }

  if (typeof raw.version !== 'string' || !raw.version.trim()) {
    errors.push({ path: 'version', message: '缺失或不是字符串' });
  }

  // ── project ────────────────────────────────────────────────────────────────
  if (!isObj(raw.project)) {
    errors.push({ path: 'project', message: `缺失或不是对象${where}` });
  } else {
    const p = raw.project;
    checkText(p.name, 'project.name', errors, { required: true, max: 500 });
    checkText(p.description, 'project.description', errors);
    checkText(p.color, 'project.color', errors, { max: 64 });
    checkText(p.created_at, 'project.created_at', errors, { max: 64 });
    checkText(p.updated_at, 'project.updated_at', errors, { max: 64 });
    if (p.template !== undefined) checkText(p.template, 'project.template', errors, { max: 32 });
    if (p.id !== undefined) checkText(p.id, 'project.id', errors, { max: 200 });
    if (p.storage !== undefined && !isObj(p.storage)) {
      errors.push({ path: 'project.storage', message: '应为对象' });
    }
  }

  // ── tasks ──────────────────────────────────────────────────────────────────
  const tasks = checkArray(raw.tasks, 'tasks', errors, MAX_TASKS);
  tasks.forEach((t, i) => {
    const at = `tasks[${i}]`;
    if (!isObj(t)) {
      errors.push({ path: at, message: '应为对象' });
      return;
    }
    const task = t as Record<string, unknown>;
    checkText(task.id, `${at}.id`, errors, { required: true, max: 200 });
    checkText(task.title, `${at}.title`, errors, { required: true, max: 2000 });
    checkText(task.description, `${at}.description`, errors);
    if (task.status !== undefined && !['todo', 'in_progress', 'done'].includes(String(task.status))) {
      // 只警告：历史数据可能有别的取值，不阻断导入
      warnings.push(`${at}.status = ${JSON.stringify(task.status)} 不是标准状态，已按原样保留`);
    }
    if (task.dependencies !== undefined) checkArray(task.dependencies, `${at}.dependencies`, errors, 500);
    if (task.recurrence !== undefined && task.recurrence !== null) {
      const rec = task.recurrence;
      if (!isObj(rec)) {
        errors.push({ path: `${at}.recurrence`, message: '应为对象或 null' });
      } else {
        const freq = rec.freq;
        if (!FREQS.includes(String(freq))) {
          errors.push({ path: `${at}.recurrence.freq`, message: `缺失或非法（应为 ${FREQS.join('/')}）` });
        }
        if (rec.interval !== undefined && (typeof rec.interval !== 'number' || !(rec.interval >= 1))) {
          errors.push({ path: `${at}.recurrence.interval`, message: '应为 ≥1 的数字' });
        }
        if (rec.end !== undefined && !['never', 'count', 'until'].includes(String(rec.end))) {
          errors.push({ path: `${at}.recurrence.end`, message: '应为 never/count/until' });
        }
        if (rec.count !== undefined && (typeof rec.count !== 'number' || rec.count < 0)) {
          errors.push({ path: `${at}.recurrence.count`, message: '应为 ≥0 的数字' });
        }
        if (rec.until !== undefined) checkText(rec.until, `${at}.recurrence.until`, errors, { max: 32 });
        if (rec.byWeekday !== undefined) checkArray(rec.byWeekday, `${at}.recurrence.byWeekday`, errors, 7);
      }
    }
    if (task.subtasks !== undefined) checkArray(task.subtasks, `${at}.subtasks`, errors, 2000);
    if (task.comments !== undefined) checkArray(task.comments, `${at}.comments`, errors, 5000);
    if (task.tags !== undefined) checkArray(task.tags, `${at}.tags`, errors, 200);
  });

  // ── tags / milestones / changelog ─────────────────────────────────────────
  if (raw.tags !== undefined) {
    checkArray(raw.tags, 'tags', errors, 5000).forEach((t, i) => {
      if (!isObj(t)) { errors.push({ path: `tags[${i}]`, message: '应为对象' }); return; }
      checkText((t as unknown as Tag).name, `tags[${i}].name`, errors, { required: true, max: 200 });
    });
  }
  if (raw.milestones !== undefined) {
    checkArray(raw.milestones, 'milestones', errors, 2000).forEach((m, i) => {
      if (!isObj(m)) { errors.push({ path: `milestones[${i}]`, message: '应为对象' }); return; }
      checkText((m as unknown as Milestone).title, `milestones[${i}].title`, errors, { required: true, max: 500 });
      checkText((m as unknown as Milestone).date, `milestones[${i}].date`, errors, { required: true, max: 64 });
    });
  }
  if (raw.changelog !== undefined) {
    checkArray(raw.changelog, 'changelog', errors, 20000).forEach((c, i) => {
      if (!isObj(c)) { errors.push({ path: `changelog[${i}]`, message: '应为对象' }); return; }
      checkText((c as unknown as ChangelogEntry).version, `changelog[${i}].version`, errors, { required: true, max: 32 });
    });
  }

  // ── template.file_contents（可选，但类型必须对）────────────────────────────
  if (raw.template !== undefined) {
    if (!isObj(raw.template)) {
      errors.push({ path: 'template', message: '应为对象' });
    } else if ((raw.template as Record<string, unknown>).file_contents !== undefined
      && !isObj((raw.template as Record<string, unknown>).file_contents)) {
      errors.push({ path: 'template.file_contents', message: '应为对象（路径 → 内容）' });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // 类型已在上面校验过，这里做一次安全转型（缺的可选字段由 migratePm 补）
  const pm = raw as unknown as PmFile;
  if (!Array.isArray(pm.tasks)) pm.tasks = [] as Task[];
  return { ok: true, pm, warnings };
}

/**
 * 解析 `.pm` JSON 字符串：体积检查 → JSON.parse → **校验（不迁移）**
 *
 * ⚠️ 导入请用 {@link parsePmText}（它会先迁移，老文件才不会被判为非法）。
 *
 * @param text - 文件内容
 * @param source - 来源描述（文件名），用于错误信息
 */
export function parsePm(text: string, source?: string): PmValidationResult {
  const label = source ? `（来自 ${source}）` : '';
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, errors: [{ path: '', message: `文件为空${label}` }] };
  }
  if (text.length > MAX_PM_CHARS) {
    return {
      ok: false,
      errors: [{ path: '', message: `文件过大（${(text.length / 1024 / 1024).toFixed(1)}MB，上限 32MB）${label}` }],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      errors: [{ path: '', message: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}${label}` }],
    };
  }
  return validatePm(raw, { source });
}

/** 把错误列表压成一行可读文案（只列前几条） */
export function formatPmErrors(errors: PmValidationError[], limit = 3): string {
  const shown = errors.slice(0, limit).map((e) => (e.path ? `${e.path}：${e.message}` : e.message));
  const more = errors.length > limit ? ` …另有 ${errors.length - limit} 处问题` : '';
  return shown.join('；') + more;
}


// ─── 迁移 ───────────────────────────────────────────────────────────────────

/** 迁移步骤：把 v(i+1) 升到 v(i+2) */
type MigrationStep = (raw: Record<string, unknown>) => Record<string, unknown>;

/** 推断对象的结构版本（无字段 → v1） */
export function detectSchemaVersion(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return CURRENT_PM_SCHEMA;
  const v = (raw as Record<string, unknown>).schema_version;
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** v1 → v2：补 `schema_version`，并补齐 v2 之前可能缺失的数组/可空字段 */
const v1_to_v2: MigrationStep = (raw) => {
  const next: Record<string, unknown> = { ...raw, schema_version: 2 };

  // ⚠️ 只补「缺失/空」的字段，**不纠正类型**：
  // 把 `tasks: {}` 默默改成 `[]` 等于把用户数据吞了，应当交给校验器报错。
  const fillArray = (v: unknown): unknown => (v === undefined || v === null ? [] : v);
  next.tasks = fillArray(next.tasks);
  next.tags = fillArray(next.tags);
  next.milestones = fillArray(next.milestones);
  next.changelog = fillArray(next.changelog);

  // 任务：补齐可选字段的类型稳定默认值（避免下游 `t.subtasks.filter` 之类炸掉）
  if (Array.isArray(next.tasks)) {
    next.tasks = (next.tasks as unknown[]).map((t) => {
      if (typeof t !== 'object' || t === null) return t;
      const task = t as Record<string, unknown>;
      const fillArr2 = (v: unknown): unknown => (v === undefined || v === null ? [] : v);
      return {
        ...task,
        tags: fillArr2(task.tags),
        dependencies: fillArr2(task.dependencies),
        subtasks: fillArr2(task.subtasks),
        comments: fillArr2(task.comments),
        description: typeof task.description === 'string' ? task.description : (task.description ?? ''),
        due_date: task.due_date ?? null,
        due_time: task.due_time ?? null,
        start_offset: task.start_offset ?? null,
        tracked_start: task.tracked_start ?? null,
        reminder: task.reminder ?? null,
      };
    });
  }
  return next;
};

/** v2 → v3：任务补 `recurrence: null`（**只补缺失，不动已存在的值**） */
const v2_to_v3: MigrationStep = (raw) => {
  const next: Record<string, unknown> = { ...raw, schema_version: 3 };
  if (Array.isArray(next.tasks)) {
    next.tasks = (next.tasks as unknown[]).map((t) => {
      if (typeof t !== 'object' || t === null) return t;
      const task = t as Record<string, unknown>;
      // ⚠️ 只处理「没有这个字段」的情况：`recurrence: {}` 这类类型错误要留给校验器报错，
      //    迁移里默默改成 null 等于吞掉用户/第三方的错误数据。
      if ('recurrence' in task) return task;
      return { ...task, recurrence: null };
    });
  }
  return next;
};

/** 迁移链：索引 i 负责把 v(i+1) 升到 v(i+2) */
const STEPS: MigrationStep[] = [v1_to_v2, v2_to_v3];

/**
 * 把任意版本的 `.pm` 对象迁移到当前版本
 *
 * @returns `{ pm, migratedFrom }`；`migratedFrom` 为 null 表示本来就是当前版本
 */
export function migratePm(raw: unknown): { pm: Record<string, unknown>; migratedFrom: number | null } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { pm: {}, migratedFrom: null };
  }
  const from = detectSchemaVersion(raw);
  let current = raw as Record<string, unknown>;
  if (from >= CURRENT_PM_SCHEMA) {
    return { pm: current, migratedFrom: null };
  }
  for (let v = from; v < CURRENT_PM_SCHEMA; v++) {
    const step = STEPS[v - 1];
    if (!step) break;
    current = step(current);
  }
  current.schema_version = CURRENT_PM_SCHEMA;
  return { pm: current, migratedFrom: from };
}

// ─── 统一入口 ───────────────────────────────────────────────────────────────

export interface PmParseOk {
  ok: true;
  pm: PmFile;
  /** 迁移来源版本（null = 本来就是当前版本） */
  migratedFrom: number | null;
  warnings: string[];
}

/**
 * 解析 `.pm` 文本：体积检查 → JSON.parse → 迁移 → 校验
 *
 * **所有导入路径都应该走这里**（本地文件、服务器拉取、备份恢复、demo 加载）。
 *
 * @param text - 文件内容
 * @param source - 来源描述（文件名 / 项目名），用于错误信息
 */
export function parsePmText(text: string, source?: string): PmValidationResult & { migratedFrom?: number | null } {
  const label = source ? `（来自 ${source}）` : '';
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, errors: [{ path: '', message: `文件为空${label}` }] };
  }
  if (text.length > MAX_PM_CHARS) {
    return {
      ok: false,
      errors: [{ path: '', message: `文件过大（${(text.length / 1024 / 1024).toFixed(1)}MB，上限 32MB）${label}` }],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      errors: [{ path: '', message: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}${label}` }],
    };
  }
  const { pm, migratedFrom } = migratePm(raw);
  const result = validatePm(pm, { source });
  if (!result.ok) return result;
  return { ...result, migratedFrom };
}
