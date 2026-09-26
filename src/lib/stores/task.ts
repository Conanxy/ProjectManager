/**
 * 任务 CRUD stores
 *
 * 管理任务的创建、更新、删除、状态切换、排序。
 * 管理子任务、依赖关系、评论、工时追踪、提醒。
 * 所有数据变更自动持久化到 localStorage。
 *
 * @module stores/task
 */

import { get } from 'svelte/store';
import type { Task, TaskStatus, Dependency, Subtask, RecurrenceRule } from '$lib/types';
import { consumeRule, nextOccurrence, normalizeDate, normalizeRule } from '$lib/utils/recurrence';

import { genId } from '$lib/utils/id';
import { now, today } from '$lib/utils/date';
import { projects, addChangelogEntry, persistProject } from './project';
import { activeTaskId } from './filter';
import { pushHistory } from './history';
import { t as i18n } from '$lib/i18n';
import { runHook } from '$lib/plugins';

/**
 * 调整任务在列表中的顺序
 *
 * @param projectId - 项目 ID
 * @param taskId - 要移动的任务 ID
 * @param newIndex - 目标位置索引
 * @param skipHistory - 跳过历史快照（用于「改状态 + 调位置」这类一次拖拽两步变更，只记一步撤销）
 */
export function reorderTask(projectId: string, taskId: string, newIndex: number, skipHistory = false): void {
  if (!skipHistory) pushHistory();
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const idx = p.tasks.findIndex(t => t.id === taskId);
    if (idx === -1 || idx === newIndex) return p;
    const tasks = [...p.tasks];
    const [moved] = tasks.splice(idx, 1);
    tasks.splice(newIndex, 0, moved);
    const updated = { ...p, tasks, updated_at: now() };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 在指定项目中创建新任务
 *
 * @param projectId - 项目 ID
 * @param title - 任务标题
 */
export function createTask(projectId: string, title: string, status?: string): void {
  pushHistory();
  const t: Task = {
    id: genId(), title, description: '', status: (status || 'todo') as TaskStatus, priority: 'medium',
    color: pickTaskColor(projectId),
    tags: [], due_date: null, due_time: null, start_offset: null, dependencies: [], subtasks: [], comments: [],
    tracked_start: null, reminder: null, created_at: now(), updated_at: now()
  };
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = { ...p, tasks: [...p.tasks, t], updated_at: now() };
    persistProject(updated);
    return updated;
  }));
  addChangelogEntry(projectId, i18n.get()('changelog.createTask').replace('{title}', title));
  runHook('onTaskCreate', { projectId, task: t });
}

/**
 * 更新任务属性
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param data - 要更新的属性（部分更新）
 */
/** 预设任务颜色数组 */
export const TASK_COLORS = ['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6'];

/** 从预设颜色中取一个（基于项目现有任务数取模，尽量分散） */
export function pickTaskColor(projectId: string): string {
  const p = get(projects).find(x => x.id === projectId);
  const count = p?.tasks.length ?? 0;
  return TASK_COLORS[count % TASK_COLORS.length];
}

