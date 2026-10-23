# 哈利篝火可旋转版本

## 2026-10-15 灯球网页同步（性能优先）

网页现已使用 `harry-campfire-orb-finished.blend` 的近似精修：上部近景镜片单段倒角/薄背板，远处和下部保持原网格；粗糙度0.10–0.17预计算到顶点alpha，不在浏览器执行程序噪声。该插值近似不是Blender噪声节点的逐像素复现。镜片共21,096顶点/9,880三角面；首版全球倒角94,912顶点/43,648三角面、总资源5.01MB，因体积增长放弃，最终总资源3.574MB加manifest（旧版3.225MB）。

倒影目标从1024²减至512²，原色按24fps源动画帧更新，镜头/尺寸变化立即刷新；双色不绘制局部倒影。单次倒影目标像素数降至原来的1/4，不等于整体帧耗时降低75%。保持自由旋转，暂不改为固定视角预渲染视频；离线处理几何和粗糙度已避免对应实时计算。

重新生成顺序：先执行下文原场景导出与打包，然后加载精修源文件运行 `harry-orb-web-export.py`，最后再次打包。该补丁导出仅替换灯球网格与材质，保持其他人物及288帧动画数据；不会保存或修改打开的Blender文件。命令：

```powershell
& 'D:/Blender/blender.exe' -b blender/harry-campfire-orb-finished.blend --python-exit-code 1 --python blender/harry-orb-web-export.py
node scripts/harry-campfire-orbit-pack.mjs
```

验收：资产索引/粗糙度/网格预算及火星轨迹通过，lint通过（7条既有警告），TypeScript通过。build仍因Google字体下载连接失败而未通过。浏览器原色/双色、实际拖动、复位、暂停下切模式已查，无渲染错误。当前侧栏约619px宽，120次开发态绘制调用间隔采样：原色均值6.06ms/P95 6.70ms，双色6.21ms/P95 6.20ms。这是本机调用间隔，不是GPU耗时或低端手机保证；未据此宣称跨设备性能。开发态canvas的 `data-frame-timing` 每120次刷新，生产不采样。预览为 `harry-orb-web-finished.png`。

## 2026-10-15 精修交付（覆盖下文旧手部和光照参数）

源文件仍为 `harry-campfire-orb-dark.blend`；本轮原始备份在 `../.file/harry-refine/original.blend`。脸部使用独立的受光与贴图明度映射，保留眼窝、鼻侧和胡须，避免皮肤全部越过双色亮部阈值。手腕朝向由掌部骨骼位置确定，取消拉伸指根的位移，按末节原始轴向修正弯指；左手顺腿面搭放，右手围绕木杆弯曲。

