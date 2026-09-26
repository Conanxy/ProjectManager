# 数据格式与存储约定

> 版本：v0.6.0 ｜ 相关代码：`src/lib/types/*`、`src/lib/utils/pm-schema.ts`、
> `src/lib/utils/recurrence.ts`、`src/lib/utils/local-file-target.ts`、
> `src/lib/utils/backup.ts`、`src/lib/repositories/*`

本文档回答四个问题：**数据存在哪、长什么样、怎么演进、坏数据怎么处理**。

---

## 1. 数据存在哪

| 位置 | 内容 | 键 / 路径 | 备注 |
|---|---|---|---|
| localStorage | 项目列表（含全部任务） | `pm_projects` | 主数据源，配额 ≈5MB |
| localStorage | 每个项目的 `.pm` 快照 | `pm_file_<projectId>` | **同步引擎上传的就是它** |
| localStorage | 设置 | `pm_locale` / `pm_theme` / `pm_animation` / … | 见 `utils/backup.ts` 的 `SETTINGS_KEYS` |
| localStorage | 同步配置 | `pm_sync_*` | 含 token / 密码（**不备份**） |
| localStorage | 同步状态 | `pm_sync_state` | rev / 上次同步时间 |
| localStorage | 删除前备份 | `pm_projects_backup` | 最近 20 条 |
| 本地文件（可选） | `<项目名>.pm` | 项目 `storage.path` 目录 | 原子写 + `.bak` |
| 服务器 | `index.json` + `projects/<id>.json` | `<同步数据目录>/` | 项目级快照 + rev + 墓碑 |

**不变量**：`pm_projects`（列表）与 `pm_file_<id>`（快照）必须是同一版本的数据。
两者不一致 → 同步会把**旧快照**推给服务器。所以 `savePmFile()` 的写入失败必须暴露
（见 `stores/storage-health.ts` 与顶栏告警条）。

---

## 2. `.pm` 文件格式

```jsonc
{
  "version": "1.0",              // 人类可读格式号（历史遗留，固定 '1.0'）
  "schema_version": 2,           // ★ 机器用的结构版本，见第 3 节
  "project": {
    "id": "uuid",
    "name": "项目名",
    "description": "",
    "template": "default",       // default | electron | hardware | web | todo
    "color": "#4f46e5",
    "created_at": "2026-09-15T00:00:00.000Z",
    "updated_at": "2026-09-15T00:00:00.000Z",
    "archived": false,
    "start_date": "2026-09-01",
    "end_date": "2026-12-31",
    "kanban_columns": ["待办", "进行中", "已完成"],
    "sync_enabled": true,
    "sort_order": 2000           // ★ 侧边栏顺序，随同步跨设备生效
    // ⚠️ 注意：`storage`（本地文件夹路径 + 归属设备）**不写入 .pm**，见第 6 节
  },
  "readme_file": "README.md",
  "template": { "dirs": [], "files": [], "file_contents": {} },
  "tasks": [
    {
      "id": "uuid", "title": "标题", "description": "",
      "status": "todo",          // todo | in_progress | done
      "priority": "medium",      // high | medium | low
      "tags": ["标签名"], "due_date": "2026-09-20", "due_time": "18:00",
      "start_offset": null, "dependencies": [{ "taskId": "uuid", "dayOffset": 0 }],
      "subtasks": [{ "id": "uuid", "title": "子任务", "done": false }],
      "comments": [{ "id": "uuid", "content": "…", "created_at": "…" }],
      "tracked_start": null, "reminder": null,
      "created_at": "…", "updated_at": "…",
      // 循环规则；null / 缺失 = 普通任务（刻意没有 isRecurring 冗余字段）
      "recurrence": {
        "freq": "weekly",            // daily | weekly | monthly | yearly
        "interval": 1,               // ≥1；每 2 周就是 2
        "byWeekday": [1, 3],         // 仅 weekly：0=周日…6=周六
        "end": "never",              // never | count | until
        "count": 3,                  // end=count：剩余次数（每完成一次减 1）
        "until": "2026-12-31",       // end=until：超过则不再生成
        "sourceTaskId": "uuid"       // 由完成触发生成的新实例上才有
      }
    }
  ],
  "tags":        [{ "id": "uuid", "name": "标签", "color": "#6b7280" }],
  "milestones":  [{ "id": "uuid", "title": "里程碑", "date": "2026-10-01", "color": "#f59e0b", "description": "" }],
  "changelog":   [{ "version": "0.1.3", "date": "2026-09-15", "info": "创建任务「X」", "auto": true }],
  "flowchart":   { "nodes": [], "edges": [] }
}
```

