<script lang="ts">
/**
 * Dashboard — 全局主界面仪表盘
 *
 * 作为应用默认启动视图，展示所有项目的概览信息：
 * - 项目卡片列表（名称、进度、任务统计、截止日期）
 * - 未来 7 天到期的任务（按优先级排序）
 * - 快速操作按钮（新建项目）
 * - 各项目状态分布简易统计
 *
 * 使用 Svelte 5 runes 语法（$state / $derived / $effect）。
 *
 * @example
 * <Dashboard />
 */

  import { get } from 'svelte/store';
  import { projects, activeProjectId, pendingAction, createProject } from '$lib/stores';
  import { showSettings } from '$lib/stores';
  import type { Project, Task, Priority } from '$lib/types';
  import { t } from '$lib/i18n';

  // —— 派生数据 ——

  /** 所有未归档的项目列表 */
  const activeProjects = $derived(
    ($projects as Project[]).filter(p => !p.archived)
  );

  /** 所有项目的总任务统计 */
  const totalStats = $derived({
    total: activeProjects.reduce((s, p) => s + p.tasks.length, 0),
    done: activeProjects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'done').length, 0),
    inProgress: activeProjects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'in_progress').length, 0),
  });

  /** 未来 7 天到期的任务（跨所有项目），按优先级排序 */
  const upcomingTasks = $derived.by(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    const endStr = end.toISOString().slice(0, 10);

    const tasks: { task: Task; project: Project }[] = [];
    for (const p of activeProjects) {
      for (const t of p.tasks) {
        if (t.due_date && t.due_date >= today && t.due_date <= endStr && t.status !== 'done') {
          tasks.push({ task: t, project: p });
        }
      }
    }

    // 按优先级排序：high > medium > low
    const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    tasks.sort((a, b) => {
      const pa = priorityOrder[a.task.priority] ?? 1;
      const pb = priorityOrder[b.task.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return (a.task.due_date ?? '').localeCompare(b.task.due_date ?? '');
    });

    return tasks;
  });

  /** 各项目的完成率 */
  const projectStats = $derived(
    activeProjects.map(p => {
      const total = p.tasks.length;
      const done = p.tasks.filter(t => t.status === 'done').length;
      const inProgress = p.tasks.filter(t => t.status === 'in_progress').length;
      return {
        project: p,
        total,
        done,
        inProgress,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    })
  );

  /** 今天日期字符串 */
  function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** 格式化到期日（相对） */
  function fmtDue(due: string): string {
    const today = todayStr();
    if (due === today) return '今天';
    const dt = new Date(due);
    const diff = Math.round((dt.getTime() - Date.now()) / 86400000);
    if (diff === 1) return '明天';
    if (diff === 2) return '后天';
    return due;
  }

  /** 触发新建项目（通过命令面板的待执行动作机制） */
  function triggerNewProject() {
    pendingAction.set('new-project');
  }

  /** 跳转到某个项目 */
  function selectProject(id: string) {
    activeProjectId.set(id);
  }

  /** 优先级颜色 */
  const priorityColors: Record<Priority, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981',
  };

  const priorityLabels: Record<Priority, string> = {
    high: '高',
    medium: '中',
    low: '低',
  };

  /** 状态颜色 */
  const statusLabels: Record<string, string> = {
    todo: '待办',
    in_progress: '进行中',
    done: '已完成',
  };
</script>

