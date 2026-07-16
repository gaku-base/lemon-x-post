const SIMPLE_UI_STORAGE_KEY='lemonUiMode';

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

function initSimpleUi(){
  const saved=localStorage.getItem(SIMPLE_UI_STORAGE_KEY);
  setUiMode(saved==='detail'?'detail':'simple',{save:false});
  $('simpleModeButton')?.addEventListener('click',()=>setUiMode('simple'));
  $('detailModeButton')?.addEventListener('click',()=>setUiMode('detail'));
  $('openMenuManager')?.addEventListener('click',()=>openManage('bread'));

}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initSimpleUi,{once:true});
else initSimpleUi();
