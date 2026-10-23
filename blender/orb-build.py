# orb-build.py —— 迪斯科灯球主控场景,**从空场景完整重建**
#
# 为什么是一个文件而不是一串 MCP 调用:Blender 崩过一次,内存里没保存的东西
# 全丢了。场景必须是「脚本的输出」,不是「一串手工操作的沉淀」—— 否则每崩一次
# 就要重来,而且没人知道当前这颗球是怎么来的。
#
# 跑法(Blender 的 Scripting 里,或 MCP):
#     exec(open(r"C:\Users\12281\Documents\carrykit-blender\orb-build.py").read())
# 跑完自动存盘到 orb-master.blend。
#
# ── 所有数字的来源 ────────────────────────────────────────────────────
# 不是审美选的,是 scripts/orb-measure.mjs 量参考图量出来的:
#   · 纬向瓦距 6.54°  → RING 28
#   · 方瓦     → SEG_EQ 56
#   · 下半球(瓦全黑)白占比 34% = grout 面积 → 瓦片边长 = √0.66 = 0.813 格
#   · 瓦级 P_same(1瓦)=0.74,拖尾到 6 瓦还有 0.55 → 亮瓦成片,团簇 ≈ 3 瓦
#   · 亮瓦占比随纬度(下→上):0.19 0.06 0 0 0 0.10 0.33 0.45 0.40 0.46
#
# ── 一条关键的取舍 ────────────────────────────────────────────────────
# 亮瓦**不是涂白的**,是镜面反射到了亮的东西。参考图里亮瓦和 grout 是同一种
# 白、连成一片,涂白做不出这个。而且镜球一转,涂白的亮斑会跟着球转,一眼假;
# 反射出来的亮斑留在原地、瓦片从底下扫过,这才是真迪斯科球。
# 所以这里反解出一张天空贴图:方向 s 的天空对应球面法线 n = normalize(s − d),
# 把「该纬度要多少亮瓦」写成「该方向的天空要多亮」。

import bpy, bmesh, math, os, random
import numpy as np
from mathutils import Vector, Matrix

# ══ 参数 ══════════════════════════════════════════════════════════════
SEG_EQ, RING = 56, 28      # 赤道经向瓦数 / 极到极纬向瓦数
TILE_F   = 0.864           # 瓦片边长 ÷ 格距。实测目标 0.813;抗锯齿把每条缝两侧各涂白
                           # 约 1px,672px 下等效加宽 ~2px,所以要收窄补偿。0.845 那版
                           # 下半球(全黑瓦)白 36.6%,目标 33.6% → 再收 0.019。
R_TILE   = 1.0025          # 平面四边形中心会陷进球面(垂距),顶出去一点
R_CORE   = 0.9955          # 底球(=grout)半径。太低的话掠射角下缝被瓦片挡死,球缘发黑
JIT_DEG  = 4.6             # 每片瓦的法线抖动幅度;镜面反射方向偏转 2×
JIT_K    = 19.0            # 抖动场频率 → 相关长度 2π/K ≈ 19° ≈ 3 瓦
JIT_N    = 7
GROUT_E  = 0.90            # grout 自发光强度。0.72 时 sRGB ≈ 0.868,蓝噪声阈值均匀分布
                           # → 约 13% 的 grout 像素被抖成黑,抖动后暗带整体掉 4~5 点。
                           # 参考图的网格线是纯白,所以抬到抖完几乎不丢像素。
TILE_RGH = 0.045

