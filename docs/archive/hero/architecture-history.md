# Hero架构历史

仅追溯，不作为现行规则。

2026-10-19 首页使用 motion/campfire-hero.tsx，最新修订为单屏固定居中镜头；SmoothScroll在首页不创建ScrollSmoother，单屏场景不需要惯性滚动，其他页面保留惯性滚动并在路由变化时清理重建。Lab通过preview参数显示控制面板，渲染器共用。

2026-10-19 字体构建可靠性：既有英文字体随仓库分发并经src/config/fonts.ts的next/font/local加载，保留字体家族、变量与字重；许可证随资源保存。开发及构建不依赖Google字体网络请求。

2026-10-19 `/lab/hero-archive`归档原HomeHero星空灯球页面（noindex）；当前首页镜头由两个滑块显式控制，原色/1-bit复用同一渲染器与主题token。配色历史快照见hero-color-archive.md。
2026-10-21 三物件入口：scripts/hero-props-pack.py读取匹配OBJ/PNG与基础场景，生成独立scene-with-props.json及geometry-with-props二进制；基础导出和Blender源文件不变。渲染器返回投影包围盒，CampfireHero以原生链接提供点击/键盘导航；默认折叠调试面板，转场缩小后隐藏热区。


