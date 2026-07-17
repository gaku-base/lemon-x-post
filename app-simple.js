const SIMPLE_UI_STORAGE_KEY='lemonUiMode';
const POST_CONCIERGE_UI_VERSION='4.10.2';
const POST_CONCIERGE_BUILD_DATE='2026-07-17';

function setUiMode(mode,{save=true}={}){
  const detail=mode==='detail';
  document.body.classList.toggle('detail-mode',detail);
  document.body.classList.toggle('simple-mode',!detail);
  const simpleButton=$('simpleModeButton');
  const detailButton=$('detailModeButton');
  if(simpleButton){
    simpleButton.classList.toggle('active',!detail);
    simpleButton.setAttribute('aria-pressed',String(!detail));
  }
  if(detailButton){
    detailButton.classList.toggle('active',detail);
    detailButton.setAttribute('aria-pressed',String(detail));
  }
  document.querySelectorAll('.section-details').forEach(item=>item.open=detail);
  if(save)localStorage.setItem(SIMPLE_UI_STORAGE_KEY,detail?'detail':'simple');
}

function upsertIdentityMeta(name,content){
  let meta=document.head.querySelector(`meta[name="${name}"]`);
  if(!meta){
    meta=document.createElement('meta');
    meta.name=name;
    document.head.appendChild(meta);
  }
  meta.content=content;
}

function upsertIdentityLink(rel,href,sizes=''){
  let link=document.head.querySelector(`link[rel="${rel}"]${sizes?`[sizes="${sizes}"]`:''}`);
  if(!link){
    link=document.createElement('link');
    link.rel=rel;
    if(sizes)link.sizes=sizes;
    document.head.appendChild(link);
  }
  link.href=href;
  return link;
}

function createSandokunIconDataUrl(image,size){
  const canvas=document.createElement('canvas');
  canvas.width=size;
  canvas.height=size;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Canvas is not available.');

  const radius=size*.19;
  context.beginPath();
  context.moveTo(radius,0);
  context.arcTo(size,0,size,size,radius);
  context.arcTo(size,size,0,size,radius);
  context.arcTo(0,size,0,0,radius);
  context.arcTo(0,0,size,0,radius);
  context.closePath();
  context.clip();

  const gradient=context.createLinearGradient(0,0,size,size);
  gradient.addColorStop(0,'#fffaf0');
  gradient.addColorStop(.62,'#f8ead7');
  gradient.addColorStop(1,'#efd690');
  context.fillStyle=gradient;
  context.fillRect(0,0,size,size);

  const naturalWidth=image.naturalWidth||image.width;
  const naturalHeight=image.naturalHeight||image.height;
  const scale=Math.min((size*.9)/naturalWidth,(size*1.02)/naturalHeight);
  const width=naturalWidth*scale;
  const height=naturalHeight*scale;
  const x=(size-width)/2;
  const y=(size-height)/2+size*.015;
  context.drawImage(image,x,y,width,height);

  context.strokeStyle='rgba(93,70,45,.18)';
  context.lineWidth=Math.max(2,size*.012);
  context.strokeRect(context.lineWidth/2,context.lineWidth/2,size-context.lineWidth,size-context.lineWidth);

  return canvas.toDataURL('image/png');
}

async function installPostConciergeIdentity(){
  document.title='ポストコンシェルジュ';
  upsertIdentityMeta('application-name','ポストコンシェルジュ');
  upsertIdentityMeta('apple-mobile-web-app-title','ポストコンシェルジュ');
  upsertIdentityMeta('apple-mobile-web-app-capable','yes');
  upsertIdentityMeta('mobile-web-app-capable','yes');
  upsertIdentityMeta('apple-mobile-web-app-status-bar-style','default');
  upsertIdentityMeta('theme-color','#fff7df');

  const versionText=`v${POST_CONCIERGE_UI_VERSION}`;
  if($('appVersion'))$('appVersion').textContent=versionText;
  if($('appVersionFooter'))$('appVersionFooter').textContent=`${versionText}（${POST_CONCIERGE_BUILD_DATE}）`;

  const mascot=document.querySelector('.sandokun-mascot img');
  if(!mascot)return;

  try{
    if(typeof mascot.decode==='function')await mascot.decode();
    else if(!mascot.complete)await new Promise((resolve,reject)=>{
      mascot.addEventListener('load',resolve,{once:true});
      mascot.addEventListener('error',reject,{once:true});
    });

    const icon180=createSandokunIconDataUrl(mascot,180);
    const icon192=createSandokunIconDataUrl(mascot,192);
    const icon512=createSandokunIconDataUrl(mascot,512);

    upsertIdentityLink('apple-touch-icon',icon180,'180x180');
    upsertIdentityLink('icon',icon192,'192x192');
    upsertIdentityLink('shortcut icon',icon192);

    const manifest={
      name:'ポストコンシェルジュ',
      short_name:'ポストコンシェルジュ',
      description:'和洋喫茶 レモンの木の投稿文作成アプリ',
      lang:'ja',
      start_url:'./?source=home-screen',
      scope:'./',
      display:'standalone',
      orientation:'portrait',
      background_color:'#fff7df',
      theme_color:'#fff7df',
      icons:[
        {src:icon192,sizes:'192x192',type:'image/png',purpose:'any maskable'},
        {src:icon512,sizes:'512x512',type:'image/png',purpose:'any maskable'}
      ]
    };
    const manifestUrl=URL.createObjectURL(
      new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'})
    );
    upsertIdentityLink('manifest',manifestUrl);
  }catch(error){
    console.warn('サンドくんのホーム画面アイコンを生成できませんでした。',error);
  }
}

function initSimpleUi(){
  const saved=localStorage.getItem(SIMPLE_UI_STORAGE_KEY);
  setUiMode(saved==='detail'?'detail':'simple',{save:false});
  $('simpleModeButton')?.addEventListener('click',()=>setUiMode('simple'));
  $('detailModeButton')?.addEventListener('click',()=>setUiMode('detail'));
  $('openMenuManager')?.addEventListener('click',()=>openManage('bread'));
  installPostConciergeIdentity();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initSimpleUi,{once:true});
else initSimpleUi();
