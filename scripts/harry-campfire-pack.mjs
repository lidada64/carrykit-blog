import sharp from 'sharp';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

const directory=path.resolve('public/harry-campfire');
const width=1024,height=931;
const sourceWidth=1100,sourceHeight=1000;
const frames=[];
for(let i=0;i<12;i++){
  const input=path.join(directory,`frame-${String(i+1).padStart(2,'0')}.png`);
  const metadata=await sharp(input).metadata();
  if(metadata.width!==sourceWidth||metadata.height!==sourceHeight||!metadata.hasAlpha)throw new Error(`Invalid frame ${i+1}`);
  const tile=await sharp(input).resize(width,height).png().toBuffer();
  frames.push({input:tile,left:(i%4)*width,top:Math.floor(i/4)*height});
}
await sharp({create:{width:width*4,height:height*3,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames).webp({quality:95,alphaQuality:100}).toFile(path.join(directory,'loop.webp'));
await sharp(path.join(directory,'color.png')).webp({quality:90}).toFile(path.join(directory,'color.webp'));
await writeFile(path.join(directory,'manifest.json'),JSON.stringify({character:'Harrier Du Bois',characterCount:1,frames:12,columns:4,rows:3,width,height,source:'blender/harry-campfire.blend',characterSource:'blender/Harry_Opening_Outfit.blend',campfireSource:'blender/Outer_Wilds_Campfire.blend',originalModel:false},null,2));
console.log('Packed 12 verified RGBA frames into loop.webp');
