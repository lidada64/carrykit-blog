/**
 * light.glsl.ts —— W5 灯球照度通道
 *
 * 迪斯科灯球在 DOM 层(HR-8 的反色凹槽要 `mix-blend-mode` 作用在 `<img>` 上,
 * 球不能进 canvas),水在 WebGL 层。两层只靠 `contract.ts` 的 `OrbState` 这条
 * 极窄的单向通道耦合。本文件是**消费端**。
 *
 * ── 三条通道,各管各的 ──────────────────────────────────────────────────
 *  ① **波幅**  `orbPatch(p, t)` → `waterPatchAmp` 里按 `uFieldOrbPatchGain` 加权。
 *     返回的是**波幅增益,不是亮度**。波幅高 → 斜率大 → 反射方向扫得过环境列的
 *     岸线边界 → 那片水自己就"活"起来。直接调亮度会把 W3 那条单峰对比度链打断。
 *  ② **照度**  `waterOrbIrradiance(p)` → 在 shade 里分两路进那条分层链:
 *        lum = (1-F)·(body + **BodyGain·E**) + F·(env + spec + **SpecGain·E·D**)
 *     前者是光束打进水体被散射出来的漫射池,后者是同一束光在水面的镜面闪。
 *     **不许在 tonemap 前后加一坨平的亮度** —— 那会把前景平坦度与对比度带一起打断。
 *     E(p) 由两项相加:24 个**镜片斑**(`waterOrbSpotSum`)+ 一个**主光池**
 *     (`waterOrbMainPool`,W11a 新增)。为什么必须补主光池,见下面那一段。
 *  ③ **环境**  灯球在水里的**倒影**、以及天空里的**光晕**,走 `env-column.ts` 的
 *     `EnvColumnParams.lights` 在 **CPU 侧**注入环境列 LUT,shader 这边一行代码都不加。
 *     理由:环境列是"无穷远环境沿仰角的一条辐射亮度分布",倒影与光晕本来就是
 *     它上面多出来的一个高斯亮斑;另写解析式等于把同一件事做两遍。
 *  ④ **渐晕(W10)**  `waterOrbFocusDim(p)` → 在 shade 里**乘**在 body 上:
 *        lum = (1-F)·(body + BodyGain·E)·**dim** + F·(env + spec + SpecGain·E·D)
 *     前三条是加法通道(往水里打光),这一条是乘法通道(把没打到的地方压暗)。
 *     mid 的前景早被 tonemap 顶成饱和白,加法在那儿是零收益 —— 只有压暗有效。
 *     **不许改成加在 lum 上**,理由见下面 uOrbFocus 那一段。
 *
 * ── W11a:night 上「灯球照不亮水」的实测根因 ────────────────────────────
 * 用户反馈"夜景里 disco orb 的照射效果不明显"。实测定位出两条,**它们推翻了
 * presets.ts 里 W5 写下的那句「靠镜面闪出效果」**:
 *
 * ① **night 上灯球的镜面通道是几何性死的,不是增益不够。**
 *    单开 `uOrbSpecGain = 2.0`,全画面 maxΔ ≤ 4/255。
 *    夜景相机 4 m 高、camPitch −0.1413(几乎平视),画面下缘那点水在 **24.2 m**
 *    外。从那点看相机的仰角 9.4°,看灯球(世界 −8.44, 13.37, 33.48)的仰角
 *    **46.8°** —— 半程向量偏离法线 36.7°,`tan²θ_h = 0.554`,而水面坡度方差
 *    σ² 只有 2e-4~1e-2 ⇒ Beckmann 的 `exp(−0.554/σ²) ≈ e⁻⁵⁵ = 0`。
 *    月光能出路径是因为它在无穷远、仰角 0.18 rad,与视线的 9.4° 互为镜像,
 *    `dot(N,H) = 0.99998`。
 *    而且灯球的**镜像点在水下 13.37 m**,相机看它是俯角 26.7°,画框下缘只到
 *    9.4° —— 镜像本身就在画外。球挂在 NDC y=0.42 时,即使把它推到无穷远,
 *    反射点也只收敛到 **14.3 m**,永远进不了 24.2 m 的画框。
 *    **结论:night 上调 uOrbSpecGain 是白调,别再往那儿使劲。**
 *
 * ② **唯一活着的是漫射池(body),但弱一个量级。**
 *    22 个镜片斑的强度是陡尾分布:峰值 0.385,中位数 0.05。
 *    `uOrbBodyGain 1.6 × 0.385 = 0.616`,×(1−F)=0.43(36 m 处)→ Δlum 0.265,
 *    只有最强那一斑翻白;中位斑 Δlum 0.028。整片水面平均灰度只被抬
 *    23.76 → 24.37(+0.24%)。抖动前 42335 px 变了,抖动后只剩 2704 px ——
 *    **1-bit 在均值 0.093 的暗场里扔掉 94% 的信号**,夜景上只有"局部白点密度"
 *    读得出来,峰值读不出来。白点密度(>127 的像素占比)网格:月光路径 15~35%,
 *    其余水面 0.1~5%,W5 那版灯球最高只有 4.0%。
 *
 * 所以 W11a 补的是 **⑤ 主光池**(`waterOrbMainPool`):一个**平顶 + 各向异性
 * 裙边**的低强度大面积照度,加进 E(p) 里走同一条 body 路。它不是新通道,
 * 是通道②里"镜片斑之外的那份漫射光"—— 真实的迪斯科球除了几十个锐光斑,
 * 球体本身也在往下泼一片弱光,W5 只建模了前者。
 *
 * ── 两种模式,共用同一组 uniform ────────────────────────────────────────
 *  **模式 A(uOrbLightMode = 0,本卡的主力)**:程序化。球面上取
 *  `facetCount` 片镜子,对主光求反射,与 y=0 求交得到光斑中心。
 *  **K 个光斑中心与强度全部在 CPU 上算好**(`orb-light.ts`),以 `uOrbSpots[]`
 *  传进来;shader 里只做 K 次核函数求和。三角函数与球面取样每帧算一次,
 *  不是每像素算 K 次 —— K=24 时这是数量级的差别。
 *
 *  **模式 B(uOrbLightMode = 1)**:采样 `ball-waterlight` 照度序列
 *  (docs/blender-assets.md B-4),帧号 = `floor(spinPhase*120)`。
 *  **这张纹理还不存在**,所以 B **必须能优雅回落到 A**:渲染台不绑纹理时
 *  `uOrbLightmapSize` 是 (0,0),`waterOrbIrradiance` 直接走 A 分支,
 *  既不黑屏也不报错。回落是靠尺寸判定而不是靠采样结果 —— 未绑定的 sampler2D
 *  在 WebGL2 里采出来是 (0,0,0,1),那和"照度为 0"分不开。
 *
 * ── 拼装顺序与前向依赖 ──────────────────────────────────────────────────
 * 顺序是 **HEAD + FIELD + LIGHT + SHADE + DITHER + TAIL**。
 * `waterPatchAmp` 在 FIELD 里就要调 `orbPatch`,而 `orbPatch` 定义在这里 ——
 * 所以 `field.glsl.ts` 里留的是 `orbPatch` 的**前置声明**(GLSL ES 3.00 支持),
 * 定义在本文件。选这个方向而不是把 LIGHT 提到 FIELD 前面,是因为反过来
 * LIGHT 要用 FIELD 的世界坐标约定,而 SHADE 要用 LIGHT 的照度 ——
 * 一条链上只允许有一处前向声明,放在最上游最省事。
 *
 * ── 成本 ────────────────────────────────────────────────────────────────
 * 每像素:shade 里 1 次 K=24 的核求和(约 24×8 flop),field 里 1 次单团高斯。
 * 核函数用 `(1-d²)³` 的紧支撑多项式而不是 `exp` —— 24 个 `exp` 每帧 2M 像素
 * 是 5e7 次超越函数,在 0.4ms 的预算里放不下,而多项式核有紧支撑、边缘还更干净。
 * 波幅通道**故意不逐镜片**:它是米级的斑块调制(和 `waterPatchAmp` 同一层),
 * 用 CPU 算好的质心 + RMS 展布画一团就够,省掉第二次 K 循环。
 *
 * **主光池(W11a)**:每像素 1 次 `length` + 1 次 `smoothstep` + 2 次 `dot`
 * + 1 次 `normalize` ≈ 12 flop。相对已有的 24 斑核求和(~190 flop)可忽略,
 * 而且 `uOrbPoolGain = 0` 时第一行就返回 —— 三个 preset 里只有 night 开它。
 */
