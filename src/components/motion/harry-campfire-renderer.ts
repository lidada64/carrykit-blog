const vertexSource = `
attribute vec2 position;
varying vec2 vUv;
void main() { vUv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }
`;
const fragmentSource = `
precision mediump float;
uniform sampler2D atlas;
uniform float frame;
uniform float original;
uniform vec3 ink;
uniform vec3 paper;
varying vec2 vUv;
float bayer2(vec2 p) { vec2 a=mod(floor(p),2.); return 2.*a.x+3.*a.y-4.*a.x*a.y; }
void main() {
  vec2 tile=vec2(mod(frame,4.),2.-floor(frame/4.));
  vec2 sampleUv=(tile+clamp(vUv,vec2(.001),vec2(.999)))/vec2(4.,3.);
  vec4 color=texture2D(atlas,sampleUv);
  float lum=smoothstep(.045,.82,dot(color.rgb,vec3(.299,.587,.114)));
  vec2 p=floor(gl_FragCoord.xy/1.5);
  float threshold=(16.*bayer2(p)+4.*bayer2(p/2.)+bayer2(p/4.)+.5)/64.;
  vec3 monochrome=mix(ink,paper,step(threshold,lum));
  gl_FragColor=vec4(mix(monochrome,color.rgb,original),color.a);
}
`;

export interface CampfireRenderer {
  draw: (frame: number, original: boolean) => void;
  dispose: () => void;
}

function rgb(token: string): [number, number, number] {
  const hex = token.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error("Invalid scene palette token");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export async function createCampfireRenderer(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
): Promise<CampfireRenderer> {
  const response = await fetch("/harry-campfire/loop.webp", { signal });
  if (!response.ok) throw new Error("Campfire asset could not load");
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: "flipY", premultiplyAlpha: "none" });
  if (signal.aborted) { bitmap.close(); throw new DOMException("Aborted", "AbortError"); }
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false });
  if (!gl) { bitmap.close(); throw new Error("WebGL unavailable"); }
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  const dispose = () => {
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteTexture(texture);
  };
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Shader allocation failed");
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compilation failed");
    }
    program = gl.createProgram();
    if (!program) throw new Error("Program allocation failed");
    shaders.forEach((shader) => gl.attachShader(program!, shader)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Program link failed");
    gl.useProgram(program);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    bitmap.close();
    const frameUniform = gl.getUniformLocation(program, "frame");
    const originalUniform = gl.getUniformLocation(program, "original");
    const inkUniform = gl.getUniformLocation(program, "ink");
    const paperUniform = gl.getUniformLocation(program, "paper");
    let lastFrame = -1, lastOriginal = false, dirty = true;
    const observer = new MutationObserver(() => { dirty = true; });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
    const resize = new ResizeObserver(() => { dirty = true; }); resize.observe(canvas);
    return {
      draw(frame, original) {
        if (frame === lastFrame && original === lastOriginal && !dirty) return;
        const rect = canvas.getBoundingClientRect();
        const scale = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(rect.width * scale)), height = Math.max(1, Math.round(rect.height * scale));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        gl.viewport(0, 0, width, height);
        const styles = getComputedStyle(canvas);
        gl.uniform3fv(inkUniform, rgb(styles.getPropertyValue("--water-ink")));
        gl.uniform3fv(paperUniform, rgb(styles.getPropertyValue("--water-paper")));
        gl.uniform1f(frameUniform, frame); gl.uniform1f(originalUniform, original ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        lastFrame = frame; lastOriginal = original; dirty = false;
      },
      dispose() { observer.disconnect(); resize.disconnect(); dispose(); },
    };
  } catch (error) { bitmap.close(); dispose(); throw error; }
}
