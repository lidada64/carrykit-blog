import { motionTokens } from "./tokens";
import { hangingMotion, multiplyMatrices, projectPoint, stageProgress, suspensionMatrix } from "./campfire-transition";

/** Blender vertices: position, normal, UV, color, three shape key deltas. */
interface Material {
  name: string;
  color: number[]; kind: number; texture: string | null; mask: string | null;
  emission: string | null; emissionStrength?: number; emissionColor?: number[];
  metallic?: number; roughness?: number; bakedRoughness?: boolean;
}
interface Mesh {
  name: string; material: number; offset: number; count: number; vertexCount: number; indexOffset: number;
  matrices?: number[][]; weights?: number[][];
}
interface Scene {
  props?: { id: "blog" | "work" | "radar"; bounds: number[][] }[];
  orb: { center: number[]; radius: number };
  frames: number; fps: number; duration: number; materials: Material[]; meshes: Mesh[];
  lightEnergy: number[];
  environment: string;
  environmentRange: number; environmentStrength: number;
  firePosition: number[];
  camera: { target: number[]; yaw: number; pitch: number; distance: number };
}
export interface CampfireRenderer {
  propTargets: () => { id: "blog" | "work" | "radar"; x: number; y: number; width: number; height: number; visible: boolean }[];
  setActiveProp: (id: string | null) => void;
  setPresentation: (brightness: number, density: number, progress: number) => void;
  suspensionPoint: () => { x: number; y: number };
  setView: (view: { yaw: number; pitch: number; distance: number; target: readonly number[] }) => void;
  draw: (seconds: number, original: boolean) => void;
  rotate: (x: number, y: number) => void;
  zoom: (delta: number) => void;
  reset: () => void;
  dispose: () => void;
}
// Keep the previous mirror treatment available while trying the matte finish.
const matteOrb = true;
const vertexSource = `
attribute vec3 position,normal,wave1,wave2,wave3;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 model,viewProjection;
uniform vec3 weights,firePosition;
uniform float kind,smokeHeight;
uniform float outlineWidth;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vPosition,vNormal,vLocal;
void main() {
  vec3 p=position+wave1*weights.x+wave2*weights.y+wave3*weights.z;
  vec4 world=model*vec4(p,1.);
  // Extend only the smoke above its source; fire and figure keep their scale.
  if(kind==2.) world.z+=max(0.,world.z-firePosition.z)*(smokeHeight-1.);
  world.xyz+=normalize(mat3(model)*normal)*outlineWidth;
  vPosition=world.xyz; vLocal=p; vNormal=normalize(mat3(model)*normal);
  vUv=uv; vColor=color; gl_Position=viewProjection*world;
}`;
const fragmentSource = `
precision highp float;
uniform sampler2D diffuse,mask,emission,environment,sceneReflection,blueNoise;
uniform samplerCube fireShadow;
uniform vec4 baseColor;
uniform vec3 emissionColor,ink,paper,eye,firePosition;
uniform vec3 orbCenter;
uniform float emissionStrength,hasEmission,kind,seconds,flicker,original;
uniform float metallic,roughness,bakedRoughness,environmentRange,environmentStrength;
uniform float reflectionPass;
uniform float pixelRatio;
uniform float orbBrightness,orbGrain,orbLight;
uniform float faceMaterial;
uniform float activeProp;
uniform float propMaterial;
uniform float outlineDraw;
uniform mat4 reflectionViewProjection;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vPosition,vNormal,vLocal;
float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float noise(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec4 blurredReflection(vec2 coord,float surfaceRoughness) {
  // Filter radiance/coverage together through the reflection's mip chain.
  // This softens the image inside each mirror without blurring tile geometry.
  return texture2D(sceneReflection,coord,mix(2.,3.5,smoothstep(.10,.17,surfaceRoughness)));
}
vec3 standardColor(vec3 c) {
  return mix(12.92*c,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));
}
float orderedThreshold(vec2 p) {
  vec2 a=mod(floor(p),2.),b=mod(floor(p/2.),2.);
  float small=2.*a.x+3.*a.y-4.*a.x*a.y;
  float large=2.*b.x+3.*b.y-4.*b.x*b.y;
  return (4.*small+large+.5)/16.;
}
float visibility(vec3 p,vec3 n);
float figureLight(vec3 n,vec3 v,vec3 texColor) {
  vec3 fire=firePosition-vPosition;
  float sky=max(dot(n,normalize(vec3(-3.,-4.,6.))),0.);
  float warm=max(dot(n,normalize(fire)),0.)*visibility(vPosition,n)/(1.+dot(fire,fire)*.28);
  // Material detail is subordinate to lighting: a dark jacket still has a lit face.
  float detail=(dot(texColor,vec3(.2126,.7152,.0722))-.4)*.12;
  // The fire is the key light; broad fill must never outshine its facing surfaces.
  float illumination=.16+sky*.12+max(n.z,0.)*.06+warm*1.8+detail;
  float tone=smoothstep(.28,.60,illumination);
  // Skin needs a broad response: the old .18 albedo cutoff whitened almost
  // every face texel, erasing the painted sockets, nose and beard.
  float albedo=dot(texColor,vec3(.2126,.7152,.0722));
  float skinLight=.18+sky*.08+max(n.z,0.)*.04+warm*1.25;
  float skinTone=smoothstep(.12,.80,skinLight)*mix(.12,1.,smoothstep(.05,.62,albedo));
  tone=mix(tone,skinTone,faceMaterial);
  // Thin grazing highlight separates the unlit silhouette from the background.
  float rim=1.-smoothstep(.05,.13,abs(dot(n,v)));
  return max(tone,rim*mix(.55,.14,faceMaterial));
}
vec3 environmentLight(vec3 r) {
  vec2 coord=vec2(.5-atan(r.y,r.x)/6.2831853,.5+asin(clamp(r.z,-1.,1.))/3.1415927);
  vec4 encoded=texture2D(environment,coord);
  return encoded.rgb*encoded.a*environmentRange*environmentStrength;
}
float visibility(vec3 p,vec3 n) {
  vec3 ray=p+n*.014-firePosition;
  float distance=length(ray), lit=0.;
  vec3 t=normalize(cross(normalize(ray),vec3(.01,.02,1.)))*.012*distance;
  vec3 b=normalize(cross(ray,t))*.012*distance;
  for(int i=0;i<4;i++) {
    vec3 offset=(i==0?t:(i==1?-t:(i==2?b:-b)));
    vec4 depthEncoding=textureCube(fireShadow,ray+offset);
    float depth=dot(depthEncoding.rgb,vec3(1.,1./255.,1./65025.))*16.;
    lit+=step(distance-.025,depth);
  }
  return lit*.25;
}
// Cook-Torrance GGX: source metal/roughness, linear radiance and energy conservation.
vec3 directLight(vec3 albedo,vec3 n,vec3 v,vec3 l,vec3 radiance,float metal,float rough) {
  vec3 h=normalize(v+l);
  float nv=max(dot(n,v),.001), nl=max(dot(n,l),0.), nh=max(dot(n,h),0.);
  float alpha=max(rough*rough,.002), a2=alpha*alpha;
  float d=a2/(3.1415927*pow(nh*nh*(a2-1.)+1.,2.));
  float k=pow(rough+1.,2.)/8.;
  float g=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);
  vec3 f0=mix(vec3(.04),albedo,metal);
  vec3 f=f0+(1.-f0)*pow(1.-max(dot(h,v),0.),5.);
  return ((1.-f)*(1.-metal)*albedo/3.1415927+d*g*f/max(4.*nv*nl,.001))*radiance*nl;
}
vec3 toneMap(vec3 c) {
  return pow(clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.),vec3(1./2.2));
}
void main() {
  if(outlineDraw>.5) {gl_FragColor=vec4(mix(ink,paper,activeProp),1.);return;}
  vec4 tex=texture2D(diffuse,vUv);
  vec3 c=tex.rgb*baseColor.rgb*vColor.rgb;
  // Solid Unity textures use alpha for smoothness, rather than transparency.
  float a=(kind==0.||kind>=4.)?baseColor.a:tex.a*baseColor.a;
  float flameTone=1.;
  if(kind==1.) {
    vec2 flowing=vUv-vec2(0.,seconds*1.13);
    float n=.7*noise(vec3(flowing*3.5,seconds*.75))+.3*noise(vec3(flowing*7.,seconds*1.5));
    a*=smoothstep(.25,.60,n)*(.65+.35*texture2D(mask,flowing).a);
    c=pow(c,vec3(2.2))*vec3(5.,2.3,.35);
    if(original<.5) {flameTone=step(.24,a);a=step(.12,a);c=vec3(1.);}
  } else if(kind==2.) {
    vec2 flowing=vUv-vec2(0.,seconds*.32);
    a*=texture2D(mask,flowing).a*noise(vec3(flowing*3.5,seconds*.75))*.20;
    a*=1.-smoothstep(.65,1.,vUv.y);
    c=baseColor.rgb*.35;
    if(original<.5) {
      if(a<.022||hash(floor((vPosition-vec3(0.,0.,seconds*.30))*45.))>.035) discard;
      a=1.;c=vec3(1.);
    }
  } else if(kind==3.) {
    float h=clamp((vLocal.z-.095)/1.35,0.,1.);
    float density=max(0.,noise(vLocal*3.5-vec3(0,0,seconds*.7))-.30)*(1.-h);
    a=density*.22; c=1.-exp(-baseColor.rgb*density*14.);
    if(original<.5) discard;
  } else if(kind==5.) {
    vec3 fire=firePosition-vPosition;
    float light=.08+.7*max(dot(normalize(vNormal),normalize(fire)),0.)*flicker/max(dot(fire,fire),.3);
    c=mix(vec3(0.),baseColor.rgb*light*.45,original)+vec3(orbLight*.018);
  } else if(kind==4.&&${matteOrb ? "true" : "false"}) {
    // Smooth radial lighting removes the tile-normal patchwork; the actual
    // recessed geometry still supplies the grid, without painting new stripes.
    vec3 n=normalize(vPosition-orbCenter),fire=firePosition-vPosition;
    float sky=max(dot(n,normalize(vec3(-3.,-4.,6.))),0.);
    float warm=max(dot(n,normalize(fire)),0.)*visibility(vPosition,n)
      /(1.+dot(fire,fire)*.28);
    if(original<.5) {
      c=vec3(.025+.065*sky+.035*max(n.z,0.)+.12*warm);
    } else {
      vec3 albedo=pow(max(baseColor.rgb,vec3(0.)),vec3(2.2));
      c=albedo*(vec3(.07+.18*sky+.06*max(n.z,0.))
        +vec3(1.,.40,.105)*warm*.65*flicker);
    }
    c=c*orbBrightness+vec3(orbLight*(.015+.45*sky));
  } else {
    vec3 albedo=pow(max(c,vec3(0.)),vec3(2.2));
    vec3 n=normalize(vNormal),v=normalize(eye-vPosition),fire=firePosition-vPosition;
    float metal=kind==4.?1.:metallic;
    float surfaceRoughness=kind==4.?.14:max(mix(roughness,vColor.a,bakedRoughness),.045);
    vec3 radiance=vec3(1.,.40,.105)*5.*flicker/max(dot(fire,fire),.12);
    c=directLight(albedo,n,v,normalize(fire),radiance,metal,surfaceRoughness)*visibility(vPosition,n);
    // A dim broad sky fill keeps the unlit side legible without whitening the orb.
    c+=directLight(albedo,n,v,normalize(vec3(-3.,-4.,6.)),vec3(.10,.14,.20),metal,surfaceRoughness);
    vec3 reflection=reflect(-v,n);
    vec3 f0=mix(vec3(.04),albedo,metal);
    vec3 fresnel=f0+(1.-f0)*pow(1.-max(dot(n,v),0.),5.);
    vec3 reflectedEnvironment=environmentLight(reflection)*fresnel*(kind==4.?.12:1.);
    if(kind==4.&&reflectionPass<.5&&original>.5) {
      // The enlarged cap is nearly flat: a tangent-plane reflection adds the
      // actual figure/fire above it, with the source tilted normals perturbing it.
      vec4 projection=reflectionViewProjection*vec4(vPosition,1.);
      vec2 coord=projection.xy/projection.w*.5+.5+n.xy*.025;
      vec4 reflectedScene=blurredReflection(coord,surfaceRoughness);
      float inside=step(0.,coord.x)*step(coord.x,1.)*step(0.,coord.y)*step(coord.y,1.);
      c+=reflectedScene.rgb*fresnel*inside*.18;
      reflectedEnvironment*=1.-reflectedScene.a*inside;
    }
    c+=reflectedEnvironment;
    c+=albedo*(1.-metal)*(.018+.022*max(n.z,0.));
    // Broad neutral bounce preserves the small props' painted surface details.
    c+=albedo*propMaterial*(.24+.22*max(dot(n,normalize(vec3(-3.,-4.,6.))),0.));
    // Dark mirrors retain a narrow fire reflection against the subdued environment.
    if(kind==4.) {
      float glint=pow(max(dot(reflection,normalize(fire)),0.),mix(180.,28.,smoothstep(.045,.28,surfaceRoughness)));
      c+=albedo*vec3(1.,.36,.06)*glint*.65*flicker/max(dot(fire,fire),.3)*visibility(vPosition,n);
    }
    c+=mix(emissionColor,pow(texture2D(emission,vUv).rgb,vec3(2.2)),hasEmission)*emissionStrength;
    if(kind==4.&&original<.5) {
      // Keep the dark body continuous; sparse directional highlights define the mirrors.
      float sky=max(dot(n,normalize(vec3(-3.,-4.,6.))),0.);
      float warm=max(dot(n,normalize(fire)),0.)*visibility(vPosition,n)/(1.+dot(fire,fire)*.28);
      vec3 env=environmentLight(reflection)/max(environmentStrength,.0001);
      float detail=dot(env,vec3(.2126,.7152,.0722));
      detail=detail/(1.+detail);
      float glint=pow(max(dot(reflection,normalize(fire)),0.),120.)
        *visibility(vPosition,n)*flicker/(1.+dot(fire,fire)*.28);
      float rim=pow(1.-max(dot(n,v),0.),5.);
      c=vec3(.003+.012*sky+.008*max(n.z,0.)+.018*warm+.008*detail+.7*glint+.025*rim);
    }
  }
  if(a<.005) discard;
  if(reflectionPass>.5) {gl_FragColor=vec4(clamp(c,0.,1.),a);return;}
  if(original<.5&&kind<4.) {
    float tone=kind==1.?flameTone:1.;
    if(kind==0.) {
      tone=figureLight(normalize(vNormal),normalize(eye-vPosition),tex.rgb*baseColor.rgb*vColor.rgb);
      if(propMaterial>.5) {
        float detail=smoothstep(.025,.65,dot(tex.rgb,vec3(.2126,.7152,.0722)));
        float fill=.68+.32*max(dot(normalize(vNormal),normalize(vec3(-3.,-4.,6.))),0.);
        tone=clamp((.08+.82*detail)*fill,0.,1.);
      }
      if(emissionStrength>.1) tone=1.;
    }
    // Subtle aerial perspective happens BEFORE the two-color quantizer.
    // A broad local veil separates the fire-side middle ground without blur.
    float haze=(1.-exp(-max(length(eye-vPosition)-3.,0.)*.035))
      *exp(-max(vPosition.z,0.)*.65);
    if(kind==0.&&emissionStrength<.1) tone=mix(tone,.26,haze);
    vec2 screen=floor(gl_FragCoord.xy/pixelRatio);
    float threshold=orderedThreshold(screen);
    gl_FragColor=vec4(mix(ink,paper,step(threshold,tone)),a);return;
  }
  c=original>.5?toneMap(c):clamp(standardColor(c),0.,1.);
  float lum=dot(c,vec3(.2126,.7152,.0722));
  if(original<.5&&kind<4.) lum=clamp(lum+.08,0.,1.);
  // Ordered coverage keeps the mirror texture visually regular in 1-bit mode.
  vec2 p=floor(gl_FragCoord.xy/((kind>=4.?orbGrain:2.)*pixelRatio));
  float threshold=kind>=4.?orderedThreshold(p):texture2D(blueNoise,(p+.5)/128.).r;
  gl_FragColor=vec4(mix(mix(ink,paper,step(threshold,lum)),c,original),a);
}`;
const identity = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const shadowFragmentSource = `
precision highp float;
uniform vec3 firePosition;
varying vec3 vPosition;
void main() {
  float depth=min(length(vPosition-firePosition)/16.,.99999);
  vec3 depthEncoding=fract(depth*vec3(1.,255.,65025.));
  depthEncoding.xy-=depthEncoding.yz/255.;
  gl_FragColor=vec4(depthEncoding,1.);
}`;
function normalize(v: number[]) { const n=Math.hypot(...v)||1; return v.map(x=>x/n); }
function cross(a: number[], b: number[]) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function dot(a: number[], b: number[]) { return a.reduce((sum,x,i)=>sum+x*b[i],0); }
function viewProjection(eye: number[], target: number[], aspect: number, fov=Math.PI/4, up=[0,0,1], far=80) {
  const z=normalize(eye.map((x,i)=>x-target[i])), x=normalize(cross(up,z)), y=cross(z,x);
  const v=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
  const f=1/Math.tan(fov/2), n=.05;
  const p=[f/aspect,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0];
  const out=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) out[c*4+r]+=p[k*4+r]*v[c*4+k];
  return out;
}
function rgb(token: string): [number,number,number] {
  const hex=token.trim().replace(/^#/,"");
  if(!/^[0-9a-f]{6}$/i.test(hex)) throw new Error("Invalid scene palette token");
  return [parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255];
}
export async function createCampfireRenderer(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<CampfireRenderer> {
  async function fetchAsset(file: string) {
    const response=await fetch(file.startsWith("/")?file:"/harry-campfire/orbit/"+file,{signal});
    if(!response.ok) throw new Error(`Scene asset unavailable: ${file}`);
    return response;
  }
  const [scene,geometry]=await Promise.all([
    fetchAsset("scene-with-props.json").then(r=>r.json() as Promise<Scene>),
    (async()=>{
      if(typeof DecompressionStream === "undefined") return (await fetchAsset("geometry-with-props.bin")).arrayBuffer();
      const response=await fetchAsset("geometry-with-props.bin.gz");
      if(!response.body) throw new Error("Missing scene geometry");
      return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    })(),
  ]);
  const gl=canvas.getContext("webgl",{alpha:true,antialias:true,premultipliedAlpha:false});
  if(!gl) throw new Error("WebGL unavailable");
  const textures=new Map<string,WebGLTexture>(), buffers: WebGLBuffer[]=[], shaders: WebGLShader[]=[];
  const framebuffers: WebGLFramebuffer[]=[], renderbuffers: WebGLRenderbuffer[]=[];
  let program: WebGLProgram | null=null, disposed=false;
  const cleanup=()=>{
    disposed=true; textures.forEach(t=>gl.deleteTexture(t)); buffers.forEach(b=>gl.deleteBuffer(b));
    shaders.forEach(s=>gl.deleteShader(s)); gl.deleteProgram(program);
    framebuffers.forEach(f=>gl.deleteFramebuffer(f));renderbuffers.forEach(r=>gl.deleteRenderbuffer(r));
  };
  try {
    for(const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]] as const) {
      const shader=gl.createShader(type); if(!shader) throw new Error("Shader allocation failed");
      shaders.push(shader); gl.shaderSource(shader,source); gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)??"Shader compile failed");
    }
    program=gl.createProgram(); if(!program) throw new Error("Program allocation failed");
    shaders.forEach(s=>gl.attachShader(program!,s)); gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)??"Shader link failed");
    gl.useProgram(program);
    const uniforms=new Map<string,WebGLUniformLocation|null>();
    const u=(name: string)=>{
      if(!uniforms.has(name)) uniforms.set(name,gl.getUniformLocation(program!,name));
      return uniforms.get(name)!;
    };
    const white=gl.createTexture(); if(!white) throw new Error("Texture allocation failed");
    textures.set("",white); gl.bindTexture(gl.TEXTURE_2D,white);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    const files=[...new Set([...scene.materials.flatMap(m=>[m.texture,m.mask,m.emission]),scene.environment,"/water/blue-noise-128.png"].filter((f): f is string=>Boolean(f)))];
    // Sequential uploads allow deterministic cleanup on abort or missing textures.
    for(const file of files) {
      const bitmap=await createImageBitmap(await (await fetchAsset(file)).blob(),{imageOrientation:"flipY",premultiplyAlpha:"none"});
      try {
        if(signal.aborted) throw new DOMException("Aborted","AbortError");
        const tex=gl.createTexture(); if(!tex) throw new Error("Texture allocation failed");
        textures.set(file,tex); gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        if(file.includes("blue-noise")) {
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        }
        const pot=(n: number)=>(n&(n-1))===0;
        const wrapping=pot(bitmap.width)&&pot(bitmap.height)?gl.REPEAT:gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrapping); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrapping);
      } finally { bitmap.close(); }
    }
    const attributes=[['position',3,0],['normal',3,3],['uv',2,6],['color',4,8],['wave1',3,12],['wave2',3,15],['wave3',3,18]] as const;
    const locations=attributes.map(([name,size,offset])=>({location:gl.getAttribLocation(program!,name),size,offset}));
    const uintIndices=gl.getExtension("OES_element_index_uint");
    const draws=scene.meshes.map(mesh=>{
      const buffer=gl.createBuffer(); if(!buffer) throw new Error("Mesh allocation failed");
      buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      const vertices=new Float32Array(geometry,mesh.offset,mesh.vertexCount*21);
      const indices=new Uint32Array(geometry,mesh.indexOffset,mesh.count);
      let indexBuffer: WebGLBuffer | null=null;
      if(uintIndices) {
        gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
        indexBuffer=gl.createBuffer(); if(!indexBuffer) throw new Error("Index allocation failed");
        buffers.push(indexBuffer);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
      } else {
        const expanded=new Float32Array(mesh.count*21);
        indices.forEach((index,i)=>expanded.set(vertices.subarray(index*21,index*21+21),i*21));
        gl.bufferData(gl.ARRAY_BUFFER,expanded,gl.STATIC_DRAW);
      }
      return {...mesh,buffer,indexBuffer};
    });
    // Six radial-depth faces give real point-light occlusion in every orbit view.
    // Opaque geometry and light position are static, so this pass runs only once.
    const shadow=gl.createTexture(), framebuffer=gl.createFramebuffer(), depthBuffer=gl.createRenderbuffer();
    if(!shadow||!framebuffer||!depthBuffer) throw new Error("Shadow allocation failed");
    textures.set("fire-shadow",shadow);
    const shadowProgram=gl.createProgram();
    if(!shadowProgram) throw new Error("Shadow program allocation failed");
    try {
      for(const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,shadowFragmentSource]] as const) {
        const shader=gl.createShader(type); if(!shader) throw new Error("Shadow shader allocation failed");
        shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)??"Shadow compile failed");
        gl.attachShader(shadowProgram,shader);
      }
      gl.linkProgram(shadowProgram);
      if(!gl.getProgramParameter(shadowProgram,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(shadowProgram)??"Shadow link failed");
      gl.useProgram(shadowProgram);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP,shadow);
      const faceSize=512;
      for(let face=0;face<6;face++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+face,0,gl.RGBA,faceSize,faceSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.bindRenderbuffer(gl.RENDERBUFFER,depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,faceSize,faceSize);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depthBuffer);
      const su=(name: string)=>gl.getUniformLocation(shadowProgram,name);
      const shadowLocations=attributes.map(([name,size,offset])=>({location:gl.getAttribLocation(shadowProgram,name),size,offset}));
      gl.uniform3fv(su("firePosition"),scene.firePosition);
      gl.uniform3fv(su("weights"),[0,0,0]);
      gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.viewport(0,0,faceSize,faceSize);
      const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
      const ups=[[0,-1,0],[0,-1,0],[0,0,1],[0,0,-1],[0,-1,0],[0,-1,0]];
      for(let face=0;face<6;face++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_CUBE_MAP_POSITIVE_X+face,shadow,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error("Shadow framebuffer incomplete");
        gl.clearColor(1,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(su("viewProjection"),false,viewProjection(scene.firePosition,scene.firePosition.map((v,i)=>v+directions[face][i]),1,Math.PI/2,ups[face],16));
        for(const mesh of draws) {
          const mat=scene.materials[mesh.material];
          if((mat.kind>0&&mat.kind<4)||(mat.emissionStrength??0)>0) continue;
          gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
          for(const {location,size,offset} of shadowLocations) if(location>=0) {gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,84,offset*4);}
          gl.uniformMatrix4fv(su("model"),false,mesh.matrices?.[0]??identity);
          if(mesh.indexBuffer) {gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.indexBuffer);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);}
          else gl.drawArrays(gl.TRIANGLES,0,mesh.count);
        }
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(framebuffer);gl.deleteRenderbuffer(depthBuffer);gl.deleteProgram(shadowProgram);
    }
    gl.useProgram(program);
    gl.uniform1i(u("diffuse"),0); gl.uniform1i(u("mask"),1); gl.uniform1i(u("emission"),2); gl.uniform1i(u("environment"),3);
    gl.uniform1i(u("fireShadow"),4);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_CUBE_MAP,shadow);
    gl.uniform1f(u("environmentRange"),scene.environmentRange);gl.uniform1f(u("environmentStrength"),scene.environmentStrength);
    const reflection=gl.createTexture(), reflectionFramebuffer=gl.createFramebuffer(), reflectionDepth=gl.createRenderbuffer();
    if(!reflection||!reflectionFramebuffer||!reflectionDepth) throw new Error("Reflection allocation failed");
    textures.set("scene-reflection",reflection);framebuffers.push(reflectionFramebuffer);renderbuffers.push(reflectionDepth);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,reflection);
    const reflectionSize=512;
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,reflectionSize,reflectionSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER,reflectionFramebuffer);gl.bindRenderbuffer(gl.RENDERBUFFER,reflectionDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,reflectionSize,reflectionSize);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,reflectionDepth);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,reflection,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error("Reflection framebuffer incomplete");
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.uniform1i(u("sceneReflection"),5);
    gl.uniform1i(u("blueNoise"),6);gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,textures.get("/water/blue-noise-128.png")!);
    gl.uniform3fv(u("firePosition"),scene.firePosition);
    gl.uniform1f(u("smokeHeight"),motionTokens.heroPrototype.smoke.height);
    gl.uniform3fv(u("orbCenter"),scene.orb.center);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    let yaw=scene.camera.yaw,pitch=scene.camera.pitch,distance=scene.camera.distance;
    let cameraTarget: readonly number[] = scene.camera.target;
    let dirty=true, lastSeconds=-1, lastOriginal=false, lastReflectionFrame=-1;
    let orbBrightness=1, orbDensity=55, progress=0;
    let suspension={x:.5,y:0};
    let propTargets: ReturnType<CampfireRenderer["propTargets"]> = [];
    let activeProp: string | null = null;
    // Development-only diagnostics; no timers or UI are added to production.
    const frameIntervals: number[]=[];
    let previousDraw=0;
    const resize=new ResizeObserver(()=>{dirty=true;}); resize.observe(canvas);
    const theme=new MutationObserver(()=>{dirty=true;}); theme.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme","style","class"]});
    const bind=(file: string|null,unit: number)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,textures.get(file??"")??white);};
    return {
      propTargets:()=>propTargets,
      setActiveProp(id) { if(activeProp!==id) {activeProp=id;dirty=true;} },
      setPresentation(brightness,density,value) {
        const b=Math.max(.2,Math.min(1.8,brightness/100));
        const d=Math.max(0,Math.min(100,density));
        const p=Math.max(0,Math.min(1,value));
        if(b===orbBrightness&&d===orbDensity&&p===progress) return;
        orbBrightness=b;orbDensity=d;progress=p;dirty=true;
      },
      suspensionPoint:()=>suspension,
      setView(view) {
        if (yaw===view.yaw && pitch===view.pitch && distance===view.distance && cameraTarget.every((value,index)=>value===view.target[index])) return;
        yaw=view.yaw; pitch=view.pitch; distance=view.distance; cameraTarget=view.target; dirty=true;
      },
      rotate(x,y) { yaw+=x; pitch=Math.max(.07,Math.min(1.3,pitch+y)); dirty=true; },
      zoom(delta) { distance=Math.max(3.4,Math.min(10,distance*Math.exp(delta))); dirty=true; },
      reset() { yaw=scene.camera.yaw; pitch=scene.camera.pitch; distance=scene.camera.distance; cameraTarget=scene.camera.target; dirty=true; },
      draw(seconds,original) {
        if(disposed || (!dirty&&seconds===lastSeconds&&original===lastOriginal)) return;
        if(process.env.NODE_ENV==="development") {
          const now=performance.now();
          if(original!==lastOriginal||seconds===lastSeconds) {frameIntervals.length=0;previousDraw=0;}
          if(previousDraw) frameIntervals.push(now-previousDraw);
          previousDraw=now;
          if(frameIntervals.length===120) {
            const sorted=[...frameIntervals].sort((a,b)=>a-b);
            canvas.dataset.frameTiming=JSON.stringify({mode:original?"original":"duotone",samples:120,
              meanMs:frameIntervals.reduce((sum,value)=>sum+value,0)/120,p95Ms:sorted[114]});
            frameIntervals.length=0;
          }
        }
        const rect=canvas.getBoundingClientRect(), scale=Math.min(window.devicePixelRatio||1,1.5);
        const width=Math.max(1,Math.round(rect.width*scale)), height=Math.max(1,Math.round(rect.height*scale));
        if(canvas.width!==width||canvas.height!==height) {canvas.width=width;canvas.height=height;}
        gl.viewport(0,0,width,height); gl.clearColor(0,0,0,0); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        const target=[...cameraTarget];
        const eye=[target[0]+distance*Math.sin(yaw)*Math.cos(pitch),target[1]-distance*Math.cos(yaw)*Math.cos(pitch),target[2]+distance*Math.sin(pitch)];
        const transition=motionTokens.heroPrototype.transition;
        const shrink=stageProgress(progress,transition.shrinkStart,transition.shrinkEnd);
        const lift=stageProgress(progress,transition.liftStart,transition.liftEnd);
        const hanging=hangingMotion(progress);
        const visibleHeight=2*distance*Math.tan(Math.PI/8);
        const diameter=Math.min(transition.finalDiameter,rect.width*.32);
        const finalScale=diameter/rect.height*visibleHeight/(2*scene.orb.radius);
        const sceneScale=Math.exp(Math.log(finalScale)*shrink);
        const up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(yaw)*Math.sin(pitch),Math.cos(pitch)];
        const top=[scene.orb.center[0],scene.orb.center[1],scene.orb.center[2]+scene.orb.radius];
        const translation=top.map(a=>(1-sceneScale)*a);
        for(let i=0;i<3;i++) translation[i]+=shrink*(target[i]-(scene.orb.center[i]*sceneScale+translation[i]));
        const desiredCenter=target.map((a,i)=>a+up[i]*(.5-transition.finalHeight)*visibleHeight);
        for(let i=0;i<3;i++) translation[i]+=lift*(desiredCenter[i]-(scene.orb.center[i]*sceneScale+translation[i]));
        for(let i=0;i<3;i++) translation[i]+=up[i]*hanging.rebound*visibleHeight;
        const root=new Float32Array([sceneScale,0,0,0,0,sceneScale,0,0,0,0,sceneScale,0,...translation,1]);
        const projection=multiplyMatrices(suspensionMatrix(hanging.swing,width/height),
          multiplyMatrices(viewProjection(eye,target,width/height),root));
        suspension=projectPoint(projection,top);
        propTargets=(scene.props??[]).map(prop=>{
          const [lo,hi]=prop.bounds;
          const corners=[];
          for(const x of [lo[0],hi[0]]) for(const y of [lo[1],hi[1]]) for(const z of [lo[2],hi[2]]) corners.push(projectPoint(projection,[x,y,z]));
          const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x));
          const upper=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y));
          const center=lo.map((v,i)=>(v+hi[i])/2);
          const facing=center.reduce((sum,v,i)=>sum+(v-scene.orb.center[i])*(eye[i]-v),0)>0;
          // A partially clipped prop still has a usable visible hit area.
          const clippedLeft=Math.max(0,left),clippedRight=Math.min(1,right);
          const clippedTop=Math.max(0,upper),clippedBottom=Math.min(1,bottom);
          return {id:prop.id,x:(clippedLeft+clippedRight)/2,y:(clippedTop+clippedBottom)/2,
            width:Math.max(0,clippedRight-clippedLeft),height:Math.max(0,clippedBottom-clippedTop),
            visible:progress<.08&&facing&&clippedLeft<clippedRight&&clippedTop<clippedBottom};
        });
        gl.uniformMatrix4fv(u("viewProjection"),false,projection);
        gl.uniform3fv(u("eye"),eye.map((v,i)=>(v-translation[i])/sceneScale));bind(scene.environment,3);
        gl.uniform1f(u("orbBrightness"),orbBrightness);
        gl.uniform1f(u("orbGrain"),1+(100-orbDensity)*.05*(1-shrink*.85));
        gl.uniform1f(u("orbLight"),stageProgress(progress,transition.lightStart,transition.lightEnd));
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,original?gl.LINEAR:gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,original?gl.LINEAR:gl.NEAREST);
        gl.uniform1f(u("pixelRatio"),scale);
        const styles=getComputedStyle(canvas);
        gl.uniform3fv(u("ink"),rgb(styles.getPropertyValue("--water-ink")));gl.uniform3fv(u("paper"),rgb(styles.getPropertyValue("--water-paper")));
        gl.uniform1f(u("original"),original?1:0);
        const time=seconds%scene.duration, frame=Math.floor(time*scene.fps)%scene.frames;
        gl.uniform1f(u("seconds"),time); gl.uniform1f(u("flicker"),scene.lightEnergy[frame]/scene.lightEnergy[0]);
        // Opaque first; translucent objects are sorted back to front at each view.
        const ordered=[...draws].sort((a,b)=>{
          const ak=scene.materials[a.material].kind,bk=scene.materials[b.material].kind;
          const at=ak>0&&ak<4,bt=bk>0&&bk<4;
          if(!at&&!bt) return 0; if(!at) return -1; if(!bt) return 1;
          const d=(m: number[]|undefined)=>Math.hypot((m?.[12]??1.23)-eye[0],(m?.[13]??-.38)-eye[1],(m?.[14]??.6)-eye[2]);
          return d(b.matrices?.[frame])-d(a.matrices?.[frame]);
        });
        const renderMesh=(mesh: typeof ordered[number])=>{
          const mat=scene.materials[mesh.material]; gl.depthMask(mat.kind===0||mat.kind>=4);
          gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
          for(const {location,size,offset} of locations) if(location>=0) {gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,84,offset*4);}
          gl.uniformMatrix4fv(u("model"),false,mesh.matrices?.[frame]??identity);gl.uniform3fv(u("weights"),mesh.weights?.[frame]??[0,0,0]);
          gl.uniform4fv(u("baseColor"),mat.color); gl.uniform1f(u("kind"),mat.kind);
          gl.uniform1f(u("activeProp"),mesh.name===`hero-prop-${activeProp}`?1:0);
          gl.uniform1f(u("propMaterial"),mesh.name.startsWith("hero-prop-")?1:0);
          gl.uniform3fv(u("emissionColor"),mat.emissionColor??[0,0,0]);
          gl.uniform1f(u("emissionStrength"),mat.emissionStrength??0);gl.uniform1f(u("hasEmission"),mat.emission?1:0);
          gl.uniform1f(u("metallic"),mat.metallic??0);gl.uniform1f(u("roughness"),mat.roughness??.7);
          gl.uniform1f(u("bakedRoughness"),mat.bakedRoughness?1:0);
          gl.uniform1f(u("faceMaterial"),mat.name==="Harry_Body_Material"?1:0);
          bind(mat.texture,0);bind(mat.mask,1);bind(mat.emission,2);
          if(mesh.indexBuffer) {gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.indexBuffer);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);}
          else gl.drawArrays(gl.TRIANGLES,0,mesh.count);
        };
        const reflectedEye=[eye[0],eye[1],-eye[2]], reflectedTarget=[target[0],target[1],-target[2]];
        const reflectionMatrix=viewProjection(reflectedEye,reflectedTarget,width/height,Math.PI/4,[0,0,-1]);
        gl.uniformMatrix4fv(u("reflectionViewProjection"),false,reflectionMatrix);
        // Only original mode samples this texture. Refresh on source animation
        // frames, but always follow camera/size changes immediately.
        if(!matteOrb&&original&&(dirty||!lastOriginal||frame!==lastReflectionFrame)) {
          gl.bindFramebuffer(gl.FRAMEBUFFER,reflectionFramebuffer);gl.viewport(0,0,reflectionSize,reflectionSize);
          // Avoid a texture feedback loop while writing the reflection attachment.
          bind(null,5);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
          gl.uniform1f(u("reflectionPass"),1);gl.uniformMatrix4fv(u("viewProjection"),false,reflectionMatrix);gl.uniform3fv(u("eye"),reflectedEye);
          for(const mesh of ordered) if(scene.materials[mesh.material].kind<4) renderMesh(mesh);
          gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);
          gl.uniform1f(u("reflectionPass"),0);gl.uniformMatrix4fv(u("viewProjection"),false,viewProjection(eye,target,width/height));gl.uniform3fv(u("eye"),eye);
          bind("scene-reflection",5);
          gl.generateMipmap(gl.TEXTURE_2D);
          lastReflectionFrame=frame;
        }
        if(!original||activeProp) {
          gl.enable(gl.CULL_FACE);gl.cullFace(gl.FRONT);
          gl.uniform1f(u("outlineDraw"),1);gl.uniform1f(u("outlineWidth"),.012);
          for(const mesh of ordered) {
            const mat=scene.materials[mesh.material];
            if(mat.kind===0&&(mat.emissionStrength??0)<.1&&(!original||mesh.name===`hero-prop-${activeProp}`)) renderMesh(mesh);
          }
          gl.disable(gl.CULL_FACE);gl.uniform1f(u("outlineDraw"),0);gl.uniform1f(u("outlineWidth"),0);
        }
        for(const mesh of ordered) renderMesh(mesh);
        lastSeconds=seconds;lastOriginal=original;dirty=false;
      },
      dispose() { resize.disconnect();theme.disconnect();cleanup(); },
    };
  } catch(error) { cleanup();console.error("Campfire renderer initialization failed",error);throw error; }
}

