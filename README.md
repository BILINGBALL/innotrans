# InnoTrans 客户信息采集系统

展会现场客户信息采集工具：工作人员在展台填写客户姓名、电话 / WhatsApp、邮箱、公司，并可**调用摄像头或从图库选择照片**，数据实时写入 PostgreSQL 数据库，照片上传至阿里云 OSS 并与客户绑定。后台「历史记录」可查看、搜索、删除客户、**补传 / 更换照片**并**导出 CSV**。

## 技术栈

- **后端**：Node.js + Express + PostgreSQL (`pg`) + 阿里云 OSS (`ali-oss`) + JWT 鉴权
- **前端**：React 18 + Vite + React Router

## 目录结构

```
innotrans-client/
├── .env              # 所有密钥配置（数据库 / OSS / 密码）
├── server/           # Express 后端
│   ├── index.js      # 入口
│   ├── db.js         # PostgreSQL 连接 + 建表
│   ├── oss.js        # 阿里云 OSS 上传
│   ├── auth.js       # JWT 鉴权
│   └── routes/       # leads.js / admin.js
└── client/           # React 前端
    └── src/
        ├── pages/    # CapturePage（采集）/ AdminPage（后台）
        └── components/  # Camera / PasswordGate
```

## 快速开始

1. **安装依赖**（会自动装根目录、server、client 三处）：

   ```bash
   npm run setup
   ```

2. **配置**：确认根目录 `.env` 已填写数据库、OSS 和密码（已预填）。

3. **开发模式启动**（同时启动后端 4000 + 前端 5173）：

   ```bash
   npm run dev
   ```

   - 采集页：http://localhost:5173
   - 后台：http://localhost:5173/admin

4. **生产部署**（后端托管前端构建产物，单端口运行）：

   ```bash
   npm run build
   npm start
   ```

   - 访问 http://localhost:4000

## 密码

| 入口 | 默认密码 | 配置位置 |
| --- | --- | --- |
| 前台采集页 | `innotrans` | `client/.env` → `VITE_ACCESS_PASSWORD` |
| 管理后台 | `innotrans-admin` | 根目录 `.env` → `ADMIN_PASSWORD` |

> ⚠️ 前台密码是前端校验，仅用于挡误操作，并非真正的安全措施。真正受保护的数据接口（后台查看 / 导出）由后端 JWT 鉴权。

## 数据库表

`leads` 表会在后端启动时自动创建（`CREATE TABLE IF NOT EXISTS`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | SERIAL | 主键 |
| name | TEXT | 姓名（必填） |
| phone | TEXT | 电话 |
| whatsapp | TEXT | WhatsApp |
| email | TEXT | 邮箱 |
| company | TEXT | 公司 |
| photo_url | TEXT | OSS 照片链接（与客户绑定） |
| created_at | TIMESTAMPTZ | 创建时间 |

## 重要说明

1. **摄像头需要安全上下文**：浏览器调用摄像头要求 HTTPS 或 `localhost`。
   - 在展台笔记本上用 `localhost` 直接访问没问题。
   - 若要用手机 / 平板通过局域网 IP 访问，HTTP 下摄像头会被浏览器禁用，需配置 HTTPS（可用反向代理 + 证书）。

2. **OSS 权限（私有 bucket）**：后台照片通过服务端生成的**临时签名 URL** 访问，bucket 无需改权限、保持私有即可。签名链接列表默认 24 小时、导出 CSV 里的链接 7 天内有效（过期后重新刷新页面/导出即可）。

3. **安全建议**：`.env` 中的 OSS AccessKey、数据库密码等敏感信息已被 `.gitignore` 排除，请勿提交到代码仓库。如这些密钥已在聊天或仓库中暴露，建议在阿里云控制台轮换 AccessKey。

4. **CSV 导出**：后台点击「导出 CSV」会下载带 UTF-8 BOM 的文件，可直接用 Excel 打开，中文不乱码。

## 常用命令

```bash
npm run dev       # 开发模式（前后端同时启动）
npm run build     # 构建前端
npm start         # 生产模式（单端口）
```
