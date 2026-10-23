import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const directory=path.resolve('public/harry-campfire/orbit');
const scene=JSON.parse(await readFile(path.join(directory,'scene.json'),'utf8'));
const geometry=await readFile(path.join(directory,'geometry.bin'));
if(scene.frames!==288||scene.fps!==24) throw new Error('Unexpected source animation duration');
for(const mesh of scene.meshes) {
  if(mesh.offset%4||mesh.indexOffset%4||mesh.indexOffset+mesh.count*4>geometry.length) throw new Error(`Invalid buffer: ${mesh.name}`);
  const indices=new Uint32Array(geometry.buffer,geometry.byteOffset+mesh.indexOffset,mesh.count);
  if(indices.some(index=>index>=mesh.vertexCount)) throw new Error(`Invalid index: ${mesh.name}`);
  if(mesh.matrices?.length!==undefined&&mesh.matrices.length!==scene.frames) throw new Error(`Missing motion: ${mesh.name}`);
  if(mesh.matrices?.flat().some(value=>!Number.isFinite(value))) throw new Error(`Invalid motion: ${mesh.name}`);
}
const flames=scene.meshes.filter(mesh=>mesh.name.includes('Flame')&&mesh.weights);
if(flames.length!==3||flames.some(mesh=>new Set(mesh.weights.map(frame=>frame.join(','))).size<100)) throw new Error('Flame shape drivers were not exported');
const sparks=scene.meshes.filter(mesh=>mesh.name.startsWith('Spark_')&&mesh.matrices);
if(sparks.length!==12) throw new Error('Missing source sparks');
for(const spark of sparks) {
  let rises=0,respawns=0;
  for(let frame=1;frame<spark.matrices.length;frame++) {
    const previous=spark.matrices[frame-1],current=spark.matrices[frame];
    const dz=current[14]-previous[14];
    // A lifecycle may jump back to the fire, but must never visibly fall.
    if(dz<-.5) {
      respawns++;
      const scale=Math.hypot(previous[0],previous[1],previous[2]);
      if(scale>.10) throw new Error(`Spark respawn did not fade: ${spark.name}`);
    } else if(dz<=0) throw new Error(`Spark is stationary or falling: ${spark.name}, frame ${frame}`);
    else rises++;
  }
  if(rises<270||respawns<2) throw new Error(`Incomplete buoyant spark lifecycle: ${spark.name}`);
}
if(scene.meshes.some(mesh=>/Collider|Fallen log|Annual growth|Bark ridge/.test(mesh.name))) throw new Error('Unexpected seat or collider');
if(!scene.materials.some(mat=>mat.kind===4)||!scene.materials.some(mat=>mat.kind===5)) throw new Error('Missing original mirror tiles or grout');
if(scene.materials.some(mat=>/Earth|Dry blades|Rough campfire stones/.test(mat.name))) throw new Error('Old ground remains');
if(scene.version!==2||scene.environmentRange<=1||scene.environmentStrength>.03) throw new Error('Missing dark-state HDR radiance');
const tile=scene.materials.find(mat=>mat.kind===4), grout=scene.materials.find(mat=>mat.kind===5);
const finished=scene.orb.finish==='bevel-1-baked-roughness';
if(tile.metallic!==1||Math.abs(tile.roughness-(finished ? .135 : .045))>.001||grout.emissionStrength!==0||!grout.sourceEmissionStrength||scene.orb.radius<14) throw new Error('Source material or intro state was lost');
if(finished) {
  if(!tile.bakedRoughness) throw new Error('Missing baked mirror roughness');
  for(const mesh of scene.meshes.filter(mesh=>scene.materials[mesh.material].kind===4)) {
    if(mesh.count>40000||mesh.vertexCount>25000) throw new Error('Mirror geometry exceeds web budget');
    for(let vertex=0;vertex<mesh.vertexCount;vertex++) {
      const roughness=geometry.readFloatLE(mesh.offset+vertex*84+44);
      if(!Number.isFinite(roughness)||roughness<.099||roughness>.171) throw new Error('Invalid baked roughness');
    }
  }
}
const images=[...new Set([...scene.materials.flatMap(mat=>[mat.texture,mat.mask,mat.emission]),scene.environment].filter(Boolean))];
let bytes=0;
for(const filename of images) {
  if(filename.endsWith('.webp')) { bytes+=(await readFile(path.join(directory,filename))).length;continue; }
  if(!filename.endsWith('.png')) throw new Error('Run Blender export before packing');
  const packed=filename.replace(/\.png$/,'.webp');
  const data=await sharp(path.join(directory,filename)).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp(filename===scene.environment?{lossless:true,alphaQuality:100}:{quality:94,alphaQuality:100}).toBuffer();
  await writeFile(path.join(directory,packed),data);bytes+=data.length;
  for(const material of scene.materials) for(const field of ['texture','mask','emission']) if(material[field]===filename) material[field]=packed;
  if(scene.environment===filename) scene.environment=packed;
}
const compressed=gzipSync(geometry,{level:9});
await writeFile(path.join(directory,'geometry.bin.gz'),compressed);
scene.geometry='geometry.bin.gz';
await writeFile(path.join(directory,'scene.json'),JSON.stringify(scene));
console.log(`Verified ${scene.meshes.length} meshes, 288 source frames, three flame layers and sparks. Packed ${(bytes+compressed.length)/1e6} MB plus manifest.`);