import { ORB_MAX_SPOTS } from "./contract";

export const SRC = `
// —— 模式与总闸门 ——
uniform int   uOrbLightMode;    // 0 = A 程序化;1 = B 预渲染(纹理缺失时自动回落 A)
uniform float uOrbEnergy;       // 0..1 总闸门。**0 时本模块所有出口精确返回 0.0**

// —— 球的世界位姿(场坐标:x 右、y 上、z 远离相机,与 field.glsl.ts 的 p 同系)——
uniform vec3  uOrbCenter;       // (x, 离水面高度, y_field),单位米
uniform float uOrbRadius;       // 球世界半径(米)

/* —— 光斑数组(CPU 算好,见 orb-light.ts)——
 * xy = 光斑中心的场坐标(米);z = 1/半径(米⁻¹,预先取倒数省掉每像素一次除法);
 * w = 峰值强度(已含 cosθ 与 1/d²,**未含 energy**)。未用的槽位 w = 0。 */
uniform vec4  uOrbSpots[${ORB_MAX_SPOTS}];

// —— 三条通道各自的增益 ——
uniform float uOrbBodyGain;     // 进 (1-F)·body 的漫射池增益
uniform float uOrbSpecGain;     // 进 F·spec 的镜面闪增益
uniform float uOrbPatchGain;    // orbPatch 的输出幅度(再被 uFieldOrbPatchGain 加权)
uniform vec2  uOrbPatchCenter;  // 波幅斑块中心(场坐标)
uniform float uOrbPatchRadius;  // 波幅斑块半径(米)

/* —— ⑤ 主光池(W11a)——
 * 镜片斑之外的那份漫射光。**只有 night 开**(见 presets.ts 的 NIGHT_POOL)。 */
uniform float uOrbPoolGain;     // 主光池峰值照度(0 = 关,本模块出口精确返回 0.0)
uniform float uOrbPoolRadius;   // 池的横向世界半径(米)
uniform float uOrbPoolFlat;     // 平顶比例 0..1(<flat 的部分是 1.0)
uniform float uOrbPoolFar;      // 远侧(背离相机)沿视线拉长倍数
uniform float uOrbPoolNear;     // 近侧(朝向相机)拉长倍数
/* 退场后退(W11b)。0 = 池子在原位;1 = 池心已经沿视线退到地平线附近、半径缩到
 * WATER_ORB_RETREAT_MINR。**0 时逐位不变**:c × (1.0 + 0.0×K) ≡ c、
 * mix(1.0, m, 0.0) ≡ 1.0,IEEE 下乘 1.0 是恒等的(同 uOrbFocus / uOrbEnergy 那两条闸门)。
 * 由编排器行⑪驱动,不是旋钮 —— 见 water-director.ts。 */
uniform float uOrbPoolRetreat;

/* —— 镜面闪的 Beckmann 参数 ——
 * 本模块自带一份,不复用 shade.glsl.ts 的 waterSpecular():
 *  ① 拼装顺序上 LIGHT 在 SHADE 之前,借不到;
 *  ② 灯球和月亮是**两个不同的光源**,立体角与饱和上限本来就该各自一份;
 *  ③ 最要紧的一条 —— 动 waterSpecular() 的表达式会改变浮点求值顺序,
 *     energy=0 的逐字节回归(docs/water-orb-coupling.md §5)立刻挂掉。 */
uniform float uOrbOmega;        // 单片镜子在水面处张开的立体角(sr)
uniform float uOrbSigmaFloor;   // σ² 下限,同 uShadeSigmaFloor 的理由
uniform float uOrbSpecClip;     // 饱和上限

/* —— 模式 B:ball-waterlight 照度序列(sprite sheet)——
 * uOrbLightmapSize 由渲染台按纹理尺寸写入;**(0,0) = 纹理没绑上 → 回落模式 A**。 */
uniform sampler2D uOrbLightmap;
uniform vec2  uOrbLightmapSize;
uniform float uOrbLightmapFrame;  // = floor(spinPhase * 120)
uniform float uOrbLightmapCols;   // sprite sheet 的列数 / 行数
uniform float uOrbLightmapRows;
uniform vec4  uOrbLightmapRect;   // 照度图覆盖的场坐标矩形 (minX, minY, sizeX, sizeY)

/* —— 隐藏字模(灯球手电筒彩蛋)————————————————————————————————————————————
 * 水下藏着一句 "CarryKit is not just CarryKit",平常不可见,只在灯球照度里显形。
 * 字**不是叠层**:它按世界坐标平铺在水平面的一个矩形里,取出的覆盖度在 shade 里
 * 乘 waterOrbIrradiance(p) 后加进 body —— tonemap + 抖动之前,所以字天生长在水里、
 * 透视正确(逆投影自己给近大远小)、墨点与水波同源。见 idea/灯球彩蛋.md 二、四。
 *
 * uOrbTextGain / uOrbTextSize 任一为 0(关闭 / 纹理未绑)时 waterOrbText 精确返回
 * 0.0 —— 上游 (uShadeBody + orbBody + 0.0) 与接入前逐位相同(同 uOrbEnergy 那条闸门)。 */
uniform sampler2D uOrbText;       // 世界坐标字模贴图。R = 字覆盖度 0..1
uniform vec2  uOrbTextSize;       // 纹理尺寸;(0,0) = 未绑 → waterOrbText 返回 0
uniform vec4  uOrbTextRect;       // 字铺在水面的场坐标矩形 (minX, minY, sizeX, sizeY)
uniform float uOrbTextGain;       // 0 = 关闭(waterOrbText 精确返回 0 → 字项闸门关)
uniform float uOrbTextDark;       // 字笔画处 body 的乘法系数。<1 = 暗墨字 / >1 = 亮字
uniform float uOrbTextLit;        // 照度显形阈值:smoothstep(0, 这个, orbE),照度到这才显字
/* /lab/water-text 验证台专用调试闸门。>0.5 时水面分支直接输出字模覆盖度(绕过照度/
 * 分层/tonemap 前的一切),纯看字模按世界坐标铺开的形状、透视、有没有缝。默认 0 →
 * shade 里那条 if 为 false,lum 表达式逐字节不变(闸门安全,同 uOrbEnergy 那条)。 */
uniform float uOrbTextDebug;

/* ── W10 聚焦渐晕(mid 的 B 态)────────────────────────────────────────────
 * **为什么是"压暗"而不是"加亮"。** mid 前景的 tonemap 输出是
 * (0.62 − 0.48) × 8 + 0.48 + 0.10 = 1.70,**被 clamp 到 1**。头顶 70% 的余量
 * 全浪费,往饱和白上加光什么都不会发生 —— 这就是 W5 灯球在 mid 上"亮不起来"
 * 的算术根因(实测只改到 0.12% 的像素)。所以 B 态用**渐晕**:把没有光照的
 * 地方压暗,用**对比**而不是加法。
 *
 * 顺带一个好处:foregroundFlatness 是**减掉 41px 盒模糊之后**量的,平滑渐晕
 * 属于大尺度亮度,那一步会把它减掉;全局压 uShadeBody 则是给整片撒网点,
 * RMS 必涨(实测 body 0.62→0.52 时前景平坦度 0.00→0.166、覆盖率 16.9→44.2)。
 *
 * **出口 waterOrbFocusDim 乘在 body 上,不许加在 lum 上。** 加在 lum 上会
 * 打断 shade.glsl.ts 那条 lum = (1−F)·body + F·(env + spec) 的分层链,
 * 前景平坦度与对比度带会一起失效 —— 这是这个项目从 W2 起反复踩的同一条。
 *
 * 与 uOrbEnergy **互不统属**:energy 管"灯球往水里打多少光"(加法通道),
 * focus 管"没被照到的地方压多暗"(乘法通道)。energy=0 时照样可以聚焦
 * (画面只剩渐晕),focus=0 时照样可以照亮。两个闸门各自独立地精确归零。 */
uniform float uOrbFocus;        // 0..1 总闸门。**0 时 waterOrbFocusDim 精确返回 1.0**
uniform vec2  uOrbGround;       // 球在水面的落点(场坐标,米)。CPU 侧 = uOrbCenter.xz
uniform float uOrbPoolR;        // 光池半径(米)。球在 6.85 m 外、高 0.75 m 时 2.6
uniform float uOrbAmbient;      // 池外残留**系数**(乘在 body 上,不是减)。0.58 ⇒ 有效 body 0.36
uniform float uOrbGrain;        // 碎粒频率(1/米)。迪斯科球把光打碎成一地亮斑
uniform float uOrbGrainBias;    // 碎粒阈值。waterVNoise 的分位数 p05 0.15 / p50 0.50 / p95 0.85
uniform float uOrbFarKeep;      // 远景带的保护系数:远处只压到这个比例,"对岸"才读得出
uniform float uOrbSpinPhase;    // 0..1 自转相位。碎粒跟着球一起慢慢挪

const float WATER_ORB_PI = 3.14159265;

/* 退场后退的两个常数(W11b)。写死不做 uniform:它们是**退场这一段动效的形状**,
 * 和 exitDuration 一样属于编排层的调参,不是 preset 的美术参数;做成 uniform 只会
 * 多两个没人拖的滑块,还多两处会漂的拷贝(docs §11 坑 7)。
 *  · K = 3.0    池心沿视线拉远到 4 倍距离。night 48.4 m → 194 m。
 *  · MINR = 0.35 半径缩到 35%。缩到 0 会在最后一帧闪一个亮点(池心恒为峰值,
 *    半径趋 0 时那一个像素仍是满亮),0.35 配合 energy→0 才是干净地化掉。 */
const float WATER_ORB_RETREAT_K    = 3.0;
const float WATER_ORB_RETREAT_MINR = 0.35;

/* 远景保护带的跨度,以池半径为单位。景深权重从**光池的近边**开始爬,
 * 爬满 0.7 个池半径(mid: 4.15 → 5.97 m)。
 *
 * **这个锚点是实测挖出来的,不要往后挪。** mid 的十条横带按屏幕等分,换算成
 * 世界深度是极不均匀的:band 9~5 落在 2.0~4.1 m(前景,focus=0 时是一片
 * 饱和白、RMS 恒为 0),band 4~2 落在 4.1~8.6 m(**暗划线全在这里**,
 * RMS 35/43/47),band 1~0 落在 8.6~24.6 m(掠射到几乎没有对比,RMS 0.6/1.2)。
 *
 * 也就是说"远景带"在**光池的近边前面一点点**就开始了,不在池子后面。
 * 第一版把爬升起点放在球的落点(6.75 m)、跨度 4 个池半径,band 2~4 的
 * depthWeight 只有 0~0.09 → 几乎不受保护 → RMS 35/43/47 掉到 7.6/8.0/5.5,
 * 画面上整条对岸带死成一片纯墨。算术上也说得通:
 *   · 前景要从饱和白翻成纯墨,需要 Δlum > 0.21 ⇒ dim < 0.65;
 *   · 暗划线带只要 Δlum > 0.13 就整条出窗 ⇒ 要留住它 dim 必须 > 0.87。
 * 两个要求差着 6 倍,所以景深权重必须在 **band 5 与 band 3 之间**(3.5~6 m)
 * 就爬满 —— 这正好是光池近边那一段。 */
const float WATER_ORB_FAR_SPAN = 0.7;

/* 池边溶解取阈值时在屏幕上的偏移(物理像素)。
 * **必须是偶数**:waterDitherThreshold 先 floor(frag / uDitherPixel),
 * 三个 preset 的 uDitherPixel 都是 2,偶数偏移等于整格平移 —— 溶解带的颗粒
 * 与画面其余部分**同一个网格、同一种语言**,不会退化成 1px 的细沙。
 * 平移量选 (40, 72):aniso 压缩后 x 向仍是整数格(20 × 0.30 = 6),
 * 于是取到的是同一张蓝噪声瓦片里 (6, 36) 处的另一个样本 —— 与量化那一次
 * **去相关**。不去相关的话低阈值像素会同时"落进池里"又"更容易是纸",
 * 两个效果叠在一起,溶解带会硬得像一条剪影边。 */
const vec2 WATER_ORB_DISSOLVE_OFF = vec2(40.0, 72.0);

/* dither.glsl.ts 的前置声明。拼装顺序是 … + LIGHT + SHADE + **DITHER** + TAIL,
 * 阈值图在本模块之后才拼进来,所以这里只能声明(GLSL ES 3.00 支持函数原型)。
 *
 * assemble.ts 的文件头写过"一条链上只允许有一处前向声明",指的是
 * FIELD ⇄ LIGHT 那条环。这里是**第二条、而且不成环**的依赖:LIGHT 用 DITHER,
 * DITHER 谁都不用。反过来把 DITHER 提到 LIGHT 前面也能编过,但那会重排整份
 * 着色器的声明顺序,而本卡的硬验收是"focus=0 时输出逐字节不变" ——
 * 加一行原型是唯一零风险的做法。
 *
 * **不要在这里另写一套阈值。** 溶解与量化必须是同一张蓝噪声、同一个网格,
 * 否则边缘会出现两种颗粒打架(docs §4 坑 ① 的同类)。 */
float waterDitherThreshold(vec2 frag);

/* ── 光斑核 ──────────────────────────────────────────────────────────────
 * (1 - d²)³ 的紧支撑核。选它不选高斯有三个理由:
 *  · 没有 exp:24 个高斯 × 2M 像素 = 5e7 次超越函数,吃光 0.4ms 的预算;
 *  · 紧支撑:d>1 精确为 0,不会在远处留一层抬高整幅画面的地板 ——
 *    那层地板在 1-bit 抖动下会变成一片糊掉的中灰(W3 §9.2 的"天空中灰"同类病);
 *  · 边缘是三阶接触,比高斯的长尾更容易在 1-bit 下抖出干净的溶解带。 */
float waterOrbKernel(vec2 d){
  float k = 1.0 - dot(d, d);
  if (k <= 0.0) return 0.0;
  return k * k * k;
}

/** 模式 A:K 次核求和。循环上界是编译期常量,不是动态循环。 */
float waterOrbSpotSum(vec2 p){
  float e = 0.0;
  for (int i = 0; i < ${ORB_MAX_SPOTS}; i++){
    vec4 s = uOrbSpots[i];
    e += s.w * waterOrbKernel((p - s.xy) * s.z);
  }
  return e;
}

/**
 * ⑤ **主光池(W11a)**。一个平顶 + 各向异性裙边的大面积弱照度,与 24 个镜片斑
 * **相加**后一起走 body 那一路(见文件头 W11a 那一段的实测根因)。
 *
 * 形状:池心取球**正下方**的水面点(uOrbCenter.xz,不是光斑质心 ——
 * 质心会跟着自转相位跳,而"球下面那摊光"不该跳)。以相机→池心的方位
 * ax 为长轴,横向(ax 的法向)按 uOrbPoolRadius 度量,纵向按
 * along / k 度量:k 在远侧取 uOrbPoolFar、近侧取 uOrbPoolNear。
 * 1 − smoothstep(flat, 1, d) 给出**平顶**:d < flat 的部分恒为 1.0,
 * flat..1 之间是三次裙边。平顶而不是高斯,理由与 waterOrbKernel 同一条 ——
 * 紧支撑,d > 1 精确为 0,不会在远处留一层抬高整幅画面的地板。
 *
 * ── 为什么远近**不对称** ────────────────────────────────────────────────
 * 对称拉长(Far = Near)会把池子的近边一起拖进前景,前景平坦度 从 0.155
 * 掉到 0.286 —— **直接 FAIL**(门槛 0.15)。而参考图里"光在水上是一道竖着
 * 的路",那道路是往**地平线方向**拖的,不是往脚下拖:近侧 0.55 反而要比
 * 圆(1.0)更**收**,远侧 2.6 才是拉长的那一头。
 *
 * ── 退化情况 ────────────────────────────────────────────────────────────
 * normalize(c) 里 c 理论上不可能是 0 向量:球挂在画面上方,它正下方的水面点
 * 必在相机前方(z > 0)。但"理论上不可能"在这个项目里已经翻过车(docs §17.2
 * 坑 15),所以显式兜住 length(c) < 1e-4,退回正前方 (0, 1) ——
 * 返回 0 会在球飞过相机头顶的那一帧闪一下,借个轴不会。
 */
float waterOrbMainPool(vec2 p){
  if (uOrbPoolGain <= 0.0) return 0.0;
  /* ── 退场后退(W11b)────────────────────────────────────────────────────
   * 球升起离场时,池子要「往地平线退 + 缩小 + 变暗」。变暗由 uOrbEnergy 免费
   * 给(它乘在 waterOrbIrradiance 的出口上),这里只做前两件。
   *
   * **后退必须显式驱动,不能指望几何。** 球心解算是
   * dist = worldRadius / sin(atan(radiusNdc·tanH)) —— dist 只跟 radiusNdc
   * 和 worldRadius 有关,球沿屏幕**升高**时 dist 不变、仰角变大,于是它正下方的
   * 水面点 (x, z) 反而**离相机更近**。也就是说光靠时间线抬高球,池子是往
   * 脚下走而不是往地平线走,正好是反的。
   *
   * 后退量取「沿视线方向按比例拉远」而不是「加多少米」:三个 preset 的世界
   * 尺度差一个数量级(night 48 m / mid 6.8 m / near 1.8 m),加米数在 near 上
   * 会把池子直接扔出宇宙。K = 3 ⇒ night 的 48.4 m 退到 194 m,那里离地平线
   * (画面上 y≈815)只剩十几个像素,读起来就是「收回海岸线」。 */
  float rt = clamp(uOrbPoolRetreat, 0.0, 1.0);
  vec2  c  = vec2(uOrbCenter.x, uOrbCenter.z) * (1.0 + rt * WATER_ORB_RETREAT_K);
  float cl = length(c);
  vec2  ax = cl > 1e-4 ? c / cl : vec2(0.0, 1.0); // 相机在原点,池心方向就是视线方位
  vec2  q  = p - c;
  float along = dot(q, ax);
  float k = along > 0.0 ? max(uOrbPoolFar, 1e-3) : max(uOrbPoolNear, 1e-3);
  vec2  e = vec2(dot(q, vec2(ax.y, -ax.x)), along / k);
  float r = max(uOrbPoolRadius, 1e-3) * mix(1.0, WATER_ORB_RETREAT_MINR, rt);
  float d = length(e) / r;
  return uOrbPoolGain * (1.0 - smoothstep(clamp(uOrbPoolFlat, 0.0, 0.99), 1.0, d));
}

/** 取某一整数帧 f 在 uvp 处的照度(sprite sheet 行从上往下排,uvp.y 已翻好)。 */
float waterOrbLightmapFrameAt(float f, vec2 uvp, float cols, float rows){
  vec2 cell = vec2(mod(f, cols), floor(f / cols));
  vec2 t = (cell + uvp) / vec2(cols, rows);
  return texture(uOrbLightmap, vec2(t.x, 1.0 - t.y)).r;
}

/** 模式 B:从 sprite sheet 取当前帧,按场坐标映射到那一格的 uv。 */
float waterOrbLightmapSample(vec2 p){
  vec2 uv = (p - uOrbLightmapRect.xy) / max(uOrbLightmapRect.zw, vec2(1e-4));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  float cols = max(uOrbLightmapCols, 1.0);
  float rows = max(uOrbLightmapRows, 1.0);
  float total = cols * rows;
  // uv.y 向上,sprite 行从上往下,翻过来
  vec2 uvp = vec2(uv.x, 1.0 - uv.y);
  // uOrbLightmapFrame 现在是**连续量**(spinPhase*120)。B-4 是 360°/120 帧、9s 一圈 ~13fps,
  // 直接 floor 取一帧会一段一段跳格 —— 这里取相邻两帧按小数部分线性混合(末帧 119→0 无缝,
  // 见 waterlight-build.py)把光斑游走补连续。整数帧时 w=0,与旧单帧取样逐字节相同(金标不受影响)。
  float ff = mod(uOrbLightmapFrame, total);
  if (ff < 0.0) ff += total;
  float f0 = floor(ff);
  float f1 = mod(f0 + 1.0, total);
  float w  = ff - f0;
  float s0 = waterOrbLightmapFrameAt(f0, uvp, cols, rows);
  float s1 = waterOrbLightmapFrameAt(f1, uvp, cols, rows);
  return mix(s0, s1, w);
}

/**
 * 水面 p 处收到的灯球照度(未乘任何增益)。**总闸门在这里**。
 *
 * uOrbEnergy <= 0.0 时**精确返回 0.0**(而不是"很小的数"):
 * 上游 (1-F)*(uShadeBody + 0.0) 与 env + spec + 0.0 在 IEEE 下与
 * 灯球接入前逐位相同,这是 §5 那条"md5 逐字节相同"验收唯一站得住的做法。
 */
float waterOrbIrradiance(vec2 p){
  if (uOrbEnergy <= 0.0) return 0.0;
  /* 模式 B 的纹理还不存在(docs/blender-assets.md B-4 未渲)。尺寸为 0 = 没绑上,
   * 回落到 A。判尺寸不判采样值:未绑定的 sampler2D 采出来是 0,和"这里没光"分不开。 */
  if (uOrbLightMode == 1 && uOrbLightmapSize.x >= 1.0){
    return uOrbEnergy * waterOrbLightmapSample(p);
  }
  /* W11a:镜片斑 + 主光池。模式 B 不加池 —— B 的照度图本来就该把球体本身泼下来
   * 的那份弱光一起烘进去(docs/blender-assets.md B-4),再加一遍就是算两次。 */
  return uOrbEnergy * (waterOrbSpotSum(p) + waterOrbMainPool(p));
}

/**
 * 隐藏字模在水面 p 处的**覆盖度**(0..1)。**不含照度、不含增益** —— 那两样在
 * shade 里乘,好处见文件头那段:字 × 照度 + tonemap 前入 body = 不分层。
 *
 * uOrbTextGain <= 0(关闭)或 uOrbTextSize.x < 1(纹理未绑)时**精确返回 0.0**:
 * 上游 (uShadeBody + orbBody + uOrbTextGain·0.0·E) 的第三项恒为 0.0,与字模接入前
 * 逐位相同。判尺寸不判采样值 —— 未绑定的 sampler2D 采出来是 0,和"这里没字"分不开
 * (同 waterOrbLightmapSample 的模式 B 回落)。
 *
 * 映射:字铺在水平面的世界矩形 uOrbTextRect 内。贴图 u→场坐标 x(句子横排),
 * v→场坐标 y_field(离相机的纵深)。sprite 行从上往下,v 翻过来。矩形外返回 0
 * —— 光斑扫不到的地方本来就该黑,这一层只是省掉一次越界采样。
 */
float waterOrbText(vec2 p){
  if (uOrbTextGain <= 0.0 || uOrbTextSize.x < 1.0) return 0.0;
  vec2 uv = (p - uOrbTextRect.xy) / max(uOrbTextRect.zw, vec2(1e-4));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uOrbText, vec2(uv.x, 1.0 - uv.y)).r;
}

/**
 * 从水面点看向球心的方向(**相机系**,与 shade.glsl.ts 的 N/V 同系)。
 * 场坐标 (x, 0, y_field) 在相机系里是 (x, 0, -y_field) —— 第三轴反号,
 * 和 waterFieldToView 是同一个约定。
 */
vec3 waterOrbLightDir(vec2 p){
  return normalize(vec3(uOrbCenter.x - p.x, uOrbCenter.y, -(uOrbCenter.z - p.y)));
}

/**
 * 灯球在水面上的**镜面光路**。与 shade 的月光高光同一套 Beckmann,参数各自一份。
 *
 * ── 一个走了弯路才想明白的地方 ──────────────────────────────────────────
 * 第一版把这一项**乘上了光斑照度 E(p)**,理由是"镜片光斑在水面的镜面反射"。
 * 那是错的,而且错得很彻底:光斑落在 A 点,它在 A 点的镜面反射方向是
 * reflect(-L, N),对近乎水平的水面来说这条反射光**朝远离相机的方向走了**;
 * 相机在 A 点看到的镜面反射来自完全另一个方向。实测 dot(N,H) ≈ cos45°,
 * 而水面斜率 p99 只有 0.12(7°),Beckmann 的 exp(-tan²/σ²) 直接是 0 ——
 * 那一版无论把增益开到多大,画面上一个像素都不会变。
 *
 * 正确的物理:镜面项是**球本身(及其镜片)在水里的像**被波面打散成的一条光路,
 * 和月光路径同一个机制。它出现在球的镜像方向上,**不在光斑落点上**,
 * 所以这里只按球心方向算一次,不乘 E(p)。
 * 光斑落点那一片的贡献是**漫射**的(光进了水体又散射出来),走 body 项。
 */
float waterOrbSpecular(vec3 N, vec3 V, vec3 L, float sigma2){
  if (uOrbEnergy <= 0.0) return 0.0;
  float ndl = dot(N, L);
  if (ndl <= 0.0) return 0.0;
  vec3  H  = normalize(L + V);
  float ct = clamp(dot(N, H), 1e-3, 1.0);
  float s2 = max(sigma2, uOrbSigmaFloor);
  float c2 = ct * ct;
  float tan2 = (1.0 - c2) / c2;
  float D = exp(-tan2 / s2) / (WATER_ORB_PI * s2 * c2 * c2);
  return min(uOrbEnergy * D * uOrbOmega * ndl, uOrbSpecClip);
}

/**
 * ① 波幅通道。返回**波幅增益**,不是亮度 —— 见文件头。
 *
 * field.glsl.ts 里只有前置声明,定义在这里。
 *
 * **故意不逐镜片**:waterPatchAmp 本身就是米级的"哪片水面起风"那一层,
 * 分米级的镜片光斑在这一层没有意义,而且会让每像素多跑一次 K 循环。
 * 用 CPU 算好的光斑质心 + RMS 展布画一团,(1-d²)³ 同一个核,成本是常数。
 */
float orbPatch(vec2 p, float t){
  if (uOrbEnergy <= 0.0) return 0.0;
  vec2 d = (p - uOrbPatchCenter) / max(uOrbPatchRadius, 1e-3);
  return uOrbEnergy * uOrbPatchGain * waterOrbKernel(d);
}

/**
 * ④ **聚焦渐晕(W10)**。返回一个乘在 **body** 上的 0..1 系数。
 *
 * uOrbFocus <= 0.0 时**精确返回 1.0**(而不是"很接近 1 的数"):
 * IEEE 下 x × 1.0 ≡ x,于是 (uShadeBody + orbBody) * 1.0 与本卡接入前
 * 逐位相同 —— 这是 §3 那条"md5 逐字节相同"验收唯一站得住的做法,
 * 与 uOrbEnergy 那条闸门同一个写法。
 *
 * 四件必须做对的(任务书 §2.1):
 *
 * ① **世界空间距离,不是屏幕椭圆。** p 是 waterSurfacePoint 逐像素逆投影
 *    出来的场坐标,length(p - uOrbGround) 按**米**算。池子因此自动
 *    "近边宽、远端压扁" —— 屏幕椭圆是错的形状,一眼看得出。
 *
 * ② **边缘用蓝噪声阈值溶解。** 连续的池边坡道过 tonemap(contrast 8)之后
 *    只剩不到 1 px 的过渡带,1-bit 下就是一条刀切的剪影边。step(阈值, 坡道)
 *    把那条坡道摊成一带网点,和地平线、和整幅画面同一种语言。
 *
 * ③ **远景带保留。** 景深权重取 p.y(场坐标里"离相机多远",米)。
 *    前景 keep=1 全压,远处 keep→uOrbFarKeep 只压一点。
 *    物理上还有一层帮忙:远处掠射 F→0.72,body 本来只占亮度的三成,
 *    压 body 对远端的影响天然就小 —— uOrbFarKeep 是在这之上再留一手。
 *
 * ④ **mid 走的是纯光池,不跑 24 斑的核求和。** 那是 night 的路径,本函数
 *    一次 uOrbSpots[] 都没读。
 *
 * 成本:每像素 1 次 length + 1 次 smoothstep + 1 次 waterVNoise(4 次 hash)
 * + 1 次蓝噪声纹理取样。focus=0 时全部跳过(第一行就返回)。
 */
float waterOrbFocusDim(vec2 p){
  if (uOrbFocus <= 0.0) return 1.0;

  // ① 世界空间的光池:近边宽、远端压扁,是逆投影自己给的,不是画出来的
  float dist = length(p - uOrbGround);
  float edge = 1.0 - smoothstep(uOrbPoolR * 0.45, uOrbPoolR, dist);

  // ② 池边溶解:同一张蓝噪声、同一个网格,偏移一格避免与量化那一次相关
  float pool = step(waterDitherThreshold(gl_FragCoord.xy + WATER_ORB_DISSOLVE_OFF), edge);

  /* 碎粒:迪斯科球把光打碎成一地亮斑,池子里不是一块均匀的亮。
   * 阈值以下也不归零(mix 的下界 0.55),不然池子内部会分成死黑死白两片。 */
  float speck = waterVNoise(p * uOrbGrain + uOrbSpinPhase);
  float lit = pool * mix(0.55, 1.0, step(uOrbGrainBias, speck));

  // ③ 远景保护:景深权重从光池的**近边**开始爬(理由见 WATER_ORB_FAR_SPAN)
  float far0 = uOrbGround.y - uOrbPoolR;
  float depthWeight = smoothstep(far0, far0 + uOrbPoolR * WATER_ORB_FAR_SPAN, p.y);
  float keep = mix(1.0, uOrbFarKeep, depthWeight);

  return mix(1.0, mix(uOrbAmbient, 1.0, lit), uOrbFocus * keep);
}
`;
