# @lunego/ui

Solid + `solid-js/html` 的 DOM UI 层：行为、可访问性和数据绑定归框架，美学归游戏。

## 契约

- **框架拥有**：组件行为、焦点/菜单栈、键盘与指针交互、数据绑定、主题 token 名称；焦点可见、`prefers-reduced-motion`、UI scale、最低对比度等 a11y 约束；资源注入点（`Panel.borderImage/borderSlice/borderWidth`、`ItemSlot.icon`、`SkillSlot.icon`）；`theme.ts` 中可被完全覆盖的中性 fallback。
- **游戏拥有**：调色板、字体、九宫格图片、图标集、间距/密度、动效、装饰、文案（本地化 key）。通过 `UiRoot({ theme })` 的 `UiTheme` 或组件 props 传入。
- **禁止**：组件内硬编码游戏资产路径、hex 色值或界面文案；像素风/最近邻只是能力，不是框架风格要求。
- **缺失资源**：九宫格/图标缺省时退回纯 CSS/文字；不造假数据。

## 主题 token

`UiTheme` 覆盖 `--lg-*` 变量，例如 `accent`、`font`、`radius`、`spacing`、`fontSize`、`barBackground`、`slotBackground`、`panelShadow`、`modalBackdrop`、`scale`。`Panel` 的九宫格由调用方传入：

```ts
Panel({
  borderImage: '/game/ui/panel.png',
  borderSlice: 8,
  borderWidth: 8,
  children: '...',
})
```

## 待办

- 组件默认 aria/empty 文案（`emptyLabel`/`closeLabel`/`label` 已可由游戏传入）仍需迁移到游戏的本地化 key。
- 图标/九宫格目前是调用方 URL；与资产 manifest 的 `AssetId` 注入将在资产管线批次统一。