SKY_W, SKY_H = 1024, 512
# 两层噪声。粗层定块的大小;细层是**可控性**要的 —— 靠近 +d(球背面方向)那圈
# 天空立体角很小,单用粗层的话里面只装得下一两个亮斑,coverage 0.145 和 0.21 的
# 区别就是「斑落进去 / 没落进去」,实测在 26.1% 和 53.8% 之间没有中间值。
SKY_KC, SKY_NC = 13.0, 24  # 粗:波长 ≈ 28° 天空 ≈ 14° 球面 ≈ 2.2 瓦
SKY_KF, SKY_NF = 38.0, 20  # 细:≈ 10° 天空 ≈ 5° 球面 ≈ 0.8 瓦,做瓦级碎边
SKY_AF   = 0.60            # 细层幅度
SKY_E    = 3.2             # 亮斑辐亮度,够高才能压过抖动阈值
# 亮瓦占比 vs 图像纬度(实测白占比扣掉 34% grout 底:lit = (white−0.34)/0.66)
# 知识点:coverage 是「天空亮斑面积比」,不等于「球上亮瓦比」—— 抖动、掠射、
# 瓦片互相遮挡都会吃掉一部分。所以这张表是**反解出来的控制量**,每次按实测
# 残差回调:lit = (white − grout) / (1 − grout),按 lit 的比例缩放 coverage。
# 下面这组是 6 轮「渲染 → scripts/orb-measure.mjs → 按残差回调」收敛出来的,
# 收敛时各带与参考图的 RMS ≈ 2.5 个百分点、整球白 42.5% 对 42.5%。
PROFILE  = [(-90,0.177),(-72,0.177),(-58,0.055),(-45,0.0),(-2,0.0),
            (9,0.160),(22.5,0.207),(37.5,0.360),(52.5,0.497),(67.5,0.482),(90,0.482)]

CAM_LOC  = (0.0, -6.2, 0.95)
CAM_LENS = 100.0           # 球占画幅 0.897。**改镜头不动 CAM_LOC** —— 上面那条透视
                           # 换算只依赖距离 D,换焦距不会让标定失效,但能把画幅里
                           # 30% 的透明边省掉(同样球径少 42% 像素)。
RES      = 360             # 交付尺寸:配 100mm 时球径 ≈ 323px。
                           # 标定模式用 RES=672 + CAM_LENS=78:球径 ≈ 470px,
                           # 与参考图(472px)同尺度,抗锯齿偏差才可比。
SAMPLES  = 96
SEED     = 20260911
SYM      = 4               # 球的 Z 轴旋转对称重数。循环只需转 360/SYM 度
LOOP_N   = 48              # 循环帧数 → 1.875°/帧。见下面「马车轮效应」那段
RINGS_ON = True            # 参考图那几道土星环
RING_R   = (1.62, 1.86, 2.04, 2.30)
RING_TILT_X, RING_TILT_Z = math.radians(22.0), math.radians(-8.0)

HERE = os.path.dirname(bpy.data.filepath) or r"C:\Users\12281\Documents\carrykit-blender"
BLEND = os.path.join(HERE, "orb-master.blend")
SKY   = os.path.join(HERE, "orb-sky.exr")

# ══ 清场 ══════════════════════════════════════════════════════════════
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for d in list(coll):
        if d.users == 0:
            coll.remove(d)

sc = bpy.context.scene
rng = random.Random(SEED)


def mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    return m



# ══ grout:底球,只对相机光线发亮 ══════════════════════════════════════
# 参考图里球最暗处的网格线也是白的 → grout 亮度与照明无关,只能是自发光。
# 但它是粗糙的填缝料,**不该出现在任何镜面反射里**。两种朴素写法都错:
#   · 让它对 glossy 可见 → 球缘的瓦反射到自发光底球,凭空多出一圈亮瓦;
#   · visible_glossy=False → 反射光线直接**穿过**底球打到对面的天空,还是亮。
# 正确做法是材质层面分流:相机光线看到亮白,其余光线看到纯黑的不透明体。
m_grout = mat("CK_grout")
nt = m_grout.node_tree
o = nt.nodes.new("ShaderNodeOutputMaterial"); o.location = (520, 0)
mx = nt.nodes.new("ShaderNodeMixShader"); mx.location = (320, 0)
e_off = nt.nodes.new("ShaderNodeEmission"); e_off.location = (120, -120)
e_off.inputs["Color"].default_value = (0, 0, 0, 1)
e_off.inputs["Strength"].default_value = 0.0
e_on = nt.nodes.new("ShaderNodeEmission"); e_on.location = (120, 60)
e_on.inputs["Color"].default_value = (0.93, 0.97, 1.0, 1.0)
e_on.inputs["Strength"].default_value = GROUT_E
lp = nt.nodes.new("ShaderNodeLightPath"); lp.location = (-120, 120)
nt.links.new(lp.outputs["Is Camera Ray"], mx.inputs["Fac"])
nt.links.new(e_off.outputs["Emission"], mx.inputs[1])
nt.links.new(e_on.outputs["Emission"], mx.inputs[2])
nt.links.new(mx.outputs["Shader"], o.inputs["Surface"])

bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=R_CORE)
core = bpy.context.object
core.name = "CK_core"
core.data.materials.append(m_grout)
bpy.ops.object.shade_smooth()

# ══ 瓦片 ══════════════════════════════════════════════════════════════
m_tile = mat("CK_tile")
nt = m_tile.node_tree
o = nt.nodes.new("ShaderNodeOutputMaterial"); o.location = (300, 0)
p = nt.nodes.new("ShaderNodeBsdfPrincipled"); p.location = (0, 0)
p.inputs["Base Color"].default_value = (0.94, 0.96, 1.0, 1.0)
p.inputs["Metallic"].default_value = 1.0
p.inputs["Roughness"].default_value = TILE_RGH
nt.links.new(p.outputs["BSDF"], o.inputs["Surface"])

waves = []
for _ in range(JIT_N * 2):
    z = rng.uniform(-1, 1); a = rng.uniform(0, 2 * math.pi); s = math.sqrt(max(0.0, 1 - z * z))
    waves.append((Vector((s * math.cos(a), s * math.sin(a), z)), rng.uniform(0, 2 * math.pi)))


def jitter_field(u, off):
    """两路独立的各向同性平滑随机场,再按 SYM 重 Z 轴旋转对称化。

    邻瓦抖得像 → 亮瓦成片而不是撒盐,这是随机场本身给的。
    **对称化是为了循环长度**:球只要在绕 Z 转 360/SYM 度后与自己重合,
    整个动画就只需要覆盖这 90°,而不是一整圈 —— 精灵图小 4 倍。
    每圈的瓦数已经量化到 4 的倍数,天生满足;差的就是抖动场这一项。
    """
    v = 0.0
    for j in range(SYM):
        a = 2 * math.pi * j / SYM
        ca, sa = math.cos(a), math.sin(a)
        r = Vector((ca * u.x - sa * u.y, sa * u.x + ca * u.y, u.z))
        for i in range(JIT_N):
            d, ph = waves[off * JIT_N + i]
            v += math.sin(JIT_K * d.dot(r) + ph)
    # 归一化用 √(SYM·JIT_N/2) 而不是 SYM·√(JIT_N/2):SYM 个旋转样本近似独立,
    # 和的标准差是 √SYM 倍而不是 SYM 倍。除错了抖动幅度会凭空少一半。
    return v / math.sqrt(SYM * JIT_N / 2.0)