### 变更日志版本号规则（`A.B.C`）

| 段 | 名称 | 谁改 | 例 |
|---|---|---|---|
| A | 大版本 | 「大版本 +1」按钮 | `0.3.0 → 1.0.0`（B、C 归零） |
| B | 小版本 | 「小版本 +1」按钮 | `0.1.2 → 0.2.0`（C 归零） |
| C | 补丁位 | **软件自动**（增删改任务/里程碑） | `0.1.3 → 0.1.4` |

条目上 `auto: true` = 自动记录（UI 弱化 + 「自动」标签），
`auto: false` = 手动发版（高亮 + 「发布」标签），无该字段 = 历史数据（按普通显示）。

---

## 3. 结构版本与迁移

| schema_version | 说明 |
|---|---|
| 缺失 / `1` | 历史格式：可能缺 `sort_order`、`changelog[].auto`、任务的可空字段 |
| `2` | 补齐上述字段 |
| `3`（当前） | 任务新增 `recurrence`（缺失补 `null`；**已存在的值一律不动**）；写入时由 `projectToPm()` 打上 `CURRENT_PM_SCHEMA` |

**演进规则**（改字段时只做这一步）：

1. 在 `src/lib/utils/pm-schema.ts` 里把 `CURRENT_PM_SCHEMA` +1；
2. 在 `STEPS` 数组末尾追加一个 `vN_to_vN+1` 迁移函数；
3. 更新本文档的字段表；
4. 跑 `pnpm test:data`（含迁移用例）。

**迁移的硬性约束**：只补「缺失/为空」的字段，**绝不“纠正”类型**——
把 `tasks: {}` 默默改成 `[]` 等于把用户数据吞掉，应当交给校验器报错。

---

## 4. 导入 / 校验 / 备份

### 导入统一入口

```
文本 → parsePmText(text, source)
        ├─ 体积检查（≤32MB）
        ├─ JSON.parse
        ├─ migratePm()          ← 老格式在此升级
        ├─ validatePm()         ← 带字段路径的错误
        └─ PmFile
```

- 所有导入路径（本地文件 / 服务器拉取 / 冲突覆盖 / 备份恢复）都必须走它：
  `stores/project.ts` 的 `parseIncomingPm()` 是唯一封装。
- 失败：**不落地任何数据**，并弹 Toast（含 `tasks[3].title：缺失或为 null` 这类路径）。
- 校验上限：`MAX_PM_CHARS` 32MB、`MAX_TASKS` 20000、单字段 `MAX_TEXT` 200k。

### 备份包（全量）

```jsonc
{
  "kind": "projectmanager-backup",
  "schema_version": 2,
  "app_version": "0.5.4",
  "exported_at": "…",
  "projects": [ /* 每个项目一个 PmFile */ ],
  "settings": { "pm_locale": "zh" },              // 界面设置
  "sync": { "pm_sync_backend": "server", "pm_sync_server_url": "…" }
}
```

- ⚠️ **绝不包含凭据**（同步 token / WebDAV 密码 / Gist token）——备份文件泄露 ≠ 账号泄露。
- 恢复为**合并**：同 id 比 `updated_at`，新者胜；本地独有项目**永不删除**；
  坏条目跳过并计数（`skipped`）。
- 入口：设置 → 数据 → 导出全量备份 / 从备份恢复。

### 本地文件夹的「归属设备」（v0.6.0）

> 项目存储为「本地文件夹」时，`.pm` 的本地写入**只由「归属设备」执行**。
> 非归属设备：**不写**任何本地文件，只参与服务器上传/下载；归属设备在正常使用中自行完成本地写入。

- **归属判定**：`storage.ownerDeviceId`（本机设备 ID，见 `utils/device.ts`）；
  缺失时视为「当前设备」——历史项目第一次成功写入后补写归属。
- **补写时机**：只有**本机真实写成功过** `.pm` 才补写（谁的路真的通，谁才是归属），
  且只改 `storage.owner*`，**不动 `updated_at`**（本机配置不该触发同步）。
