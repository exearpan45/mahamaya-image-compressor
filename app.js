(()=>{
'use strict';
const $=id=>document.getElementById(id);
let photo=null,video=null,working=false;
const active=()=>document.querySelector('#video-panel:not(.hidden)')?'video':'photo';
const fmt=n=>n<1024?Math.round(n)+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';
function target(p){
  const n=Number($(p+'-target').value),unit=$(p+'-unit').value;
  if(!Number.isFinite(n)||n<=0)throw Error('Enter a target size greater than zero.');
  const bytes=n*(unit==='MB'?1048576:1024);
  if(bytes<1024)throw Error('Target size must be at least 1 KB.');
  return bytes;
}
function showError(p,e){
  const r=$(p+'-result');r.replaceChildren();r.classList.remove('hidden');
  const msg=document.createElement('p');msg.setAttribute('role','alert');
  msg.textContent='Could not compress: '+(e&&e.message?e.message:'Unknown browser error')+'. Your original file is unchanged. Try another format or a larger target size.';
  r.append(msg);$(p+'-status').textContent='Compression did not finish.';
}
function showResult(p,b,f,goal){
  const r=$(p+'-result');r.replaceChildren();r.classList.remove('hidden');
  const reduction=f.size?Math.round((1-b.size/f.size)*100):0;
  const d=document.createElement('p');
  d.textContent='Original '+fmt(f.size)+' · Result '+fmt(b.size)+' · '+(b.size<f.size?reduction+'% smaller':'No size reduction');
  r.append(d);
  const note=document.createElement('p');
  if(b.size>goal)note.textContent='Target not reached. The browser produced the smallest result found with these settings. Try a larger target or lower quality.';
  else note.textContent='Target reached.';
  r.append(note);
  const ext=p==='photo'?(b.type==='image/jpeg'?'jpg':b.type==='image/png'?'png':'webp'):(b.type.includes('mp4')?'mp4':'webm');
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(f.name.replace(/\.[^.]+$/,'')||'file')+'-compressed.'+ext;
  a.textContent='Download compressed file';r.append(a);
}
function hideResult(p){const r=$(p+'-result');r.classList.add('hidden');r.replaceChildren()}
function choose(p,f){
  if(!f)return;
  if(p==='photo'&&!f.type.startsWith('image/'))return showError(p,Error('Choose an image file.'));
  if(p==='video'&&!f.type.startsWith('video/'))return showError(p,Error('Choose a video file.'));
  const limit=p==='photo'?30:150;
  if(f.size>limit*1048576)return showError(p,Error('This file is over the '+limit+' MB limit.'));
  if(p==='photo'){
    if(photo&&photo.previewURL)URL.revokeObjectURL(photo.previewURL);
    photo={file:f,previewURL:URL.createObjectURL(f)};
    $('photo-preview').src=photo.previewURL;
  }else video=f;
  $(p+'-card').classList.remove('hidden');$(p+'-name').textContent=f.name;
  $(p+'-original').textContent='Original · '+fmt(f.size);$(p+'-compress').disabled=false;
  hideResult(p);$(p+'-status').textContent='';
}
function remove(p){
  if(working)return;
  if(p==='photo'){
    if(photo&&photo.previewURL)URL.revokeObjectURL(photo.previewURL);
    photo=null;$('photo-preview').removeAttribute('src');
  }else video=null;
  $(p+'-file').value='';$(p+'-card').classList.add('hidden');
  $(p+'-compress').disabled=true;hideResult(p);$(p+'-status').textContent='';
}
['photo','video'].forEach(p=>{
  const input=$(p+'-file'),drop=$(p+'-drop');
  input.addEventListener('change',()=>choose(p,input.files[0]));
  ['dragover','dragenter'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.add('drag')}));
  ['dragleave','drop'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.remove('drag')}));
  drop.addEventListener('drop',e=>{if(e.dataTransfer.files[0])choose(p,e.dataTransfer.files[0])});
  $(p+'-remove').addEventListener('click',()=>remove(p));
  $(p+'-quality').addEventListener('input',e=>$(p+'-quality-label').textContent=e.target.value+'%');
});
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  if(working)return;
  document.querySelectorAll('.tab').forEach(b=>{b.classList.toggle('active',b===t);b.setAttribute('aria-selected',String(b===t))});
  ['photo','video'].forEach(p=>$(p+'-panel').classList.toggle('hidden',p!==t.dataset.mode));
}));
function canvasBlob(canvas,type,quality){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Browser could not encode this image format.')),type,quality));
}
$('photo-compress').addEventListener('click',async()=>{
  if(!photo||working)return;
  working=true;const f=photo.file;let canvas=null;
  try{
    const goal=target('photo');$('photo-compress').disabled=true;
    $('photo-progress-wrap').classList.remove('hidden');$('photo-progress').value=2;
    $('photo-status').textContent='Loading image…';
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Browser cannot read this image.'));img.src=photo.previewURL});
    let width=img.naturalWidth,height=img.naturalHeight;
    if(!width||!height)throw Error('The image has no readable dimensions.');
    const shrink=Math.min(1,4096/Math.max(width,height));width=Math.max(1,Math.round(width*shrink));height=Math.max(1,Math.round(height*shrink));
    canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Canvas is not supported.');
    const originalType=f.type==='image/png'?'image/png':'image/webp';
    const types=originalType==='image/png'?['image/png','image/webp']:['image/webp','image/jpeg'];
    let best=null,bestType='',bestWidth=width,bestHeight=height,pass=0;
    const qualityStart=Number($('photo-quality').value)/100;
    for(const type of types){
      let w=width,h=height;
      for(let scalePass=0;scalePass<9;scalePass++){
        canvas.width=w;canvas.height=h;
        ctx.clearRect(0,0,w,h);
        if(type==='image/jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h)}
        ctx.drawImage(img,0,0,w,h);
        const qualities=type==='image/png'?[undefined]:[qualityStart,Math.max(.12,qualityStart-.15),Math.max(.1,qualityStart-.3),.1];
        for(const q of qualities){
          const blob=await canvasBlob(canvas,type,q);
          pass++;$('photo-progress').value=Math.min(95,Math.round(pass/((types.length*9*4))*90)+5);
          $('photo-status').textContent='Optimizing image · pass '+pass;
          if(!best||blob.size<best.size){best=blob;bestType=blob.type;bestWidth=w;bestHeight=h}
          if(blob.size<=goal){showResult('photo',blob,f,goal);$('photo-status').textContent='Finished. Review the output before using it.';return}
        }
        w=Math.max(1,Math.floor(w*.82));h=Math.max(1,Math.floor(h*.82));
        if(w===1&&h===1)break;
      }
    }
    if(!best)throw Error('No output image could be created.');
    showResult('photo',best,f,goal);
    $('photo-status').textContent='Finished. Best result found: '+bestWidth+' × '+bestHeight+' pixels ('+bestType+').';
  }catch(e){showError('photo',e)}
  finally{if(canvas){canvas.width=0;canvas.height=0}working=false;$('photo-compress').disabled=!photo}
});
$('video-compress').addEventListener('click',async()=>{
  if(!video||working)return;
  working=true;const f=video;let v=null,canvas=null,stream=null,audioStream=null,rec=null,raf=0,objectURL=null;
  try{
    const goal=target('video');
    if(!window.MediaRecorder)throw Error('This browser does not support video encoding. Try a recent desktop Chrome or Edge.');
    const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw Error('No compatible WebM encoder is available in this browser.');
    $('video-compress').disabled=true;$('video-progress-wrap').classList.remove('hidden');
    $('video-progress').value=0;$('video-status').textContent='Loading video…';
    v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';
    objectURL=URL.createObjectURL(f);v.src=objectURL;
    await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=()=>reject(Error('Browser cannot decode this video.'))});
    if(!v.videoWidth||!Number.isFinite(v.duration)||v.duration<=0||v.duration>600)throw Error('Unsupported video or duration over 10 minutes.');
    const scale=Math.min(1,1280/Math.max(v.videoWidth,v.videoHeight));
    canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.floor(v.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.floor(v.videoHeight*scale/2)*2);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas capture is not supported.');
    if(typeof canvas.captureStream!=='function')throw Error('This browser cannot capture a compressed video stream.');
    stream=canvas.captureStream(24);
    if(typeof v.captureStream==='function'){
      try{audioStream=v.captureStream();audioStream.getAudioTracks().forEach(t=>stream.addTrack(t))}catch{}
    }
    const estimatedBitrate=Math.floor(goal*8/v.duration*.82);
    const bitrate=Math.max(50000,Math.min(4000000,estimatedBitrate));
    rec=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:bitrate,audioBitsPerSecond:Math.max(16000,Math.min(128000,Math.floor(bitrate*.12)))});
    const chunks=[];
    rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
    const stopped=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=()=>reject(Error('Video encoder failed.'))});
    let playbackError=null;
    const draw=()=>{
      if(!v||v.paused||v.ended||!working)return;
      try{
        ctx.drawImage(v,0,0,canvas.width,canvas.height);
        const pct=Math.min(99,Math.round(v.currentTime/v.duration*100));
        $('video-progress').value=pct;$('video-status').textContent='Encoding '+pct+'% · keep this tab open';
        raf=requestAnimationFrame(draw);
      }catch(e){playbackError=e;if(rec&&rec.state!=='inactive')rec.stop()}
    };
    v.onended=()=>{cancelAnimationFrame(raf);if(rec&&rec.state!=='inactive')rec.stop()};
    rec.start(500);
    await v.play();draw();
    await stopped;
    if(playbackError)throw playbackError;
    const blob=new Blob(chunks,{type:rec.mimeType||mime});
    if(!blob.size)throw Error('The browser produced an empty video.');
    $('video-progress').value=100;showResult('video',blob,f,goal);
    $('video-status').textContent=blob.size<=goal?'Finished within target size.':'Finished, but target size was exceeded. Try a larger target or lower quality.';
  }catch(e){showError('video',e)}
  finally{
    cancelAnimationFrame(raf);
    if(rec&&rec.state!=='inactive')try{rec.stop()}catch{}
    if(audioStream)audioStream.getTracks().forEach(t=>t.stop());
    if(stream)stream.getTracks().forEach(t=>t.stop());
    if(v){v.pause();v.removeAttribute('src');v.load()}
    if(objectURL)URL.revokeObjectURL(objectURL);
    if(canvas){canvas.width=0;canvas.height=0}
    working=false;$('video-compress').disabled=!video;
  }
});
window.addEventListener('beforeunload',()=>{
  if(photo&&photo.previewURL)URL.revokeObjectURL(photo.previewURL);
  document.querySelectorAll('.result a[href^="blob:"]').forEach(a=>URL.revokeObjectURL(a.href));
});
window.addEventListener('unhandledrejection',e=>{e.preventDefault();if(working)showError(active(),e.reason)});
})();