bm = bmesh.new()
n_tiles = 0
for i in range(RING):
    th0 = -math.pi / 2 + math.pi * i / RING
    th1 = -math.pi / 2 + math.pi * (i + 1) / RING
    thm = 0.5 * (th0 + th1)
    # 经向瓦数随 cosθ 收缩,保持瓦片近似正方(参考图顶部瓦片没被挤成细条);
    # 量化到 4 的倍数,相邻几圈的竖缝能对齐、再整块错位 —— 参考图就是这个样子。
    n = max(8, 4 * int(round(SEG_EQ * math.cos(thm) / 4.0)))
    ph_off = rng.uniform(0, 2 * math.pi / n)        # 每圈随机相位,免得整球拉出一条直缝
    for j in range(n):
        ph0 = ph_off + 2 * math.pi * j / n
        ph1 = ph_off + 2 * math.pi * (j + 1) / n
        corners = [Vector((math.cos(t) * math.cos(q), math.cos(t) * math.sin(q), math.sin(t)))
                   for t, q in ((th0, ph0), (th0, ph1), (th1, ph1), (th1, ph0))]
        c = sum(corners, Vector()).normalized()
        quad = [(c + (v - c) * TILE_F).normalized() * R_TILE for v in corners]
        tx = Vector((0, 0, 1)).cross(c)
        tx = tx.normalized() if tx.length > 1e-6 else Vector((1, 0, 0))
        ty = c.cross(tx)
        M = (Matrix.Rotation(math.radians(JIT_DEG) * jitter_field(c, 0), 4, tx)
             @ Matrix.Rotation(math.radians(JIT_DEG) * jitter_field(c, 1), 4, ty))
        ctr = c * R_TILE
        bm.faces.new([bm.verts.new(ctr + (M @ (v - ctr))) for v in quad])
        n_tiles += 1
me = bpy.data.meshes.new("CK_orb_body")
bm.to_mesh(me); bm.free(); me.shade_flat()
body = bpy.data.objects.new("CK_orb_body", me)
sc.collection.objects.link(body)
body.data.materials.append(m_tile)

# ══ 土星环 ════════════════════════════════════════════════════════════
if RINGS_ON:
    m_ring = mat("CK_ring")
    nt = m_ring.node_tree
    o = nt.nodes.new("ShaderNodeOutputMaterial"); o.location = (600, 0)
    mix = nt.nodes.new("ShaderNodeMixShader"); mix.location = (400, 0)
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); tr.location = (200, -120)
    em = nt.nodes.new("ShaderNodeEmission"); em.location = (200, 60)
    em.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    em.inputs["Strength"].default_value = 1.25
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.location = (0, 0)
    ramp.color_ramp.elements[0].position = 0.52     # 环是一层颗粒,不是实心带
    ramp.color_ramp.elements[1].position = 0.70
    tex = nt.nodes.new("ShaderNodeTexNoise"); tex.location = (-220, 0)
    tex.inputs["Scale"].default_value = 240.0
    tex.inputs["Detail"].default_value = 2.0
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[1])
    nt.links.new(em.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], o.inputs["Surface"])

    empty = bpy.data.objects.new("CK_rings", None)
    sc.collection.objects.link(empty)
    empty.rotation_euler = (RING_TILT_X, 0.0, RING_TILT_Z)
    for k, rr in enumerate(RING_R):
        bpy.ops.mesh.primitive_torus_add(major_radius=rr, minor_radius=0.012,
                                         major_segments=96, minor_segments=4)
        ob = bpy.context.object
        ob.name = f"CK_ring{k}"
        ob.data.materials.append(m_ring)
        ob.parent = empty
        ob.visible_glossy = False       # 环不要在瓦片上反射出额外亮斑 —— 那会打乱纬度曲线

# ══ 天空:把实测纬度曲线反解成环境贴图 ════════════════════════════════
d = np.array([0.0, 0.0, 0.0]) - np.array(CAM_LOC)      # 相机 → 球
d /= np.linalg.norm(d)
up = np.array([0.0, 0.0, 1.0]); up = up - d * float(np.dot(up, d)); up /= np.linalg.norm(up)