export function updateTask(projectId: string, taskId: string, data: Partial<Task>): boolean {
  // 检查前置依赖：标记为 done 时需全部前置完成
  if (data.status === 'done') {
    const proj = get(projects).find(p => p.id === projectId);
    if (proj) {
      const task = proj.tasks.find(t => t.id === taskId);
      if (task && task.dependencies.length > 0) {
        const pendingDeps = task.dependencies.filter(dep => {
          const depTask = proj.tasks.find(t => t.id === dep.taskId);
          return depTask && depTask.status !== 'done';
        });
        if (pendingDeps.length > 0) {
          const names = pendingDeps.map(d => {
            const t = proj.tasks.find(t2 => t2.id === d.taskId);
            return t?.title || d.taskId;
          });
          console.warn(`[Task] 前置任务未完成，无法标记完成: ${names.join(', ')}`);
          return false;
        }
      }
    }
  }

  pushHistory();
  let taskTitle = '';
  let prevStatus: TaskStatus | null = null;
  let nextStatus: TaskStatus | null = null;
  const changes: string[] = [];
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const task = p.tasks.find(t => t.id === taskId);
    if (task) {
      taskTitle = task.title;
      const _t = i18n.get();
      if (data.title && data.title !== task.title) changes.push(_t('changelog.titleChange').replace('{title}', data.title));
      if (data.priority && data.priority !== task.priority) {
        changes.push(_t('changelog.priorityChange').replace('{priority}', _t(`priority.${data.priority}`)));
      }
      if (data.status && data.status !== task.status) {
        prevStatus = task.status;
        nextStatus = data.status;
        changes.push(_t('changelog.statusSet').replace('{status}', _t(`status.${data.status}`)));
      }
    }
    const updated = {
      ...p,
      tasks: p.tasks.map(t => (t.id === taskId ? { ...t, ...data, updated_at: now() } : t)),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
  if (taskTitle && changes.length > 0) {
    addChangelogEntry(projectId, i18n.get()('changelog.changes').replace('{title}', taskTitle).replace('{changes}', changes.join(', ')));
  }
  if (prevStatus && nextStatus && prevStatus !== nextStatus) {
    runHook('onTaskStatusChange', { projectId, taskId, from: prevStatus, to: nextStatus });
  }
  return true;
}

/**
 * 删除任务
 *
 * @param projectId - 项目 ID
 * @param taskId - 要删除的任务 ID
 */
export function deleteTask(projectId: string, taskId: string): void {
  pushHistory();
  let taskTitle = '';
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const task = p.tasks.find(t => t.id === taskId);
    if (task) taskTitle = task.title;
    const updated = { ...p, tasks: p.tasks.filter(t => t.id !== taskId), updated_at: now() };
    persistProject(updated);
    return updated;
  }));
  activeTaskId.update(curr => (curr === taskId ? null : curr));
  if (taskTitle) addChangelogEntry(projectId, i18n.get()('changelog.deleteTask').replace('{title}', taskTitle));
}

/**
 * 切换任务状态（todo ↔ done）
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 */
/**
 * 检查「能否标记为完成」（前置依赖必须全部完成）
 *
 * 抽出来给「普通完成」与「循环任务完成」共用，避免两套判断走偏。
 */
function canCompleteTask(projectId: string, taskId: string): boolean {
  const proj = get(projects).find(p => p.id === projectId);
  if (!proj) return true;
  const task = proj.tasks.find(t => t.id === taskId);
  if (!task || task.dependencies.length === 0) return true;
  const pendingDeps = task.dependencies.filter(dep => {
    const depTask = proj.tasks.find(t => t.id === dep.taskId);
    return depTask && depTask.status !== 'done';
  });
  if (pendingDeps.length === 0) return true;
  const names = pendingDeps.map(d => proj.tasks.find(t => t.id === d.taskId)?.title || d.taskId);
  console.warn(`[Task] 前置任务未完成，无法标记完成: ${names.join(', ')}`);
  return false;
}

/**
 * 设置 / 清除任务的循环规则
 *
 * @param rule - 传 null 表示清除（变回普通任务）
 */
export function setRecurrence(projectId: string, taskId: string, rule: RecurrenceRule | null): void {
  pushHistory();
  const normalized = rule ? normalizeRule(rule) : null;
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => (t.id === taskId ? { ...t, recurrence: normalized, updated_at: now() } : t)),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 完成一次循环任务
 *
 * 语义（**只在这一个显式入口里生成下一个实例**，`updateTask()` 绝不偷偷生成）：
 *  1. 前置依赖检查（与普通完成一致），不通过返回 null
 *  2. 当前任务标记 `done`
 *  3. 规则未耗尽：以 `due_date`（缺失则今天）为基准算下次日期，新建**同标题/描述/标签/
 *     优先级/子任务**（子任务 done 重置为 false）的新任务：
 *     `due_date = 下次日期`、`recurrence = consumeRule(rule)` + `sourceTaskId = 原任务 id`
 *  4. 原任务的 `recurrence` 置 null（避免二次触发）
 *  5. 写 changelog（含任务名与下次日期）
 *
 * 只调用**一次** `pushHistory()`（对用户而言这是一次操作）。
 *
 * @returns 新任务 id；未生成（规则用尽/依赖未满足）返回 null
 */
