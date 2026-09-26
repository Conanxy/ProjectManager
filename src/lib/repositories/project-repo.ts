/**
 * 项目数据持久化仓库
 *
 * 项目列表存储在 localStorage。
 * 每个项目的详细数据通过 {@link savePmFile} 按项目的 storage 配置
 * 写入对应的本地文件夹或服务器。
 *
 * @module repositories/project-repo
 */

import type { Project } from '$lib/types';
import { migrateProjects, sortProjects } from '$lib/utils/project-order';
import { safeSetItem } from '$lib/stores/storage-health';

const STORAGE_KEY = 'pm_projects';

/**
 * 从 localStorage 加载项目列表
 *
 * 返回时已按 `sort_order` 排序，并给缺排序值的历史数据补上默认值
 * （侧边栏顺序因此与存储顺序解耦，便于跨设备同步）。
 */
export function loadProjects(): Project[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const list: Project[] = data ? JSON.parse(data) : [];
    return sortProjects(migrateProjects(list.map(p => ({
      ...p,
      milestones: p.milestones ?? [],
      tasks: p.tasks.map(t => ({
        ...t,
        due_time: t.due_time ?? null,
        subtasks: t.subtasks ?? [],
        comments: t.comments ?? [],
        tracked_start: t.tracked_start ?? null,
        reminder: t.reminder ?? null
      }))
    }))));
  } catch { return []; }
}

/**
 * 将项目列表保存到 localStorage
 *
 * 写失败（配额满 / 隐私模式禁写）**不再静默吞掉**：上报给 storage-health，
 * 由顶栏告警条 + Toast 告知用户，避免无声丢数据。
 *
 * @returns 是否写入成功
 */
export function saveProjects(list: Project[]): boolean {
  return safeSetItem(STORAGE_KEY, JSON.stringify(list), '项目列表');
}