# Blender 的等距圆柱约定是 u = −atan2(y,x)/2π + 0.5 —— **经度是反的**。
# 按「自然」写法生成会把天空前后镜像;因为相机方向 d 在 YZ 平面内、有 y 分量,
# 镜像后 β 不再守恒,整条亮带会往下挪约 17°。这个坑踩过一次,第一版球的亮斑
# 峰值落在 L=15..30° 而参考图在 30..75°,就是它。
lon = np.pi - (np.arange(SKY_W) + 0.5) / SKY_W * 2 * np.pi
lat = np.pi / 2 - (np.arange(SKY_H) + 0.5) / SKY_H * np.pi
LO, LA = np.meshgrid(lon, lat)
S = np.stack([np.cos(LA) * np.cos(LO), np.cos(LA) * np.sin(LO), np.sin(LA)], -1)
N = S - d
N /= np.linalg.norm(N, axis=-1, keepdims=True)
PSI = np.degrees(np.arcsin(np.clip(N @ up, -1, 1)))     # 这块天空照亮的法线真实仰角

# PROFILE 的自变量是**图上量到的**纬度 asin(dy/r),不是法线真实仰角。透视下
# 两者差得不小:D=6.27R 时可见的只是 ψ≤80.8° 的球冠,而它铺满整个圆盘,所以
# 图上的 L 系统性地大于 ψ(ψ=40° → L≈46°)。不换算的话曲线会整体偏一档。
_D = float(np.linalg.norm(CAM_LOC))
_pmax = math.acos(1.0 / _D)
_rmax = math.sin(_pmax) / (_D - math.cos(_pmax))
_p = np.radians(np.abs(PSI))
BETA = np.degrees(np.arcsin(np.clip((np.sin(_p) / (_D - np.cos(_p))) / _rmax, -1, 1))) * np.sign(PSI)

WT = np.cos(LA)                                         # texel 的立体角权重


def wavefield(k, n, seed):
    """各向同性的平滑随机场:一堆随机方向的平面波叠加,近似高斯。"""
    g = np.random.default_rng(seed)
    z = g.uniform(-1, 1, n); a = g.uniform(0, 2 * np.pi, n); rr = np.sqrt(1 - z * z)
    dirs = np.stack([rr * np.cos(a), rr * np.sin(a), z], -1)
    ph = g.uniform(0, 2 * np.pi, n)
    out = np.zeros((SKY_H, SKY_W))
    for i in range(n):
        out += np.sin(k * (S @ dirs[i]) + ph[i])
    return out / math.sqrt(n / 2.0)


F = wavefield(SKY_KC, SKY_NC, SEED ^ 0x5F5F) + SKY_AF * wavefield(SKY_KF, SKY_NF, SEED ^ 0xA13B)

# BETA(ψ) 在 ψmax = acos(1/D) = 80.8° 处折返:更大的 ψ 照的是球的**背面**,透视下
# 看不见,却会被折算回同一个可见纬度箱。混进来的话分位数挑中哪一半全凭运气,
# 那条带的实测值会在两个值之间跳。所以背面那一支直接判黑。
VIS = (N @ (-d)) >= 1.0 / _D


def cover(b):
    if b <= PROFILE[0][0]:
        return PROFILE[0][1]
    for i in range(1, len(PROFILE)):
        if b <= PROFILE[i][0]:
            (a0, c0), (a1, c1) = PROFILE[i - 1], PROFILE[i]
            return c0 + (c1 - c0) * (b - a0) / (a1 - a0)
    return PROFILE[-1][1]


# 分位数按**立体角**加权,不能按像素个数:等距圆柱贴图天顶附近每立体角的像素
# 是赤道的 1/cos(lat) 倍,而 BETA≈52° 那条带对应的天空正好跨过天顶。按像素数
# 取分位会挑走一堆极区细条,实际立体角占比远低于目标 —— 那条带会持续偏暗。
MASK = np.zeros((SKY_H, SKY_W))
NBIN = 72
bidx = np.clip(((BETA + 90) / 180 * NBIN).astype(int), 0, NBIN - 1)
for b in range(NBIN):
    sel = (bidx == b) & VIS
    if not sel.any():
        continue
    c = cover(-90 + (b + 0.5) / NBIN * 180)
    if c <= 0:
        continue
    f = F[sel]; w = WT[sel]
    order = np.argsort(f)
    cw = np.cumsum(w[order])
    k = int(np.searchsorted(cw, (1.0 - min(c, 1.0)) * cw[-1]))
    MASK[sel] = (f > f[order][min(k, len(order) - 1)]).astype(float)

