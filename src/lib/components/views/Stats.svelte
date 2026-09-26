<script lang="ts">
/**
 * Stats — 数据统计报表视图
 *
 * 以卡片式布局展示项目的多维度统计数据，包含 6 个统计卡片：
 * 1. 完成率 — 环形图 + 百分比
 * 2. 状态分布 — 堆叠条形图
 * 3. 优先级分布 — 三列网格
 * 4. 标签分布 — 水平条形图
 * 5. 每周完成趋势 — 柱状图（最近 4 周）
 * 6. 工时统计 — 总工时/平均工时/最长工时
 *
 * 所有图表使用纯 CSS 实现，无需外部图表库。
 *
 * @example
 * <Stats />
 */

  import { activeProject } from '$lib/stores';
  import { completionRate, statusDistribution, priorityDistribution, tagDistribution, weeklyCompletions, timeStats } from '$lib/utils/stats';
  import type { Priority } from '$lib/types';
  import { t } from '$lib/i18n';

  const pColor: Record<Priority, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981'
  };
  const statusColor = { todo: 'var(--text-muted)', in_progress: 'var(--accent)', done: 'var(--green)' };
</script>

<div class="stats-view">
  {#if $activeProject}
    {@const proj = $activeProject}
    {@const rate = completionRate(proj.tasks)}
    {@const statusDist = statusDistribution(proj.tasks)}
    {@const prioDist = priorityDistribution(proj.tasks)}
    {@const tagDist = tagDistribution(proj.tasks, proj.tags)}
    {@const weekly = weeklyCompletions(proj.tasks)}
    {@const ts = timeStats(proj.tasks)}
    {@const maxWeekly = Math.max(...weekly.map(w => w.count), 1)}

    <div class="stats-header">
      <span class="dot" style="background:{proj.color}"></span>
      <h2>{proj.name}</h2>
      <span class="meta">{$t('stats.viewTitle')}</span>
    </div>

    <div class="stats-body">
      <!-- 完成率 -->
      <section class="card">
        <h3 class="card-title">{$t('stats.completionRate')}</h3>
        <div class="rate-row">
          <div class="donut" style="background:conic-gradient(var(--green) {rate.percent}%, var(--surface) {rate.percent}%)">
            <span class="donut-inner">{rate.percent}%</span>
          </div>
          <div class="rate-info">
            <div class="rate-num"><span class="rate-big">{rate.done}</span><span class="rate-total">/ {rate.total}</span></div>
            <span class="rate-label">{$t('stats.taskCompleted')}</span>
          </div>
        </div>
      </section>

      <!-- 状态分布 -->
      <section class="card">
        <h3 class="card-title">{$t('stats.statusDist')}</h3>
        <div class="stack-bar">
          {#each [{count: statusDist.in_progress, l: $t('status.in_progress'), c: statusColor.in_progress}, {count: statusDist.done, l: $t('status.done'), c: statusColor.done}, {count: statusDist.todo, l: $t('status.todo'), c: statusColor.todo}] as s}
            {#if s.count > 0}
              <div class="stack-seg" style="width:{rate.total > 0 ? (s.count / rate.total) * 100 : 0}%;background:{s.c}" title="{s.l}: {s.count}"></div>
            {/if}
          {/each}
        </div>
        <div class="stack-legend">
          {#each [{count: statusDist.todo, l: $t('status.todo'), c: statusColor.todo}, {count: statusDist.in_progress, l: $t('status.in_progress'), c: statusColor.in_progress}, {count: statusDist.done, l: $t('status.done'), c: statusColor.done}] as s}
            <span class="legend-item"><span class="legend-dot" style="background:{s.c}"></span>{s.l} {s.count}</span>
          {/each}
        </div>
      </section>

      <!-- 优先级分布 -->
      <section class="card">
        <h3 class="card-title">{$t('stats.priorityDist')}</h3>
        <div class="prio-grid">
          {#each (['high', 'medium', 'low'] as Priority[]) as p}
            {@const count = prioDist[p]}
            {@const pct = rate.total > 0 ? Math.round((count / rate.total) * 100) : 0}
            <div class="prio-item" style="border-color:{pColor[p]}20;background:{pColor[p]}10">
              <span class="prio-count" style="color:{pColor[p]}">{count}</span>
              <span class="prio-label">{$t(`priority.${p}`)}</span>
              <span class="prio-pct">{pct}%</span>
            </div>
          {/each}
        </div>
      </section>

      <!-- 标签分布 -->
      <section class="card">
        <h3 class="card-title">{$t('stats.tagDist')}</h3>
        {#if tagDist.length > 0}
          {@const maxTag = Math.max(...tagDist.map(t => t.count), 1)}
          <div class="tag-chart">
            {#each tagDist as t}
              <div class="tag-row">
                <span class="tag-name">{t.name}</span>
                <div class="tag-bar-track">
                  <div class="tag-bar-fill" style="width:{(t.count / maxTag) * 100}%;background:{t.color}"></div>
                </div>
                <span class="tag-count">{t.count}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty-text">{$t('stats.noTagData')}</p>
        {/if}
      </section>

      <!-- 每周完成趋势 -->
      <section class="card">
        <h3 class="card-title">{$t('stats.weeklyTrend')}</h3>
        <div class="week-chart">
          {#each weekly as w}
            <div class="week-col">
              <div class="week-bar-wrap">
                <div class="week-bar" style="height:{(w.count / maxWeekly) * 100}%"></div>
              </div>
              <span class="week-label">{w.label}</span>
              <span class="week-count">{w.count}</span>
            </div>
          {/each}
        </div>
      </section>

      <!-- 工时统计 -->
      <section class="card">
        <h3 class="card-title">{$t('stats.timeStats')}</h3>
        <div class="time-grid">
          <div class="time-item">
            <span class="time-val">{ts.formatted.total}</span>
            <span class="time-lbl">{$t('stats.totalTime')}</span>
          </div>
          <div class="time-item">
            <span class="time-val">{ts.formatted.avg}</span>
            <span class="time-lbl">{$t('stats.avgTime')}</span>
          </div>
        </div>
        {#if ts.longestTask}
          <div class="time-longest">
            <span class="time-lbl">{$t('stats.maxTime')}</span>
            <span class="time-longest-val">{ts.longestTask.title} — {ts.formatted.longest}</span>
          </div>
        {/if}
      </section>
    </div>
  {:else}
    <div class="empty">{$t('stats.selectProject')}</div>
  {/if}
</div>

<style>
  .stats-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .stats-header { display: flex; align-items: center; gap: 10px; padding: 16px 24px; border-bottom: 1px solid var(--border); }
  .stats-header .dot { width: 12px; height: 12px; border-radius: 50%; }
  .stats-header h2 { font-size: 16px; font-weight: 600; }
  .stats-header .meta { font-size: 12px; color: var(--text-muted); }
  .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; }

  .stats-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-content: start; }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
  .card-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; }

  /* 完成率 */
  .rate-row { display: flex; align-items: center; gap: 20px; }
  .donut { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .donut-inner { width: 56px; height: 56px; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: var(--text); }
  .rate-info { display: flex; flex-direction: column; gap: 2px; }
  .rate-num { display: flex; align-items: baseline; gap: 4px; }
  .rate-big { font-size: 28px; font-weight: 700; color: var(--green); }
  .rate-total { font-size: 14px; color: var(--text-muted); }
  .rate-label { font-size: 12px; color: var(--text-muted); }

  /* 状态分布 */
  .stack-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--bg); margin-bottom: 10px; }
  .stack-seg { transition: width 0.3s; }
  .stack-legend { display: flex; gap: 12px; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-secondary); }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  /* 优先级分布 */
  .prio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .prio-item { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 8px; border-radius: 8px; border: 1px solid; }
  .prio-count { font-size: 22px; font-weight: 700; }
  .prio-label { font-size: 11px; color: var(--text-muted); }
  .prio-pct { font-size: 11px; color: var(--text-muted); }

  /* 标签分布 */
  .tag-chart { display: flex; flex-direction: column; gap: 6px; }
  .tag-row { display: flex; align-items: center; gap: 8px; }
  .tag-name { font-size: 12px; color: var(--text); min-width: 60px; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
  .tag-bar-track { flex: 1; height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
  .tag-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .tag-count { font-size: 11px; color: var(--text-muted); min-width: 20px; text-align: right; flex-shrink: 0; }
  .empty-text { font-size: 12px; color: var(--text-muted); }

  /* 每周趋势 */
  .week-chart { display: flex; gap: 12px; align-items: flex-end; height: 120px; }
  .week-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
  .week-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
  .week-bar { width: 60%; max-width: 32px; background: var(--accent); border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; }
  .week-label { font-size: 10px; color: var(--text-muted); }
  .week-count { font-size: 10px; color: var(--text-secondary); font-weight: 600; }

  /* 工时统计 */
  .time-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
  .time-item { display: flex; flex-direction: column; gap: 2px; }
  .time-val { font-size: 18px; font-weight: 700; color: var(--text); }
  .time-lbl { font-size: 11px; color: var(--text-muted); }
  .time-longest { padding-top: 8px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; }
  .time-longest-val { font-size: 13px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  @media (max-width: 768px) {
    .stats-view { padding: 12px; }
  }
</style>
