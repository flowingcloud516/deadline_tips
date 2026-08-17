# Deadline Tips

一个面向 Windows 10/11 的轻量桌面截止日期提醒工具。

## 当前状态

当前版本为 `0.2.0`，包含：

- Tauri 2 + React + TypeScript + Vite 工程骨架
- 任务领域模型和周期日期算法
- JSON 本地存储、导入导出和数据路径迁移
- 近期、周期和重要任务三区悬浮窗
- 系统托盘、任务管理窗口和整点日期刷新
- 悬浮窗一键隐藏，以及可调整时间的每日自动显示与错过补显示
- Windows 11 release 构建、安装和 UI 验收

当前版本已达到可安装、可运行和可分发状态，低优先级增强功能暂缓开发。

详细需求见 [`docs/requirements-v1.0.md`](docs/requirements-v1.0.md)，开发阶段见 [`docs/development-plan.md`](docs/development-plan.md)。

## 本地开发

环境要求：Node.js、npm、Rust stable、Cargo、Microsoft C++ Build Tools 和 Windows 10 SDK。

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run dev
```

启动 Tauri 原生应用：

```powershell
npm.cmd run tauri dev
```

当前开发机已验证 Node.js 24、npm 11、Rust 1.97、Cargo 1.97、Visual Studio C++ Build Tools、Windows 10 SDK 和 WebView2。前端测试、生产构建及 Tauri Rust 编译检查均已通过。

## 项目结构

- `src/domain/`：任务模型和日期规则
- `src/storage/`：存储接口与适配器
- `src/ui/`：React 界面与设计变量
- `src-tauri/`：Windows 桌面运行时配置和 Rust 入口
- `docs/`：需求、设计与开发计划
- `docs/windows-compatibility.md`：Windows 兼容性验证记录
- `tests/`：后续跨模块测试