- **判定顺序**（`utils/local-file-target.ts` → `planLocalFileWriteWithOwner`）：
  `none`（没配）→ `unsupported`（移动端，平台写不了）→ `notOwner`（不是归属）
  → `foreignDesktopPath`（异平台盘符/UNC）→ `write`。
- `notOwner` **不是错误**：不报警、不进「外部文件夹」问题清单、不动红色告警条。
  否则又会重演 v0.5.5 那种「每次改任务弹一次」的打扰。

### 主存储 vs 外部副本（**失败语义不同，不要混**）

| 通道 | 写什么 | 失败后果 | 用户可见性 |
|---|---|---|---|
| **主存储** | localStorage 的 `pm_projects` / `pm_file_<id>` | **真丢数据**；同步会把旧快照推上服务器 | 顶栏**红色告警条** + Toast（`storageHealth`） |
| **外部副本** | 项目自选「本地文件夹」里的 `<项目名>.pm` | 只是少一份外部拷贝 | 「设置 → 数据管理 → 外部文件夹」清单（`externalSyncIssues`），同一项目一个会话只提示一次 |
| **非归属设备** | 什么都不写（预期行为） | 无 | 「设置 → 数据管理 → 本地文件夹归属」只读说明 |

外部副本的写入决策在 `utils/local-file-target.ts`（纯函数、可单测）：

| 场景 | 决策 |
|---|---|
| 项目没配外部文件夹 | `none`（不写） |
| **移动端**（Android/iOS） | `unsupported` —— Rust 的 `std::fs` 写不了 `content://`，且路径常来自桌面端（如 `D:\Senior\x.pm`），**直接跳过并记录，不报错** |
| 桌面端遇到 Windows 盘符 / UNC 路径 | `foreignDesktopPath` —— 不盲目尝试，按「本平台不可用」记录 |
| 桌面端正常路径 | `write` —— 走 `atomic_file` 原子写；失败记入清单（**不**升红） |

> 真机踩坑：早期把「外部副本失败」当成主存储失败弹红条，用户在手机上每改一次任务就被弹一次，
> 而数据其实完好。修复方式见 `CHANGELOG.md` v0.5.5。

### 循环任务（v0.6.0）

- 逻辑全在 `utils/recurrence.ts`（纯函数、可单测）：`nextOccurrence` / `isRuleExhausted` /
  `consumeRule` / `describeRule`。
- 语义：**完成时**才生成下一个实例（`stores/task.ts` 的 `completeRecurringTask()`）；
  `updateTask()` 绝不隐式生成。原任务置 `done` 且 `recurrence` 置 `null`。
- 触发点（两个显式入口）：列表勾选 / 详情面板（`toggleTaskStatus`）、
  **看板把卡片拖到「已完成」列**（`Kanban.onDropCard` 判断目标列是 `done` 且任务有规则时调用）。
- 边界：`monthly` 1/31 → 2/28（**归位不溢出**）、`yearly` 2/29 → 平年 2/28、
  `weekly` + 多选星期按「周」推进、`count` 逐次递减到 0、`until` 超界即止。
- 新实例：复制标题/描述/标签/优先级/依赖，**子任务重置为未完成并换新 id**，
  `due_date` = 按规则算出的下次日期，`recurrence.sourceTaskId` 指向原任务。

### 写入可靠性

| 机制 | 位置 |
|---|---|
| 写失败可见（返回 `false` + 顶栏红色告警条 + Toast） | `stores/storage-health.ts` |
| 接近配额（≥80%）预警 | 同上 |
| `.pm` 原子写：`tmp → fsync → .bak → rename` | `src-tauri/src/project_file.rs` |
| 读取时若主文件丢失自动回退 `.bak` | 同上 |
| 删除前自动备份（最近 20 条） | `sync/auto.ts` 的 `backupBeforeDelete` |

---

## 5. 测试

```bash
pnpm test:data        # 校验 / 迁移 / 备份往返 / 凭据不外泄 / 写失败可见
pnpm test             # 上面 + 版本号 + 拖拽排序换算
pnpm verify           # 发版前：类型检查 + i18n + ACL + 全部逻辑测试
```

> 想在 Node 里直接 import 应用模块（`$lib/...`、无扩展名相对导入）用：
> `node --experimental-strip-types --import ./scripts/ts-alias.mjs <脚本>`
