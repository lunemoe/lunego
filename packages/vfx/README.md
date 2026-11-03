# @lunego/vfx

由 Cue/显式请求驱动的俯视角像素特效；逻辑层不依赖本包。效果请求使用世界坐标，输出通过 renderer 的 viewport/camera/zoom 对齐。

- `play` 创建特效；`update(dt)` 推进秒数；`compose/composeAll` 供输出表面消费。
- `clear()` 停止并回收当前效果，清除 Cue tick 去重与合成缓存，但保留系统可用。读档、重开和减少动态效果时使用。
- `destroy()` 释放效果和缓存，并终止系统；之后不能继续 play。
