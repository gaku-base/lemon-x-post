const SIMPLE_UI_STORAGE_KEY='lemonUiMode';
const POST_CONCIERGE_UI_VERSION='4.10.7';
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

function installHeaderLogo(){
  const heroBrand=document.querySelector('.hero-brand');
  if(!heroBrand||heroBrand.dataset.postConciergeLogo==='installed')return;
  heroBrand.dataset.postConciergeLogo='installed';
  heroBrand.setAttribute('role','img');
  heroBrand.setAttribute('aria-label','レモン apps POST CONCIERGE ロゴ');
  heroBrand.innerHTML='<span id="appVersion" class="version-badge hero-version-chip"></span>';
}

function installPostConciergeIdentity(){
  document.title='ポストコンシェルジュ';
  upsertIdentityMeta('application-name','ポストコンシェルジュ');
  upsertIdentityMeta('apple-mobile-web-app-title','ポストコンシェルジュ');
  upsertIdentityMeta('apple-mobile-web-app-capable','yes');
  upsertIdentityMeta('mobile-web-app-capable','yes');
  upsertIdentityMeta('apple-mobile-web-app-status-bar-style','default');
  upsertIdentityMeta('theme-color','#fff7df');

  installHeaderLogo();

  const versionText=`v${POST_CONCIERGE_UI_VERSION}`;
  if($('appVersion'))$('appVersion').textContent=versionText;
  if($('appVersionFooter'))$('appVersionFooter').textContent=`${versionText}（${POST_CONCIERGE_BUILD_DATE}）`;

  upsertIdentityLink('apple-touch-icon','./assets/post-concierge-icon-180.png','180x180');
  upsertIdentityLink('icon','./assets/post-concierge-icon-192.png','192x192');
  upsertIdentityLink('icon','./assets/post-concierge-icon-512.png','512x512');
  upsertIdentityLink('shortcut icon','./assets/post-concierge-icon-192.png');

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
      {src:'./assets/post-concierge-icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},
      {src:'./assets/post-concierge-icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}
    ]
  };
  const manifestUrl=URL.createObjectURL(
    new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'})
  );
  upsertIdentityLink('manifest',manifestUrl);
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