<div class="dashboard">
  <!-- 欢迎横幅 -->
  <div class="welcome-banner">
    <div class="welcome-text">
      <h1 class="welcome-title">ProjectManager</h1>
      <p class="welcome-sub">
        {activeProjects.length} 个项目 · {totalStats.total} 个任务 · {totalStats.done} 已完成
      </p>
    </div>
    <div class="quick-actions">
      <button class="action-btn primary" onclick={triggerNewProject}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        新建项目
      </button>
    </div>
  </div>

  <div class="dashboard-grid">
    <!-- 左侧：项目卡片列表 -->
    <div class="dashboard-col projects-col">
      <h2 class="col-title">所有项目</h2>
      {#if projectStats.length === 0}
        <div class="empty-state">
          <p>暂无项目</p>
          <button class="action-btn primary" onclick={triggerNewProject}>创建第一个项目</button>
        </div>
      {:else}
        <div class="project-cards">
          {#each projectStats as stat}
            {@const p = stat.project}
            <button class="project-card" onclick={() => selectProject(p.id)}>
              <div class="card-top">
                <span class="card-color-dot" style="background:{p.color}"></span>
                <span class="card-name">{p.name}</span>
                <span class="card-template-badge">{p.template}</span>
              </div>
              {#if p.description}
                <p class="card-desc">{p.description}</p>
              {/if}
              <div class="card-stats-row">
                <span class="card-stat">
                  <span class="stat-num">{stat.total}</span> 任务
                </span>
                <span class="card-stat">
                  <span class="stat-num done">{stat.done}</span> 完成
                </span>
                {#if p.end_date}
                  <span class="card-stat due">截止 {p.end_date}</span>
                {/if}
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width:{stat.percent}%;background:{p.color}"></div>
              </div>
              <div class="card-percent">{stat.percent}%</div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- 右侧：即将到期任务 -->
    <div class="dashboard-col tasks-col">
      <h2 class="col-title">未来 7 天到期</h2>
      {#if upcomingTasks.length === 0}
        <div class="empty-state">
          <p>🎉 未来 7 天没有到期的任务</p>
        </div>
      {:else}
        <div class="upcoming-list">
          {#each upcomingTasks as { task, project }}
            <div class="upcoming-item" style="border-left-color:{project.color}">
              <div class="upcoming-left">
                <span class="priority-dot" style="background:{priorityColors[task.priority]}"></span>
                <div class="upcoming-info">
                  <span class="upcoming-title">{task.title}</span>
                  <span class="upcoming-project">{project.name}</span>
                </div>
              </div>
              <div class="upcoming-right">
                <span class="upcoming-due" class:urgent={task.due_date === todayStr()}>
                  {fmtDue(task.due_date!)}
                </span>
                <span class="upcoming-priority">{priorityLabels[task.priority]}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- 简易统计卡片 -->
      {#if activeProjects.length > 0}
        <div class="mini-stats">
          <div class="mini-stat-card">
            <span class="mini-stat-label">总任务</span>
            <span class="mini-stat-value">{totalStats.total}</span>
          </div>
          <div class="mini-stat-card">
            <span class="mini-stat-label">进行中</span>
            <span class="mini-stat-value" style="color:var(--accent)">{totalStats.inProgress}</span>
          </div>
          <div class="mini-stat-card">
            <span class="mini-stat-label">已完成</span>
            <span class="mini-stat-value" style="color:var(--green)">{totalStats.done}</span>
          </div>
          <!-- 简易环形进度 -->
          <div class="mini-stat-card chart-card">
            <svg width="36" height="36" viewBox="0 0 36 36" class="mini-ring">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" stroke-width="3"/>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--green)" stroke-width="3"
                stroke-dasharray={2 * Math.PI * 15.9}
                stroke-dashoffset={totalStats.total > 0 ? (2 * Math.PI * 15.9) * (1 - totalStats.done / totalStats.total) : 2 * Math.PI * 15.9}
                stroke-linecap="round"
                transform="rotate(-90 18 18)"/>
            </svg>
            <span class="mini-stat-pct">{totalStats.total > 0 ? Math.round(totalStats.done / totalStats.total * 100) : 0}%</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .dashboard {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 24px;
    overflow-y: auto;
    /* 允许 flex 子项收缩到界面宽度，防止内部内容把容器撑破 */
    min-width: 0;
    width: 100%;
    max-width: 100%;
  }

  /* 欢迎横幅 */
  .welcome-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  .welcome-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    margin: 0;
  }
  .welcome-sub {
    font-size: 12px;
    color: var(--text-muted);
    margin: 4px 0 0 0;
  }

  /* 快速操作 */
  .quick-actions {
    display: flex;
    gap: 8px;
  }
  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    font-size: 13px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    transition: all 0.12s;
  }
  .action-btn:hover { border-color: var(--accent); color: var(--accent); }
  .action-btn.primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .action-btn.primary:hover { opacity: 0.9; }

  /* 主网格：宽度自适应界面。
     双列（左列弹性 + 右列任务列表）仅在容器足够宽时生效；
     容器窄于 ~700px 时自动堆叠为单列，避免固定 360px 右列挤压左列卡片。 */
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
    gap: 16px;
    flex: 1;
    min-height: 0;
    align-content: start;
  }
  .dashboard-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    /* grid 轨道防内容撑破 */
    min-width: 0;
  }
  .col-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
    padding: 4px 0;
  }

  /* 空状态 */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: var(--text-muted);
    font-size: 14px;
  }

  /* 项目卡片：auto-fill 自动按容器宽度排布列数，避免卡片被拉得过宽 */
  .project-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
    gap: 10px;
    overflow-y: auto;
    align-content: start;
  }
  .project-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: box-shadow 0.12s, border-color 0.12s;
    min-width: 0;
    overflow: hidden;
  }
  .project-card:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card-color-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .card-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow-wrap: anywhere;
  }
  .card-template-badge {
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .card-desc {
    font-size: 11px;
    color: var(--text-muted);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow-wrap: anywhere;
  }
  .card-stats-row {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-muted);
  }
  .card-stat .stat-num { font-weight: 600; color: var(--text); }
  .card-stat .stat-num.done { color: var(--green); }
  .card-stat.due { margin-left: auto; }

  .progress-bar-bg {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s;
  }
  .card-percent {
    font-size: 11px;
    color: var(--text-muted);
    text-align: right;
  }

  /* 即将到期列表 */
  .upcoming-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    flex: 1;
  }
  .upcoming-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    gap: 8px;
    min-width: 0;
  }
  .upcoming-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }
  .priority-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .upcoming-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .upcoming-title {
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow-wrap: anywhere;
  }
  .upcoming-project {
    font-size: 11px;
    color: var(--text-muted);
  }
  .upcoming-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
    gap: 2px;
  }
  .upcoming-due {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
  }
  .upcoming-due.urgent {
    color: var(--red, #ef4444);
    font-weight: 600;
  }
  .upcoming-priority {
    font-size: 10px;
    color: var(--text-muted);
  }

  /* 简易统计卡片 */
  .mini-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-top: 4px;
  }
  .mini-stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .mini-stat-label {
    font-size: 10px;
    color: var(--text-muted);
  }
  .mini-stat-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }
  .chart-card {
    position: relative;
  }
  .mini-ring {
    display: block;
  }
  .mini-stat-pct {
    font-size: 10px;
    font-weight: 600;
    color: var(--green);
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .dashboard { padding: 12px; }
    .dashboard-grid { grid-template-columns: 1fr; }
    .project-cards { grid-template-columns: 1fr; }
    .mini-stats { grid-template-columns: repeat(2, 1fr); }
  }
</style>