export function completeRecurringTask(projectId: string, taskId: string): string | null {
  if (!canCompleteTask(projectId, taskId)) return null;

  const proj = get(projects).find(p => p.id === projectId);
  const task = proj?.tasks.find(t => t.id === taskId);
  if (!proj || !task) return null;
  const rule = task.recurrence ? normalizeRule(task.recurrence) : null;

  const baseDate = normalizeDate(task.due_date || today());
  const nextDate = rule ? nextOccurrence(rule, baseDate) : null;

  const newTask: Task | null = rule && nextDate
    ? {
        ...task,
        id: genId(),
        status: 'todo',
        due_date: nextDate,
        recurrence: { ...consumeRule(rule), sourceTaskId: task.id },
        subtasks: task.subtasks.map(sub => ({ ...sub, id: genId(), done: false })),
        comments: [],
        dependencies: [...task.dependencies],
        tracked_start: null,
        reminder: null,
        created_at: now(),
        updated_at: now()
      }
    : null;

  pushHistory();
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const tasks = p.tasks.map(t => (t.id === taskId
      ? { ...t, status: 'done' as TaskStatus, recurrence: null, updated_at: now() }
      : t));
    if (newTask) tasks.push(newTask);
    const updated = { ...p, tasks, updated_at: now() };
    persistProject(updated);
    return updated;
  }));

  const _t = i18n.get();
  addChangelogEntry(
    projectId,
    newTask
      ? _t('changelog.recurCompleted').replace('{title}', task.title).replace('{date}', nextDate ?? '')
      : _t('changelog.statusChange').replace('{title}', task.title).replace('{status}', _t('status.done'))
  );

  return newTask?.id ?? null;
}

export function toggleTaskStatus(projectId: string, taskId: string): boolean {
  // 循环任务：走显式的「完成一次」路径（生成下一个实例）
  const target = get(projects).find(p => p.id === projectId)?.tasks.find(t => t.id === taskId);
  if (target && target.status !== 'done' && target.recurrence) {
    return completeRecurringTask(projectId, taskId) !== null || canCompleteTask(projectId, taskId);
  }

  // 先检查前置依赖
  const proj = get(projects).find(p => p.id === projectId);
  if (proj) {
    const task = proj.tasks.find(t => t.id === taskId);
    if (task && task.dependencies.length > 0) {
      // 正在尝试标记为完成（当前状态不是 done 时 next 为 done）
      const isTryingDone = task.status !== 'done';
      if (isTryingDone) {
        const pendingDeps = task.dependencies.filter(dep => {
          const depTask = proj.tasks.find(t => t.id === dep.taskId);
          return depTask && depTask.status !== 'done';
        });
        if (pendingDeps.length > 0) {
          const names = pendingDeps.map(d => {
            const t = proj.tasks.find(t2 => t2.id === d.taskId);
            return t?.title || d.taskId;
          });
          console.warn(`[Task] 前置任务未完成，无法标记完成: ${names.join(', ')}`);
          return false;
        }
      }
    }
  }

  pushHistory();
  const next: Record<TaskStatus, TaskStatus> = { todo: 'done', in_progress: 'done', done: 'todo' };
  let taskTitle = '';
  let newStatus: TaskStatus = 'todo';
  let oldStatus: TaskStatus | null = null;
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const task = p.tasks.find(t => t.id === taskId);
    if (task) { taskTitle = task.title; oldStatus = task.status; newStatus = next[task.status]; }
    const updated = {
      ...p,
      tasks: p.tasks.map(t => (t.id === taskId ? { ...t, status: next[t.status], updated_at: now() } : t)),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
  if (taskTitle) {
    const _t = i18n.get();
    addChangelogEntry(projectId, _t('changelog.statusChange').replace('{title}', taskTitle).replace('{status}', _t(`status.${newStatus}`)));
  }
  if (oldStatus && oldStatus !== newStatus) {
    runHook('onTaskStatusChange', { projectId, taskId, from: oldStatus, to: newStatus });
  }
  return true;
}

/**
 * 为任务添加依赖关系
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param dep - 依赖对象（目标任务 ID 和天数偏移）
 */
export function addDependency(projectId: string, taskId: string, dep: Dependency): void {
  pushHistory();
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    // 检查循环依赖：从 dep.taskId 出发，沿依赖链能否回到 taskId
    const visited = new Set<string>();
    const queue = [dep.taskId];
    let circular = false;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === taskId) { circular = true; break; }
      if (visited.has(cur)) continue;
      visited.add(cur);
      const t = p.tasks.find(x => x.id === cur);
      if (t) t.dependencies.forEach(d => queue.push(d.taskId));
    }
    if (circular) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => {
        if (t.id !== taskId) return t;
        if (t.dependencies.some(d => d.taskId === dep.taskId)) return t;
        return { ...t, dependencies: [...t.dependencies, dep], updated_at: now() };
      }),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 移除任务的指定依赖
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param depTaskId - 要移除的依赖目标任务 ID
 */
