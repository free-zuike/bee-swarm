# D1 数据库迁移说明

## 问题
Cloudflare D1 SQLite 版本不支持 `IF NOT EXISTS` 子句在 ALTER TABLE 语句中。

## 解决方案

### 方法 1：使用 Wrangler 命令（推荐）

由于之前的迁移可能已经部分执行，需要先检查字段是否存在，然后添加缺失的字段。

#### 1. 先查询当前表结构
```bash
npx wrangler d1 execute bee-swarm-db --remote --command "PRAGMA table_info(scheduled_pushes);"
```

#### 2. 根据查询结果，添加缺失的字段
如果有字段缺失，执行以下命令（每个字段单独执行）：

```bash
# 添加 recurring_type 字段
npx wrangler d1 execute bee-swarm-db --remote --command "ALTER TABLE scheduled_pushes ADD COLUMN recurring_type TEXT;"

# 添加 selected_week_days 字段
npx wrangler d1 execute bee-swarm-db --remote --command "ALTER TABLE scheduled_pushes ADD COLUMN selected_week_days TEXT;"

# 添加 selected_month_days 字段
npx wrangler d1 execute bee-swarm-db --remote --command "ALTER TABLE scheduled_pushes ADD COLUMN selected_month_days TEXT;"

# 添加 selected_months 字段
npx wrangler d1 execute bee-swarm-db --remote --command "ALTER TABLE scheduled_pushes ADD COLUMN selected_months TEXT;"

# 添加 selected_year_days 字段
npx wrangler d1 execute bee-swarm-db --remote --command "ALTER TABLE scheduled_pushes ADD COLUMN selected_year_days TEXT;"

# 添加 interval_hours 字段
npx wrangler d1 execute bee-swarm-db --remote --command "ALTER TABLE scheduled_pushes ADD COLUMN interval_hours INTEGER;"

# 添加 interval_months 字段
npx wrangler d1 execute bee-swarm-db --remote --command "ALTER TABLE scheduled_pushes ADD COLUMN interval_months INTEGER;"

# 添加 interval_years 字段
npx wrangler d1 execute bee-swarm-db --remote --command "ALTER TABLE scheduled_pushes ADD COLUMN interval_years INTEGER;"
```

### 方法 2：使用 Cloudflare D1 控制台

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 Workers & Pages
3. 选择你的 D1 数据库
4. 点击 "Query" 标签
5. 逐个执行以下 SQL 语句：

```sql
ALTER TABLE scheduled_pushes ADD COLUMN recurring_type TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN selected_week_days TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN selected_month_days TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN selected_months TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN selected_year_days TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN interval_hours INTEGER;
ALTER TABLE scheduled_pushes ADD COLUMN interval_months INTEGER;
ALTER TABLE scheduled_pushes ADD COLUMN interval_years INTEGER;
```

如果某个字段已存在，会报错 "UNIQUE constraint failed: ..."，可以忽略该错误继续下一个。

### 方法 3：重新创建表（不推荐，仅作为最后手段）

如果表已损坏或无法迁移，可以：
1. 备份现有数据（导出）
2. 删除表
3. 重新创建表
4. 导入数据

## 验证迁移

迁移完成后，运行以下命令验证：

```bash
npx wrangler d1 execute bee-swarm-db --remote --command "PRAGMA table_info(scheduled_pushes);"
```

应该看到包含以下新字段：
- recurring_type
- selected_week_days
- selected_month_days
- selected_months
- selected_year_days
- interval_hours
- interval_months
- interval_years
