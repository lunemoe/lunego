# @lunego/ui

Solid + `solid-js/html` 的 DOM UI 层：行为、可访问性和数据绑定归框架，美学归游戏。

## 契约

- **框架拥有**：组件行为、焦点/菜单栈、键盘与指针交互、数据绑定、主题 token 名称；焦点可见、`prefers-reduced-motion`、UI scale、最低对比度等 a11y 约束；资源注入点（`Panel.borderImage/borderSlice/borderWidth`、`ItemSlot.icon`、`SkillSlot.icon`）；`theme.ts` 中可被完全覆盖的中性 fallback。
- **游戏拥有**：调色板、字体、九宫格图片、图标集、间距/密度、动效、装饰、文案（本地化 key）。通过 `UiRoot({ theme })` 的 `UiTheme` 或组件 props 传入。
- **禁止**：组件内硬编码游戏资产路径、hex 色值或界面文案；像素风/最近邻只是能力，不是框架风格要求。
- **缺失资源**：九宫格/图标缺省时退回纯 CSS/文字；不造假数据。

## 主题 token

`UiTheme` 覆盖 `--lg-*` 变量，例如 `accent`、`font`、`radius`、`spacing`、`fontSize`、`barBackground`、`slotBackground`、`panelShadow`、`modalBackdrop`、`scale`。字体族只通过 `theme.font`/`--lg-font` 注入，组件不内置字体文件或字体图集。无障碍模式 token：

- `colorblindAccent/colorblindDanger/colorblindInfo/colorblindPrimary/colorblindSecondary/colorblindTertiary` → `--lg-colorblind-*`；`UiRoot({ colorblind: true | 'name' })` 写入 `data-colorblind`，CSS 在非 `"false"` 时重映射 accent/danger 与三种条颜色。
- `contrastBackground/contrastSurface/contrastText/contrastMuted/contrastBorder` → `--lg-contrast-*`；`UiRoot({ contrast: true | 'name' })` 写入 `data-contrast`，同时移除文字/面板阴影并加粗控件边框。
- `prefers-reduced-motion`/`reducedMotion` 与 `uiScale`/`--lg-ui-scale` 仍然生效。

`Panel` 的九宫格由调用方传入：

```ts
Panel({
  borderImage: '/game/ui/panel.png',
  borderSlice: 8,
  borderWidth: 8,
  children: '...',
})
```

## 本地化与文案

- 所有可显示/可朗读文案都接受 `TextValue = string | { key, params? }`：字符串是**显式覆盖**，不会走 resolver；`{ key }` 通过 resolver 解析，缺失时保留 key 本身，便于发现漏配。
- `UiRoot({ i18n })` 接受 resolver 函数或 `{ t, subscribe }` 源（`@lunego/i18n` 的 `createI18n()` 返回值即此形状）；locale 切换经 `subscribe` 触发重新解析。也可用 `setUiTextResolver`/`installUiI18n` 全局安装，返回的函数用于恢复。
- `message(key, params?)` 构造引用；`resolveText`/`textOf`/`resolveChild` 暴露给需要自定义渲染的调用方。
- 组件不内置中文/英文文案、译文或本地化表；`@lunego/i18n` 只提供消息表运行时、插值和注入式复数规则。

## 字体资源

字体族仍只通过 `UiTheme.font`/`--lg-font` 使用；字体文件加载是显式注入点，不在组件里硬编码路径：

```ts
import { createBrowserFontLoader } from '@lunego/ui'
import { Assets } from '../features/_generated/assets.js'

const fonts = createBrowserFontLoader({
  sourceFor: (file, id) => `/assets/${id}/${file}`,
})
const report = await fonts.loadAssets(Assets) // 只处理 type === 'font'
```

- `FontLoader` 接受可注入的 `FontSetLike`（`document.fonts` 适配器）与
  `FontFaceFactory`，测试/非浏览器环境不需要 `FontFace`。
- `loadAssets` 过滤 `type === 'font'`，按资产 id 加载；缺 file、重复 id 在加载前抛错，单个 `FontFace.load()` 失败进入 `report.failed`。
- `family` 缺省使用 asset id；`weight/style/display` 原样传给 `FontFace`。
- `createBrowserFontLoader` 使用 `document.fonts` 与 `FontFace`；缺失时明确抛错。

## 无障碍

- 所有新控件使用原生 button 或 roving focus，并有 `aria-label`/`aria-selected`/`aria-expanded`/`aria-describedby`/`role`；`TreeView`/`GraphView`/`Dialog`/`ShopRow`/`MinimapView`/`VirtualList`/`DragSource`/`DropTarget`/`SortableGrid` 接受调用方的 `describedBy` id。
- 键盘：拖拽 Space/Enter 拾取/放置、方向键选目标、Escape 取消；树与图用方向键/Home/End/Enter；Dialog/ChoiceList 方向键 + Enter/Space；VirtualList 支持 Arrow/PageUp/PageDown/Home/End 滚动；Shop/分页按钮额外处理 Enter/Space。
- `.lg-ui :focus-visible` 统一提供焦点环；`aria-live` 用于对话/分页/Toast；`aria-busy` 用于加载层。
- `UiRoot` 的 `data-colorblind`/`data-contrast` 是纯表现开关，不改变任何交互或玩法状态；游戏负责持久化这些设置。

