# @lunego/input

**意图**：设备 → ActionMap → 游戏 Command；键盘/指针/手柄只在表现层，逻辑不感知设备。

## API

- `Input` / `createInput`：`ActionContext`、`PointerState`、键盘、可选 `GamepadSource`；`poll()` 只在 gameplay 上下文产生命令。
- `ActionContext`：gameplay/menu/dialogue/cutscene 栈；菜单打开时阻断游戏命令。
- `PointerState`：多 pointerId 跟踪、viewport 映射、按下/释放边沿。
- `GamepadSource` / `pollGamepads`：
  - 注入 `navigator.getGamepads` 或 fake provider
  - deadzone、轴反转、按钮 pressed/released/repeat、多手柄 `playerIndex`
  - `setGamepad/removeGamepad` 热插拔，`availablePlayers`
- `GamepadBindings`：button/axis 到 action；`applyGamepadActions` 合并到现有 ActionState。
- `attachBrowserGamepad`：框架监听 `gamepadconnected/gamepaddisconnected`，游戏不直接碰 window/navigator。
- `Input.device` + `onDeviceChange`：记录 keyboard/gamepad/pointer 最近设备；glyph 由 UI 根据设备读取，input 不产出 UI。
- `KeybindSettings`：`GamepadBindings` 可随 `KeybindSettingsData` 序列化；`gamepadConflicts` 检测 button/axis 冲突；`Input.applySettings` 同时应用键盘与手柄映射。
- `attachBrowserInput`：键盘/指针 + blur/visibilitychange `releaseAll()`。

## 不变量

- 手柄边沿由 `GamepadSource.poll()` 产生，按按钮索引/轴索引确定。
- 无 `Math.random`/`Date`/DOM 直接依赖；默认 browser adapter 是唯一平台入口。
- 无 UI 文案/glyph/资源路径；设备类型只以枚举记录。
