
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;   // uv 0..1 (y 从顶算)
uniform float uMouseOn;
uniform float uSpeed;
uniform float uPixel;  // 抖动单元(设备物理 px)
uniform float uBright;
uniform float uContrast;
uniform float uGlint;
uniform float uWarp;      // 域扭曲强度
uniform float uFlowBend;  // flow 对波脊相位的扰动
uniform float uAngle;     // 流向角(弧度):0=横波脊竖直滚,π/2=竖波峰横推
uniform float uCalmTop;   // 顶部静止带高度(设备px):带内水面渐隐为静止纯背景
uniform vec3 uInk;
uniform vec3 uPaper;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }

// 流水高度场:域扭曲 + 定向平流的「横向波脊」(带符号,谷负脊正)。
// 不再用中灰 fbm 噪声当水面——那会被抖动打成满屏网点(纸碎屑)。
float height(vec2 q){
  float t = uTime * uSpeed;
  float aspect = uRes.x / uRes.y;
  // 流向参考系:把坐标旋 uAngle,波脊/平流/各向异性一起转。angle=0 →
  // 横波脊竖直滚(原观感);angle=π/2 → 竖波峰横推。无级过渡。
  float ca = cos(uAngle), sa = sin(uAngle);
  vec2 qr = mat2(ca, sa, -sa, ca) * q;
  // 双层迭代域扭曲(在流向参考系里做):低频大涡把波脊整体推弯,再喂进
  // 高频细涡卷出湍流,让波脊成流、成漩,而不是笔直线。
  vec2 warp1 = vec2(fbm(qr * 1.2 + vec2(t * 0.10, 0.0)),
                    fbm(qr * 1.2 + vec2(0.0, t * 0.08) + 5.2));
  vec2 warp2 = vec2(fbm(qr * 3.2 + 1.8 * warp1 + vec2(0.0, t * 0.16)),
                    fbm(qr * 3.2 + 1.8 * warp1 + vec2(t * 0.14, 0.0) + 9.1));
  qr += uWarp * (0.42 * warp1 + 0.22 * warp2);
  // 流纹:sine 波脊沿 qr.y 排布,随时间向前推(定向平流)。
  // flow 对相位的扰动越大(uFlowBend),波脊越被流场揉碎、越有机。
  float flow = fbm(qr * vec2(1.1, 3.6) + vec2(t * 0.45, t * 0.12));
  float h  = sin((qr.y * 8.5 + flow * 11.0 * uFlowBend) - t * 1.05);
  h += 0.5 * sin((qr.y * 16.0 + flow * 7.0 * uFlowBend) + t * 0.70);
  // 鼠标涟漪:留在原始 q 空间(径向,与旋转无关),锚在光标下不跟着转
  vec2 mp = vec2(uMouse.x * aspect, uMouse.y);
  float d = distance(q, mp);
  h += uMouseOn * sin(d * 30.0 - uTime * 6.0) * exp(-d * 7.0) * 1.1;
  return h;   // ~ -1.5..1.5
}

void main(){
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); // y 从顶算
  vec2 uv = frag / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * uSpeed;

  // 从高度场取法线(前向差分)
  float e = 0.0016;
  float hC = height(p);
  float hR = height(p + vec2(e, 0.0));
  float hU = height(p + vec2(0.0, e));
  vec3 n = normalize(vec3(hC - hR, hC - hU, e * 3.0));

  // 镜面高光:锐反光集中在波脊,当"闪"点缀而非满屏白点
  vec3 L = normalize(vec3(-0.3, -0.5, 0.78));
  float spec = pow(max(dot(n, L), 0.0), 30.0);

  // 反射亮带:波脊(hC 高)= 亮反光,波谷 = 暗水。高对比让抖动落成
  // 「流动的亮带 / 暗水」,而不是满屏中灰噪点(纸碎屑的根源)。
  float band = smoothstep(0.10, 0.95, hC);
  // 顶部静止带:calm 在 [uCalmTop, 2·uCalmTop] 内由 0→1。带内把随时间变化的
  // 动态量(亮带/高光)渐隐,只剩静止的平背景色(lum=0.10),不干扰导航文字。
  float calm = uCalmTop > 0.0 ? smoothstep(uCalmTop, uCalmTop * 2.0, frag.y) : 1.0;
  float lum = 0.10 + calm * (0.44 * band + uGlint * spec * 0.5);
  lum = (lum - 0.5) * uContrast + 0.5 + (uBright - 1.0);
  lum = clamp(lum, 0.0, 1.0);

  float th = bayer8(floor(frag / uPixel));
  float bw = step(th, lum);
  gl_FragColor = vec4(mix(uInk, uPaper, bw), 1.0);
}