类似 AE 的后期入口是 Blender 自带 Compositor：本文件在 Blender 5.2 的合成节点组 `Campfire finishing - linear before AgX` 中保存 Render Layers → Color Balance → 低强度 Fog Glow → 输出，配合 AgX 显示变换。主光来自篝火方向，弱天光与轮廓光辅助形体；已准备 Fire/Sky/Rim 光组、Cryptomatte 与 Mist 通道，供后续局部调色和分层处理，目前并未将所有通道接入最终合成。可参考 [Blender 合成器手册](https://docs.blender.org/manual/en/4.4/compositing/index.html)。

网页独立实现量化前的轻微空气透视、烟顶渐隐与脸部层次，不会自动执行 Blender 的合成节点，也没有加入全屏模糊或大型依赖。完整材质和离线渲染仍以源文件为准。

交付预览：`harry-campfire-refined-render.png`（1100×1000 原色静帧）、`harry-campfire-refined-web.png`（桌面双色）、`harry-campfire-refined-mobile.png`（390px 页面）、`harry-hands-front.png` / `harry-hands-reverse.png`（手部双侧近景）。

接触回归：`harry-campfire-verify.py` 对 evaluated 网格中指定蒙皮表面检查，旧备份左手/裤腿98对、右手/杆62对相交，最终均为0；最近顶点间距为0.00465与0.00979场景单位。该检查不是全身自碰撞或完全包围证明，姿态自然程度仍以近景为准。运行时给 Blender 添加 `--python-exit-code 1 --python blender/harry-campfire-verify.py`，`-- --preview` 可生成近景。

最终资产33网格、19材质、288帧，约3.225MB加manifest；打包、lint（7条既有警告）、build及类型检查通过。已实际查看桌面双色/原色、旋转/复位和390px页面，未发现横向溢出或浏览器错误。暂停按钮已操作，但两次暂停截图仍有局部像素差异，尚未确认来源；reduced-motion仅复核既有代码，未强制系统偏好实测。此两项保留在TASKS验证余项中。

查看 `/lab/harry-campfire`。拖动环绕 360°，滚轮或加减键缩放，方向键旋转，Home 或「重置视角」恢复默认。触摸拖动也可旋转。暂停及 reduced-motion 停止自动播放，仍允许主动调整镜头。

当前可编辑文件：`harry-campfire-orb-dark.blend`。哈利放大 8%、向篝火靠近 0.22 个场景单位，弯膝坐在巨大镜面灯球顶部。球体半径从 8 增至约 14，人物和火堆重新贴合较平的顶部。泥地、草、散石及座木已移除，烤棍连接右手。前一版 `harry-campfire-orb.blend`、`harry-campfire-orbit.blend` 与所有输入保留。

生成步骤（仓库根目录）：

```powershell
& 'D:/Blender/blender.exe' -b --python blender/harry-campfire-orbit.py -- 'D:/百度网盘/discoExample/Exports/OuterWilds_Campfire/Outer_Wilds_Campfire_Animated.blend' --orb 'C:/Users/12281/Documents/carrykit-blender/orb-master.blend'
node scripts/harry-campfire-orbit-pack.mjs
```

仅重新导出网页资源时可在最后加 `--no-preview`。脚本默认读取既有人物场景 `harry-campfire.blend`，另存新版本；不会覆写原文件。

网页资源在 `public/harry-campfire/orbit/`：索引网格、原始内嵌贴图、静态坐姿人物、288 帧/24 fps 的三层火焰形变权重、烟雾/火星变换与灯光能量，另含原灯球的镜片/填缝球体及反射环境。打包验证网格索引、动画覆盖、灯球材质和旧地面移除，再压缩几何与贴图。传输约 3.22 MB 加 manifest，未新增依赖。PNG 与原始二进制是可重新打包的中间资源。

浏览器采用原生 WebGL，保留原网格、贴图、火焰形变和火星运动；流动遮罩、噪声及体积材质适配成 GPU 着色器，非 Blender 体积渲染的逐像素复现。完整材质、驱动器和体积仍保留在 `.blend`。动画按源文件的 12 秒时段重复，沿用其周期边界。

旧预渲染图集及其播放器保留作基线，本页面已改用三维播放器。

2026-10-14 修复（覆盖下一段光照/手部/火星旧参数）：双色的天空权重 .12、火光 1.8，距离衰减 .28；照度 .28–.60 内使用 Bayer，掠射亮边上限 .55。火光是主光，避免天空把背部点亮却让前侧变暗。两臂在球面倾斜后以世界空间重摆；左掌搭膝、手指放松；右掌横向握杆，指束基部对齐后分节弯曲，拇指从另一侧闭合，杆穿过指间而非锚在腕尾。仍使用源网格与骨骼。12个源火星改为3/4秒错相的上升生命周期，末尾缩小淡出；12秒边界周期一致。双色烟点也随向上的流动移动，避免世界固定hash产生静止点阵。源火焰形变保留；暂停/reduced-motion共用既有静止时钟。打包脚本检查上升与重生前淡出。2026-10-14 桌面页面与33网格/288帧资产、lint/build/tsc均通过（7条既有lint警告）；手机及所有视角自动碰撞证明不在本轮验收范围。

2026-10-11 人物双色明暗重构（覆盖下面的全范围蓝噪声人物处理）：人物、石圈、木柴单独计算固定弱天光与有遮挡的近距离火光，纹理明度只作少量修饰，避免深色夹克吞掉受光面。亮暗之间仅 0.35–0.52 的照度过渡使用 1 CSS px 的 4×4 Bayer；其他区域保持整块墨/纸色，反向外壳细暗轮廓分离亮面边界，掠射角亮边辅助暗面分离，脸部保留原贴图中的眼睛、发须。火焰用源形变/流动遮罩形成不透明纸色亮形与墨色边界，取消双色体积叠层，烟雾变为稀疏点状；原色体积保持。灯球仍使用此前独立的 Hero 风格。依据 Lucas Pope [2014-09 开发日志](https://dukope.com/devlogs/obra-dinn/tig-04/)中人物纹理/阴影被蓝噪声削弱、尝试独立 Bayer 的讨论；这是为本场景重写的近似风格，不声称复刻原游戏渲染器。

2026-10-11 网页双色调整：球面仍为相同可旋转网格，双色按首页灯球的 CK_tile / CK_sky、相机白色填缝（0.9）、Standard 转换和共用 `blue-noise-128.png` 的 2 CSS px 各向同性量化显示，原色仍为暗场。人物双色独立提亮、保留阴影；原色局部倒影采用反射 mip 链模糊，镜片边缘保持清楚，双色灯球使用首页原有环境效果。双色背景为静态细颗粒与 32 个稀疏缓慢上浮的粒子，由同一个 GSAP 时钟驱动，暂停/reduced-motion 时不漂移。此调整为网页展示，不改源 Blender 材质。

Hero 滚动接入计划见 `idea/harry-orb-hero-plan.md`；正式首页尚未修改。Blender 中整组挂在同一根节点。

暗场网页保留原镜片几何、倾角、metallic=1、roughness=0.045 与完整源 HDR 环境（线性 RGBM + 无损 WebP）。环境强度 0.008，填缝发光为 0；原亮灯参数保存在 Blender 节点的 source_strength 和网页材质的 sourceEmissionStrength，供未来转场使用。人物和石圈使用线性 GGX 照明、平方距离衰减、六面点光源阴影及色调映射。镜片有源环境反射、局部火光反射和实际人物/火堆的顶部切平面倒影，倾斜镜片扰动倒影。切平面只适用于当前巨大球体的顶部近景；球体缩小时需升级为球面反射探针。反射与源体积适配均非逐像素光线追踪；完整 Blender 使用 Cycles、源火焰/灯光和弱冷色面光作编辑及离线渲染基准。
