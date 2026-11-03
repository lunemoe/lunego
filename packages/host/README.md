# @lunego/host

主线程 World 运行时、只读镜像、帧订阅、存档与回放、浏览器入口。

- `createGame({ seed })` 将种子传给 World；同初始状态与命令保持确定性。
- `subscribeFrames` 与 `onFrame` 的表现侧错误记录在 `game.viewError`，不会停止逻辑或其他帧订阅。逻辑错误仍停止 World 并生成 `crashReport`。
- `createViewLoop` 的 `frame.elapsed` 是模拟秒数；`view.elapsed` 是从该循环启动起的单调浏览器秒数，读档和重开不回退，适用于表现效果计时。`view.dt` 是本帧实际推进的模拟秒数，暂停时为 0。
- `saveGame()` 产出相同 tick 的 world/profile 两份快照。`createBrowserGameSaveStore(key)` 将二者作为一个存储值写入，避免分别写入失败后混用进度。加载校验 tick/schema/content/dt，并提供同一完整存档的备份恢复。World 的完整结构与内容校验在 `loadGame` 进行，失败不替换当前世界。
- 游戏菜单通过 `game.pause/resume` 停止模拟；菜单操作发命令后关闭，恢复时统一执行。打开菜单和读档时须释放设备状态，并在下一次输入轮询同步移动意图。
