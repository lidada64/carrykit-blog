"use client";

// Adapted from lidada64/ai-travel-assistant frontend/src/components/DiscoOrb.vue (81afe22).
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const vertexShader = `
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vUv = uv;
        vPos = position;

        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;

        gl_Position = projectionMatrix * mvPosition;
      }
    `;
const fragmentShader = `
      uniform vec3 colorLight;
      uniform vec3 colorDark;
      uniform vec3 colorRim;
      uniform vec3 colorLine;
      uniform float time;

      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      // 伪随机
      float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
      }

      void main() {
        vec3 norm = normalize(vPos);

        // [修改] 移除了之前的 noise distortion 计算，让经纬线保持平直
        float theta = atan(norm.z, norm.x);
        float phi = acos(norm.y);

        float tilesH = 25.0;
        float tilesV = 16.0;

        float globalH = (theta + 3.14159) / 6.28318 * tilesH * 2.0;
        float globalV = phi / 3.14159 * tilesV * 2.0;

        float checkH = floor(globalH);
        float checkV = floor(globalV);
        vec2 tileUV = vec2(fract(globalH), fract(globalV));

        // --- 1. 白线 (Gap) ---
        float gapSize = 0.06;
        float lineMask = smoothstep(0.0, gapSize, tileUV.x) * (1.0 - smoothstep(1.0 - gapSize, 1.0, tileUV.x)) *
                         smoothstep(0.0, gapSize, tileUV.y) * (1.0 - smoothstep(1.0 - gapSize, 1.0, tileUV.y));

        // --- 2. 倒角/景深 (Bevel) ---
        float bevel = pow(tileUV.x * (1.0 - tileUV.x) * tileUV.y * (1.0 - tileUV.y), 0.25);
        bevel *= 1.8;

        // --- 3. 黑白逻辑 & 极地杂点 ---
        vec2 tileID = vec2(checkH, checkV);
        float tileRnd = random(tileID);

        // 基础概率：20% 白格
        float isLight = step(0.8, tileRnd);

        // 极地杂色逻辑
        float distFromEquator = abs(phi - 1.57079) / 1.57079;
        float noiseProb = smoothstep(0.5, 1.0, distFromEquator) * 0.4;
        float dirtRnd = random(tileID + vec2(10.0));

        if (dirtRnd < noiseProb) {
            isLight = 1.0 - isLight;
        }

        // --- 4. 颜色合成 ---
        vec3 tileColor = mix(colorDark, colorLight, isLight);

        // 叠加倒角
        tileColor *= bevel;

        // 增强噪点 (Heavy Grain) - 保持之前的强度
        float grain = random(vPos.xy * 300.0 + time * 0.1);
        tileColor *= (0.6 + 0.4 * grain);

        // --- 5. 绘制白线 ---
        vec3 lineColor = colorLine;
        vec3 finalBase = mix(lineColor, tileColor, lineMask);

        // --- 6. 边缘光 ---
        vec3 viewDir = normalize(vViewPosition);
        vec3 normal = normalize(vNormal);
        float fresnel = 1.0 - dot(viewDir, normal);
        fresnel = pow(clamp(fresnel, 0.0, 1.0), 3.0);

        vec3 finalColor = finalBase + colorRim * fresnel * 0.5;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

export default function DiscoOrb({ active }: { active: boolean }) {
  const container = useRef<HTMLSpanElement>(null);
  const activeRef = useRef(active);
  const redraw = useRef<() => void>(() => {});
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const styles = getComputedStyle(document.documentElement);
    const color = (name: string) => new THREE.Color(styles.getPropertyValue(name).trim());
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 115);
    const geometry = new THREE.IcosahedronGeometry(22, 5);
    const material = new THREE.ShaderMaterial({ uniforms: {
      time: { value: 0 }, colorLight: { value: color("--orb-light") },
      colorDark: { value: color("--orb-dark") }, colorRim: { value: color("--orb-rim") }, colorLine: { value: color("--orb-line") },
    }, vertexShader, fragmentShader });
    const sphere = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.rotation.set(Math.PI / 12, 0, Math.PI / 20);
    group.add(sphere); scene.add(group);
    const count = 20000;
    const positions = new Float32Array(count * 3);
    const orbits = Array.from({ length: count }, () => {
      const radius = THREE.MathUtils.randFloat(28, 50);
      return { radius, theta: Math.random() * Math.PI * 2, speed: 50 / Math.pow(radius, 1.5), y: (Math.random() - 0.5) };
    });
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const ringMaterial = new THREE.PointsMaterial({ color: color("--orb-ring"), size: 0.2, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const ring = new THREE.Points(ringGeometry, ringMaterial);
    ring.rotation.set(Math.PI / 12, 0, Math.PI / 20); scene.add(ring);
    const tetherGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 22, 0), new THREE.Vector3(0, 100, 0)]);
    const tetherMaterial = new THREE.LineBasicMaterial({ color: color("--orb-tether"), transparent: true, opacity: 0.3 });
    scene.add(new THREE.Line(tetherGeometry, tetherMaterial));
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.9, 0.35);
    const filmPass = new ShaderPass({
    uniforms: {
      "tDiffuse": { value: null },
      "time": { value: 0.0 },
      "nIntensity": { value: 0.25 }, // 保持增强的噪点强度
      "sIntensity": { value: 0.05 },
      "grayscale": { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float nIntensity;
      uniform float sIntensity;
      uniform float grayscale;
      uniform sampler2D tDiffuse;
      varying vec2 vUv;

      void main() {
        vec4 cTextureScreen = texture2D( tDiffuse, vUv );
        float x = vUv.x * vUv.y * time * 1000.0;
        x = mod( x, 13.0 ) * mod( x, 123.0 );
        float dx = mod( x, 0.01 );
        vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp( 0.1 + dx * 100.0, 0.0, 1.0 );
        vec2 sc = vec2( sin( vUv.y * 4096.0 ), cos( vUv.y * 4096.0 ) );
        cResult += cTextureScreen.rgb * vec3( sc.x, sc.y, sc.x ) * sIntensity;
        cResult = cTextureScreen.rgb + clamp(nIntensity, 0.0,1.0) * (cResult - cTextureScreen.rgb);
        vec3 gray = vec3(dot(cResult, vec3(0.299, 0.587, 0.114)));
        cResult = mix(cResult, gray, 0.5);
        gl_FragColor =  vec4( cResult, cTextureScreen.a );
      }
    `
    });
    // Bloom's additive pass fills the alpha channel. Recover scene coverage and
    // retain the luminous halo outside it, then composite onto the entry token.
    const sceneTarget = new THREE.WebGLRenderTarget(1, 1);
    const composite = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, sceneTexture: { value: null }, background: { value: new THREE.Color().setStyle(styles.getPropertyValue("--assistant-entry-background").trim(), THREE.LinearSRGBColorSpace) } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D sceneTexture; uniform vec3 background; varying vec2 vUv;
        void main() { vec4 lit = texture2D(tDiffuse, vUv); vec4 base = texture2D(sceneTexture, vUv);
          float glow = max(max(lit.r - base.r, lit.g - base.g), lit.b - base.b);
          float alpha = clamp(max(base.a, glow), 0.0, 1.0);
          gl_FragColor = vec4(mix(background, lit.rgb, alpha), 1.0); }`,
    });
    composite.uniforms.sceneTexture.value = sceneTarget.texture;
    composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(filmPass); composer.addPass(composite);
    let frame = 0; let visible = true; let last = 0; let ringScale = 1;
    let lastWidth = 0; let lastHeight = 0;
    const resize = () => {
      const width = el.clientWidth || 128; const height = el.clientHeight || 80;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width; lastHeight = height;
      camera.aspect = width / height; camera.updateProjectionMatrix();
      renderer.setSize(width, height); composer.setSize(width, height);
      sceneTarget.setSize(Math.floor(width * renderer.getPixelRatio()), Math.floor(height * renderer.getPixelRatio()));
    };
    const render = (now: number) => {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      const running = activeRef.current;
      sphere.rotation.y += reduced.matches ? 0 : dt * 0.1;
      material.uniforms.time.value = now * 0.001;
      ringScale = reduced.matches ? (running ? 1.35 : 1) : ringScale + ((running ? 1.35 : 1) - ringScale) * 0.08;
      ring.scale.setScalar(ringScale);
      ringMaterial.opacity = reduced.matches ? (running ? 0.85 : 0.5) : ringMaterial.opacity + ((running ? 0.85 : 0.5) - ringMaterial.opacity) * 0.1;
      bloom.strength = reduced.matches ? (running ? 0.95 : 0.3) : bloom.strength + ((running ? 0.95 : 0.3) - bloom.strength) * 0.08;
      const attr = ringGeometry.getAttribute("position") as THREE.BufferAttribute;
      orbits.forEach((orbit, i) => {
        if (!reduced.matches) orbit.theta += orbit.speed * 0.005 * (running ? 2.4 : 1);
        attr.setXYZ(i, orbit.radius * Math.cos(orbit.theta), orbit.y, orbit.radius * Math.sin(orbit.theta));
      });
      attr.needsUpdate = true;
      if (!reduced.matches) ring.rotation.y += dt * (running ? 1.35 : 0.35);
      renderer.setRenderTarget(sceneTarget); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
      filmPass.uniforms.time.value = now * 0.001;
      composer.render();
      if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(render);
    };
    const start = () => { if (!frame && visible && !document.hidden) { last = 0; frame = requestAnimationFrame(render); } };
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; if (visible) start(); else { cancelAnimationFrame(frame); frame = 0; } });
    const resizeObserver = new ResizeObserver(() => { resize(); if (reduced.matches) start(); });
    const refresh = () => { if (document.hidden || reduced.matches) { cancelAnimationFrame(frame); frame = 0; } start(); };
    redraw.current = start;
    observer.observe(el); resizeObserver.observe(el); document.addEventListener("visibilitychange", refresh); reduced.addEventListener("change", refresh);
    resize(); start();
    return () => {
      redraw.current = () => {};
      cancelAnimationFrame(frame); observer.disconnect(); resizeObserver.disconnect(); document.removeEventListener("visibilitychange", refresh); reduced.removeEventListener("change", refresh);
      geometry.dispose(); material.dispose(); ringGeometry.dispose(); ringMaterial.dispose(); tetherGeometry.dispose(); tetherMaterial.dispose(); bloom.dispose(); filmPass.dispose(); composite.dispose(); sceneTarget.dispose(); composer.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    // Reduced-motion scenes render on state change without a continuous animation loop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) redraw.current();
  }, [active]);
  return <span ref={container} aria-hidden="true" className="block h-full w-full overflow-hidden" />;
}