## 菜单、反馈与无障碍

- `UiMenuStack`：push/pop/replace/current；仅栈顶接收 Escape，`FocusScope` 负责 Tab trap、初始焦点和关闭恢复；`Modal({ menuStack })` 可直接接入。
- `ToastQueue`/`ToastHost`：限时队列、`aria-live`、可关闭；`LoadingOverlay`：进度/错误/取消/`aria-busy`。文案由调用方或本地化 key 传入。
- `Tooltip`：portal 到 body、viewport 翻转、`aria-describedby`、键盘聚焦与 Escape；`placeTooltip` 可用于自定义定位。
- `UiRoot({ uiScale, reducedMotion })`：写入 `--lg-ui-scale`/`data-reduced-motion`；`EffectOverlay` 的 shake/flash 在 reduced motion 下跳过。
- `Panel` 九宫格由调用方传 `borderImage/borderSlice/borderWidth`；组件不引用游戏资产。

## 完整游戏控件

以下控件只做展示、交互与可访问性，不包含玩法规则、价格/库存计算、槽位合法性或对话条件；文案（`label`/`emptyLabel`/`buyLabel`/`nextLabel`…）、图标 URL、价格与颜色 token 全部由调用方传入。颜色/间距/字体统一使用 `--lg-*` 变量。

- **拖拽**：`DragSource`/`DropTarget`/`SortableGrid`，以及 `beginDrag`/`currentDrag`/`endDrag`/`sortableCellId`。放置回调只收到 `{ itemId, from, to }`；`from`/`to` 是调用方定义的来源/目标 id，`SortableGrid` 的 `to` 为 `sortableCellId(source, index)`。指针走原生拖拽事件；键盘 Space/Enter 拾取与放置、方向键遍历目标、Escape 取消。`DragSource.preview` 可选。
- **VirtualList**：固定 `rowHeight`/`height`/`overscan`，只挂载可视窗口（含 overscan）的行；`virtualRange()` 暴露纯窗口计算。行文案与 aria label 由 `renderRow`/`rowLabel` 提供。
- **EquipmentSlots**：调用方给出槽位定义（`id`/`label`/`itemId`/`icon`/`disabled`）、`onSelect`、`onDrop` 与 `emptyLabel`；方向键在槽位间移动焦点，Enter/Space 在拖拽中放置，否则选择。空槽可接收拖放。
- **TreeView**：`TreeItemData` 树数据、`selected`/`expanded`（受控或组件内状态）、`onSelect`/`onToggle`；`flattenTree()` 暴露可见节点展平。ArrowRight 展开/进子节点，ArrowLeft 折叠/回父节点，上下/Home/End 移动，Enter/Space 选择。
- **GraphView**：`GraphNodeData`/`GraphEdgeData`，选择与节点间方向键焦点移动；拖拽平移，滚轮/`+`/`-`/`0` 缩放；缩放按钮仅在其本地化 label 传入时渲染。不解释节点/边语义。
- **Dialog / ChoiceList / PagedText**：对话文本、说话人、立绘、选项及 `disabled` 条件由调用方提供；`onChoose` 每组选项只触发一次；方向键与 Enter/Space 可达。`PagedText` 的上一页/下一页 label 必须由调用方传入。
- **ShopRow**：名称、已格式化价格/数量、买卖按钮 label 与 `onBuy`/`onSell`；不计算价格、折扣或库存。未传对应回调时按钮禁用。
- **MinimapView**：传入地图尺寸、世界坐标标记（`icon`/`color`/`label`）、可选 `viewport` 与玩家位置/朝向；`projectMinimapPoint()` 执行保持宽高比的投影并在区域外夹取/标记 `visible=false`；默认最多挂载 64 个标记（`maxMarkers`）。标记颜色接受任意 CSS 颜色或调用方 token（如 `var(--lg-accent)`）。

## 待办

- 实际翻译内容、复数规则（按语言注入 `pluralRule`）与消息表由各游戏/内容包提供；本仓库只有契约与测试样例。
- 字体图集/位图字体仍由游戏资源管线提供；`FontLoader` 只负责浏览器 `FontFace` 字体文件，不解释图集格式。
- 图标/九宫格目前是调用方 URL；与资产 manifest 的 `AssetId` 注入将在资产管线批次统一。
- 新包 `@lunego/i18n` 的 workspace 依赖与 lockfile 由统一集成批次更新（当前 UI 通过结构性 resolver 接入，无运行时依赖）。
