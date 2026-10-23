/** Sparse paper grain and airborne dust, driven by the scene's existing clock. */
export function createCampfireAtmosphere(canvas: HTMLCanvasElement) {
  const context=canvas.getContext("2d");
  if(!context) return () => {};
  const grain=document.createElement("canvas");grain.width=grain.height=256;
  const grainContext=grain.getContext("2d");
  let lastTime=-1,lastActive=false,lastColor="",lastWidth=0,lastHeight=0;
  const random=(index: number)=>{
    const n=Math.sin(index*127.1+311.7)*43758.5453;
    return n-Math.floor(n);
  };
  return (seconds: number,active: boolean)=>{
    const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);
    const width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
    const paper=getComputedStyle(canvas).getPropertyValue("--water-paper").trim();
    if(seconds===lastTime&&active===lastActive&&paper===lastColor&&width===lastWidth&&height===lastHeight) return;
    if(canvas.width!==width||canvas.height!==height) {canvas.width=width;canvas.height=height;}
    context.clearRect(0,0,width,height);
    if(paper!==lastColor&&grainContext) {
      grainContext.clearRect(0,0,256,256);grainContext.fillStyle=paper;
      for(let i=0;i<780;i++) grainContext.fillRect(Math.floor(random(i*3)*256),Math.floor(random(i*3+1)*256),1,1);
    }
    if(active) {
      context.save();context.scale(ratio,ratio);
      const pattern=context.createPattern(grain,"repeat");
      if(pattern) {context.globalAlpha=.16;context.fillStyle=pattern;context.fillRect(0,0,rect.width,rect.height);}
      context.fillStyle=paper;
      for(let i=0;i<32;i++) {
        const x=random(i+500)*rect.width+Math.sin(seconds*.12+i)*9;
        const y=((random(i+700)*rect.height-seconds*(2+random(i+900)*3))%rect.height+rect.height)%rect.height;
        const size=i%7===0?2:1;
        context.globalAlpha=.20+random(i+1100)*.26;
        context.fillRect(Math.floor(x),Math.floor(y),size,size);
      }
      context.restore();
    }
    lastTime=seconds;lastActive=active;lastColor=paper;lastWidth=width;lastHeight=height;
  };
}