export function removeDependency(projectId: string, taskId: string, depTaskId: string): void {
  pushHistory();
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, dependencies: t.dependencies.filter(d => d.taskId !== depTaskId), updated_at: now() };
      }),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 更新任务的开始偏移天数（用于时间线视图）
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param offset - 偏移天数，null 表示未设置
 */
export function updateStartOffset(projectId: string, taskId: string, offset: number | null): void {
  pushHistory();
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => (t.id === taskId ? { ...t, start_offset: offset, updated_at: now() } : t)),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 为任务添加子任务
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param title - 子任务标题
 */
export function addSubtask(projectId: string, taskId: string, title: string): void {
  pushHistory();
  const sub: Subtask = { id: genId(), title, done: false };
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, subtasks: [...t.subtasks, sub], updated_at: now() };
      }),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 切换子任务完成状态
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param subtaskId - 子任务 ID
 */
export function toggleSubtask(projectId: string, taskId: string, subtaskId: string): void {
  pushHistory();
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: t.subtasks.map(s => (s.id === subtaskId ? { ...s, done: !s.done } : s)),
          updated_at: now()
        };
      }),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 删除子任务
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param subtaskId - 子任务 ID
 */
export function removeSubtask(projectId: string, taskId: string, subtaskId: string): void {
  pushHistory();
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId), updated_at: now() };
      }),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 添加评论
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param content - 评论内容
 */
export function addComment(projectId: string, taskId: string, content: string): void {
  pushHistory();
  const comment = { id: genId(), content, created_at: now() };
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => (t.id === taskId ? { ...t, comments: [...t.comments, comment], updated_at: now() } : t)),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 编辑评论
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param commentId - 评论 ID
 * @param content - 新内容
 */
export function updateComment(projectId: string, taskId: string, commentId: string, content: string): void {
  pushHistory();
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          comments: t.comments.map(c => (c.id === commentId ? { ...c, content } : c)),
          updated_at: now()
        };
      }),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 删除评论
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param commentId - 评论 ID
 */
export function deleteComment(projectId: string, taskId: string, commentId: string): void {
  pushHistory();
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, comments: t.comments.filter(c => c.id !== commentId), updated_at: now() };
      }),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 开始任务计时
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 */
export function startTracking(projectId: string, taskId: string): void {
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => (t.id === taskId && !t.tracked_start ? { ...t, tracked_start: now(), updated_at: now() } : t)),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 设置任务提醒时间
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 * @param reminderIso - 提醒时间的 ISO 字符串
 */
export function setReminder(projectId: string, taskId: string, reminderIso: string): void {
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => (t.id === taskId ? { ...t, reminder: reminderIso, updated_at: now() } : t)),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}

/**
 * 清除任务提醒
 *
 * @param projectId - 项目 ID
 * @param taskId - 任务 ID
 */
export function clearReminder(projectId: string, taskId: string): void {
  projects.update(list => list.map(p => {
    if (p.id !== projectId) return p;
    const updated = {
      ...p,
      tasks: p.tasks.map(t => (t.id === taskId ? { ...t, reminder: null, updated_at: now() } : t)),
      updated_at: now()
    };
    persistProject(updated);
    return updated;
  }));
}
