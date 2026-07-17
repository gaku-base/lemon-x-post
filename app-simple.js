const SIMPLE_UI_STORAGE_KEY='lemonUiMode';
const POST_CONCIERGE_UI_VERSION='4.10.4';
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

function withAssetVersion(path,version){
  return `${path}${path.includes('?')?'&':'?'}v=${encodeURIComponent(version)}`;
}

async function loadBranding(){
  const defaults={
    appName:'ポストコンシェルジュ',
    shortName:'Post Concierge',
    headerLogo:'./assets/branding/app-logo.png',
    appIcon180:'./assets/branding/app-icon-180.png',
    appIcon192:'./assets/branding/app-icon-192.png',
    appIcon512:'./assets/branding/app-icon-512.png',
    themeColor:'#fff7df',
    assetVersion:'20260717-1'
  };
  try{
    const response=await fetch('./assets/branding/branding.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`branding.json: ${response.status}`);
    return {...defaults,...await response.json()};
  }catch(error){
    console.warn('ブランド設定を読み込めなかったため既定値を使用します。',error);
    return defaults;
  }
}

function installHeaderLogo(branding){
  const heroBrand=document.querySelector('.hero-brand');
  if(!heroBrand)return;
  const src=withAssetVersion(branding.headerLogo,branding.assetVersion);
  heroBrand.innerHTML=`<div class="hero-logo-shell"><img class="hero-logo-img" src="${src}" alt="${branding.appName} ロゴ"><span id="appVersion" class="version-badge hero-version-chip"></span></div>`;
}

async function installPostConciergeIdentity(){
  const branding=await loadBranding();
  document.title=branding.appName;
  upsertIdentityMeta('application-name',branding.appName);
  upsertIdentityMeta('apple-mobile-web-app-title',branding.shortName);
  upsertIdentityMeta('apple-mobile-web-app-capable','yes');
  upsertIdentityMeta('mobile-web-app-capable','yes');
  upsertIdentityMeta('apple-mobile-web-app-status-bar-style','default');
  upsertIdentityMeta('theme-color',branding.themeColor);
  installHeaderLogo(branding);

  const versionText=`v${POST_CONCIERGE_UI_VERSION}`;
  if($('appVersion'))$('appVersion').textContent=versionText;
  if($('appVersionFooter'))$('appVersionFooter').textContent=`${versionText}（${POST_CONCIERGE_BUILD_DATE}）`;

  const icon180=withAssetVersion(branding.appIcon180,branding.assetVersion);
  const icon192=withAssetVersion(branding.appIcon192,branding.assetVersion);
  const icon512=withAssetVersion(branding.appIcon512,branding.assetVersion);
  upsertIdentityLink('apple-touch-icon',icon180,'180x180');
  upsertIdentityLink('icon',icon192,'192x192');
  upsertIdentityLink('icon',icon512,'512x512');
  upsertIdentityLink('shortcut icon',icon192);

  const manifest={
    name:branding.appName,
    short_name:branding.shortName,
    description:'和洋喫茶 レモンの木の投稿文作成アプリ',
    lang:'ja',start_url:'./?source=home-screen',scope:'./',display:'standalone',orientation:'portrait',
    background_color:branding.themeColor,theme_color:branding.themeColor,
    icons:[
      {src:icon192,sizes:'192x192',type:'image/png',purpose:'any maskable'},
      {src:icon512,sizes:'512x512',type:'image/png',purpose:'any maskable'}
    ]
  };
  const manifestUrl=URL.createObjectURL(new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'}));
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
