/**
 * 过滤与选择状态 stores
 *
 * 管理任务过滤（状态、优先级、标签、搜索）和当前选中的任务。
 *
 * @module stores/filter
 */

import { writable, derived } from 'svelte/store';
import type { TaskStatus } from '$lib/types';
import { projects, activeProjectId } from './project';
import { registerActiveTaskId } from './history';

/** 当前选中的项目对象（派生状态） */
export const activeProject = derived(
  [projects, activeProjectId],
  ([$projects, $activeProjectId]) => $projects.find(p => p.id === $activeProjectId) ?? null
);

/** 状态过滤器，'all' 表示显示全部 */
export const statusFilter = writable<TaskStatus | 'all'>('all');

/** 搜索关键词 */
export const searchQuery = writable('');

/** 优先级过滤器 */
export const priorityFilter = writable<'all' | 'high' | 'medium' | 'low'>('all');

/** 标签过滤器，'all' 表示显示全部 */
export const tagFilter = writable('all');

/** 经过多重过滤后的任务列表（派生状态） */
export const filteredTasks = derived(
  [activeProject, statusFilter, searchQuery, priorityFilter, tagFilter],
  ([$project, $status, $search, $priority, $tag]) => {
    if (!$project) return [];
    let tasks = $project.tasks;
    if ($status !== 'all') tasks = tasks.filter(t => t.status === $status);
    if ($priority !== 'all') tasks = tasks.filter(t => t.priority === $priority);
    if ($tag !== 'all') tasks = tasks.filter(t => t.tags.includes($tag));
    if ($search.trim()) {
      const q = $search.trim().toLowerCase();
      tasks = tasks.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return tasks;
  }
);

/** 当前选中的任务 ID（用于详情面板） */
export const activeTaskId = writable<string | null>(null);

// Register with history module for undo/redo support
registerActiveTaskId(activeTaskId);

/** 当前选中的任务对象（派生状态） */
export const activeTask = derived(
  [activeProject, activeTaskId],
  ([$project, $taskId]) => {
    if (!$project || !$taskId) return null;
    return $project.tasks.find(t => t.id === $taskId) ?? null;
  }
);