px = np.zeros((SKY_H, SKY_W, 4), np.float32)
px[..., :3] = (MASK * SKY_E)[..., None]
px[..., 3] = 1.0
img = bpy.data.images.get("CK_sky")
if img:
    bpy.data.images.remove(img)
img = bpy.data.images.new("CK_sky", SKY_W, SKY_H, alpha=True, float_buffer=True)
img.pixels.foreach_set(px[::-1].ravel())       # Blender 图像原点在左下
img.filepath_raw = SKY
img.file_format = "OPEN_EXR"
img.save()

w = bpy.data.worlds.get("CK_world") or bpy.data.worlds.new("CK_world")
sc.world = w
w.use_nodes = True
nt = w.node_tree
nt.nodes.clear()
o = nt.nodes.new("ShaderNodeOutputWorld"); o.location = (400, 0)
bg = nt.nodes.new("ShaderNodeBackground"); bg.location = (180, 0)
env = nt.nodes.new("ShaderNodeTexEnvironment"); env.location = (-140, 0)
env.image = img
env.interpolation = "Closest"                  # 亮斑边界要硬,插值会把 0/1 抹成灰
nt.links.new(env.outputs["Color"], bg.inputs["Color"])
nt.links.new(bg.outputs["Background"], o.inputs["Surface"])

# ══ 相机 ══════════════════════════════════════════════════════════════
cd = bpy.data.cameras.new("CK_cam")
cd.lens = CAM_LENS
cam = bpy.data.objects.new("CK_cam", cd)
sc.collection.objects.link(cam)
cam.location = CAM_LOC
# 对准球心。上一版是手填的欧拉角,差了 0.7°,球在画面里偏下 24px。
cam.rotation_euler = (math.pi / 2 - math.atan2(CAM_LOC[2], math.hypot(CAM_LOC[0], CAM_LOC[1])),
                      0.0, math.atan2(CAM_LOC[0], -CAM_LOC[1]))
sc.camera = cam

# ══ 渲染设置 ══════════════════════════════════════════════════════════
sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for dev in prefs.devices:
        dev.use = True
    sc.cycles.device = "GPU"
except Exception:
    pass
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = RES
sc.render.resolution_percentage = 100
sc.render.film_transparent = True              # 天空只参与反射,不入镜
sc.view_settings.view_transform = "Standard"   # 不要 AgX/Filmic —— 后面要按绝对亮度抖动
sc.view_settings.look = "None"
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.frame_start, sc.frame_end = 1, LOOP_N

# ══ 自转:LOOP_N 帧转过 360/SYM 度,天生无缝 ═══════════════════════════
# 亮斑由天空决定、留在原地,瓦片从底下扫过 —— 真迪斯科球就是这个行为。
#
# 为什么不是整圈:球被做成 SYM 重对称(每圈瓦数是 SYM 的倍数、抖动场对称化),
# 转过 360/SYM 就与自己完全重合,所以循环只需要这一段。
# 帧数下界由**马车轮效应**定:瓦的经向间距 6.43°,每帧转角必须明显小于它,
# 否则图案每帧刚好挪一格,看起来会静止甚至倒转。48 帧 → 1.875°/帧 ≈ 0.29 格。
bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
body.animation_data_clear()
for f, ang in ((1, 0.0), (LOOP_N + 1, 2 * math.pi / SYM)):
    body.rotation_euler = (0.0, 0.0, ang)
    body.keyframe_insert("rotation_euler", frame=f)
for fc in body.animation_data.action.layers[0].strips[0].channelbag(
        body.animation_data.action.slots[0]).fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print(f"orb-build: tiles={n_tiles} sky={SKY} blend={BLEND}")
