const DIRECT_REFRESH_CONFIG={
  workerUrl:'https://divine-smoke-b143.mail-skgc.workers.dev',
  timeoutMs:40*1000,
  offsets:'0,1,2,3,4,5,6,7,8,9,10,11,12,13'
};

const AUTO_REFRESH_CONFIG={
  intervalMs:3*60*1000,
  idleMs:3*60*1000,
  minimumWorkerVersion:'1.2.0',
  healthTimeoutMs:8*1000
};

const LIVE_REFRESH_CONFIG={
  owner:'gaku-base',
  repo:'lemon-x-post',
  workflow:'airreserve-browser-fetch.yml',
  ref:'main',
  apiVersion:'2026-03-10',
  pollIntervalMs:1000,
  timeoutMs:4*60*1000
};

const LIVE_TOKEN_SESSION_KEY='lemonLiveGithubTokenSession';
const LIVE_TOKEN_LOCAL_KEY='lemonLiveGithubTokenLocal';
let liveRefreshRunning=false;
let autoRefreshInitialized=false;
let autoRefreshSupported=false;
let autoRefreshPaused=true;
let autoRefreshPauseReason='開始準備中';
let autoRefreshTimer=null;
let autoRefreshIdleTimer=null;
let autoRefreshDisplayTimer=null;
let nextAutoRefreshAt=0;
let lastUserActivityAt=Date.now();
let lastLiveFetchAt=null;
let lastLiveFetchDurationMs=null;

function liveStatus(message,type='neutral'){
  const box=$('liveRefreshStatus');
  if(!box)return;
  box.textContent=message;
  box.className=`live-refresh-status ${type}`;
}

function getLiveToken(){
  return sessionStorage.getItem(LIVE_TOKEN_SESSION_KEY)||localStorage.getItem(LIVE_TOKEN_LOCAL_KEY)||'';
}

function hasRememberedLiveToken(){
  return !!localStorage.getItem(LIVE_TOKEN_LOCAL_KEY);
}

function setLiveToken(token,remember){
  sessionStorage.removeItem(LIVE_TOKEN_SESSION_KEY);
  localStorage.removeItem(LIVE_TOKEN_LOCAL_KEY);
  if(remember)localStorage.setItem(LIVE_TOKEN_LOCAL_KEY,token);
  else sessionStorage.setItem(LIVE_TOKEN_SESSION_KEY,token);
}

function clearLiveToken(){
  sessionStorage.removeItem(LIVE_TOKEN_SESSION_KEY);
  localStorage.removeItem(LIVE_TOKEN_LOCAL_KEY);
}

function initLiveRefreshSettings(){
  const remember=$('rememberGithubToken');
  const input=$('githubActionsToken');
  if(remember)remember.checked=hasRememberedLiveToken();
  if(input&&getLiveToken())input.placeholder='予備取得用トークンは設定済みです';
  liveStatus('Cloudflareから直接、最新状況を取得できます。','ready');
}

function saveLiveRefreshSettings(){
  const input=$('githubActionsToken');
  const remember=$('rememberGithubToken');
  const token=input?.value.trim()||getLiveToken();
  if(!token){
    liveStatus('予備取得用のGitHubトークンを入力してください。','error');
    return;
  }
  if(!/^(github_pat_|ghp_)/.test(token)){
    liveStatus('トークンの形式を確認してください。fine-grained tokenを推奨します。','warning');
    return;
  }
  setLiveToken(token,!!remember?.checked);
  if(input){
    input.value='';
    input.placeholder='予備取得用トークンは設定済みです';
  }
  const details=$('liveRefreshSettings');
  if(details)details.open=false;
  liveStatus('予備取得用の設定を保存しました。','success');
}

function forgetLiveRefreshToken(){
  clearLiveToken();
  const input=$('githubActionsToken');
  const remember=$('rememberGithubToken');
  if(input){input.value='';input.placeholder='github_pat_ から始まるトークン';}
  if(remember)remember.checked=false;
  liveStatus('予備取得用の設定を削除しました。通常の直接取得は使用できます。','neutral');
}

function githubHeaders(token){
  return {
    'Accept':'application/vnd.github+json',
    'Authorization':`Bearer ${token}`,
    'X-GitHub-Api-Version':LIVE_REFRESH_CONFIG.apiVersion,
    'Content-Type':'application/json'
  };
}

async function githubApi(path,{method='GET',body=null,token}={}){
  const response=await fetch(`https://api.github.com${path}`,{
    method,
    headers:githubHeaders(token),
    body:body===null?undefined:JSON.stringify(body),
    cache:'no-store'
  });
  const text=await response.text();
  let data=null;
  if(text){
    try{data=JSON.parse(text)}catch{data={message:text}}
  }
  if(!response.ok){
    const error=new Error(data?.message||`GitHub API HTTP ${response.status}`);
    error.status=response.status;
    error.data=data;
    throw error;
  }
  return data;
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

async function githubPublicApi(path){
  const response=await fetch(`https://api.github.com${path}`,{
    headers:{
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':LIVE_REFRESH_CONFIG.apiVersion
    },
    cache:'no-store'
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){
    const error=new Error(data?.message||`GitHub API HTTP ${response.status}`);
    error.status=response.status;
    throw error;
  }
  return data;
}

function directBaseDate(){
  const postDate=$('postDate')?.value||localIso();
  const menuDate=$('menuDate')?.value||postDate;
  return String(postDate)<=String(menuDate)?postDate:menuDate;
}

function formatLiveDateTime(value){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return '不明';
  return date.toLocaleString('ja-JP',{
    month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'
  });
}

function formatClock(value){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return '--:--:--';
  return date.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

function compareVersion(current,minimum){
  const a=String(current||'0').split('.').map(value=>Number(value)||0);
  const b=String(minimum||'0').split('.').map(value=>Number(value)||0);
  const length=Math.max(a.length,b.length);
  for(let index=0;index<length;index+=1){
    const difference=(a[index]||0)-(b[index]||0);
    if(difference!==0)return difference;
  }
  return 0;
}

function setAutoRefreshState(text,type='waiting'){
  const state=$('autoRefreshState');
  const panel=$('autoRefreshInfo');
  if(state)state.textContent=text;
  if(panel)panel.className=`auto-refresh-info ${type}`;

  const compact=$('autoRefreshCompact');
  if(compact){
    const fetched=lastLiveFetchAt?`最終 ${formatClock(lastLiveFetchAt)}`:'まだ取得していません';
    const duration=Number.isFinite(lastLiveFetchDurationMs)?`・${(lastLiveFetchDurationMs/1000).toFixed(1)}秒`:'';
    compact.textContent=`${fetched}${duration}｜${text}`;
    compact.className=`auto-refresh-compact ${type}`;
  }
}

function renderAutoRefreshInfo(){
  const last=$('autoRefreshLastFetched');
  const duration=$('autoRefreshDuration');
  if(last)last.textContent=lastLiveFetchAt?formatLiveDateTime(lastLiveFetchAt):'未取得';
  if(duration)duration.textContent=Number.isFinite(lastLiveFetchDurationMs)
    ?`${(lastLiveFetchDurationMs/1000).toFixed(1)}秒`
    :'—';

  if(liveRefreshRunning){
    setAutoRefreshState('取得中','loading');
    return;
  }
  if(!autoRefreshSupported){
    setAutoRefreshState(autoRefreshPauseReason||'Worker更新待ち','waiting');
    return;
  }
  if(autoRefreshPaused){
    setAutoRefreshState(autoRefreshPauseReason||'停止中','stopped');
    return;
  }
  if(nextAutoRefreshAt){
    setAutoRefreshState(`稼働中（次回 ${formatClock(nextAutoRefreshAt)}頃）`,'running');
    return;
  }
  setAutoRefreshState('稼働中','running');
}

function clearAutoRefreshTimer(){
  if(autoRefreshTimer)clearTimeout(autoRefreshTimer);
  autoRefreshTimer=null;
  nextAutoRefreshAt=0;
}

function clearAutoRefreshIdleTimer(){
  if(autoRefreshIdleTimer)clearTimeout(autoRefreshIdleTimer);
  autoRefreshIdleTimer=null;
}

function pauseAutoRefresh(reason){
  clearAutoRefreshTimer();
  clearAutoRefreshIdleTimer();
  autoRefreshPaused=true;
  autoRefreshPauseReason=reason;
  renderAutoRefreshInfo();
}

function scheduleIdleStop(){
  clearAutoRefreshIdleTimer();
  if(!autoRefreshSupported||autoRefreshPaused||document.hidden)return;
  const remaining=Math.max(0,AUTO_REFRESH_CONFIG.idleMs-(Date.now()-lastUserActivityAt));
  autoRefreshIdleTimer=setTimeout(()=>{
    const idleMs=Date.now()-lastUserActivityAt;
    if(idleMs>=AUTO_REFRESH_CONFIG.idleMs){
      pauseAutoRefresh('無操作のため停止中');
      liveStatus('3分間操作がなかったため、自動更新を停止しました。画面を操作すると再開します。','neutral');
    }else{
      scheduleIdleStop();
    }
  },remaining+50);
}

function scheduleAutoRefresh(delay=AUTO_REFRESH_CONFIG.intervalMs){
  clearAutoRefreshTimer();
  if(!autoRefreshSupported||autoRefreshPaused||document.hidden)return;
  nextAutoRefreshAt=Date.now()+delay;
  autoRefreshTimer=setTimeout(async()=>{
    autoRefreshTimer=null;
    nextAutoRefreshAt=0;
    if(document.hidden){
      pauseAutoRefresh('画面が非表示のため停止中');
      return;
    }
    if(Date.now()-lastUserActivityAt>=AUTO_REFRESH_CONFIG.idleMs){
      pauseAutoRefresh('無操作のため停止中');
      liveStatus('3分間操作がなかったため、自動更新を停止しました。画面を操作すると再開します。','neutral');
      return;
    }
    await refreshLiveAvailability({reason:'auto'});
  },Math.max(0,delay));
  renderAutoRefreshInfo();
}

function resumeAutoRefresh({immediate=true,message=true}={}){
  if(!autoRefreshSupported||document.hidden)return;
  autoRefreshPaused=false;
  autoRefreshPauseReason='';
  lastUserActivityAt=Date.now();
  scheduleIdleStop();
  renderAutoRefreshInfo();
  if(message)liveStatus('操作を検知したため、自動更新を再開しました。','ready');
  if(immediate&&!liveRefreshRunning){
    refreshLiveAvailability({reason:'resume'});
  }else if(!liveRefreshRunning){
    scheduleAutoRefresh();
  }
}

function recordUserActivity(){
  if(!autoRefreshInitialized)return;
  const wasPaused=autoRefreshPaused;
  lastUserActivityAt=Date.now();
  if(autoRefreshSupported&&!document.hidden){
    if(wasPaused)resumeAutoRefresh({immediate:true,message:true});
    else scheduleIdleStop();
  }
}

function installActivityTracking(){
  ['pointerdown','keydown','input','change','touchstart'].forEach(eventName=>{
    document.addEventListener(eventName,recordUserActivity,{passive:true,capture:true});
  });
  window.addEventListener('scroll',recordUserActivity,{passive:true,capture:true});
  window.addEventListener('focus',()=>{
    if(autoRefreshInitialized&&autoRefreshSupported&&!document.hidden){
      resumeAutoRefresh({immediate:true,message:false});
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      pauseAutoRefresh('画面が非表示のため停止中');
    }else if(autoRefreshSupported){
      resumeAutoRefresh({immediate:true,message:false});
    }
  });
}

async function checkWorkerForAutoRefresh(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),AUTO_REFRESH_CONFIG.healthTimeoutMs);
  try{
    const url=new URL('/health',DIRECT_REFRESH_CONFIG.workerUrl);
    url.searchParams.set('_',String(Date.now()));
    const response=await fetch(url.toString(),{
      cache:'no-store',
      signal:controller.signal,
      headers:{'Accept':'application/json'}
    });
    const data=await response.json().catch(()=>null);
    return {
      ok:response.ok&&data?.ok===true,
      version:String(data?.version||'0.0.0'),
      data
    };
  }catch(error){
    return {ok:false,version:'0.0.0',error};
  }finally{
    clearTimeout(timer);
  }
}

async function waitForSavedAvailability(){
  const limit=Date.now()+5000;
  while(availabilityLoading&&Date.now()<limit)await sleep(100);
  if(availability?.fetchedAt&&!lastLiveFetchAt){
    const fetched=new Date(availability.fetchedAt);
    if(!Number.isNaN(fetched.getTime()))lastLiveFetchAt=fetched;
    const duration=Number(availability.clientDurationMs||availability.durationMs);
    if(Number.isFinite(duration))lastLiveFetchDurationMs=duration;
  }
  renderAutoRefreshInfo();
}

async function initAutoLiveRefresh(){
  if(autoRefreshInitialized)return;
  autoRefreshInitialized=true;
  installActivityTracking();
  autoRefreshDisplayTimer=setInterval(renderAutoRefreshInfo,1000);
  renderAutoRefreshInfo();
  await waitForSavedAvailability();

  const health=await checkWorkerForAutoRefresh();
  if(!health.ok){
    autoRefreshSupported=false;
    autoRefreshPauseReason='Workerの確認に失敗しました';
    liveStatus('Cloudflare Workerを確認できないため、自動更新は停止しています。手動更新は利用できます。','warning');
    renderAutoRefreshInfo();
    return;
  }
  if(compareVersion(health.version,AUTO_REFRESH_CONFIG.minimumWorkerVersion)<0){
    autoRefreshSupported=false;
    autoRefreshPauseReason='Worker v1.2.0更新待ち';
    liveStatus('2週間取得対応Workerへ更新後、自動更新が有効になります。手動更新は利用できます。','warning');
    renderAutoRefreshInfo();
    return;
  }

  autoRefreshSupported=true;
  autoRefreshPaused=false;
  autoRefreshPauseReason='';
  lastUserActivityAt=Date.now();
  scheduleIdleStop();
  renderAutoRefreshInfo();
  await refreshLiveAvailability({reason:'startup'});
}

async function fetchAvailabilityFromWorker(){
  const cfg=DIRECT_REFRESH_CONFIG;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),cfg.timeoutMs);
  const started=Date.now();
  const url=new URL('/availability',cfg.workerUrl);
  url.searchParams.set('baseDate',directBaseDate());
  url.searchParams.set('days',cfg.offsets);
  url.searchParams.set('_',String(Date.now()));
  try{
    const response=await fetch(url.toString(),{
      cache:'no-store',
      signal:controller.signal,
      headers:{'Accept':'application/json'}
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok||!Array.isArray(data.days)){
      const error=new Error(data?.error||`Cloudflare Worker HTTP ${response.status}`);
      error.status=response.status;
      error.source='worker';
      throw error;
    }
    data.clientDurationMs=Date.now()-started;
    return data;
  }catch(error){
    if(error?.name==='AbortError'){
      const timeoutError=new Error('直接取得が40秒以内に完了しませんでした。');
      timeoutError.source='worker';
      throw timeoutError;
    }
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

async function triggerLiveWorkflow(token){
  const cfg=LIVE_REFRESH_CONFIG;
  const triggeredAt=Date.now();
  await githubApi(`/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${encodeURIComponent(cfg.workflow)}/dispatches`,{
    method:'POST',
    token,
    body:{
      ref:cfg.ref,
      inputs:{
        start_date:directBaseDate(),
        days:'14'
      }
    }
  });
  return {triggeredAt,runId:null,runUrl:''};
}

async function findDispatchedRun(token,triggeredAt){
  const cfg=LIVE_REFRESH_CONFIG;
  const earliest=triggeredAt-15000;
  for(let attempt=0;attempt<20;attempt+=1){
    const data=await githubApi(`/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${encodeURIComponent(cfg.workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(cfg.ref)}&per_page=10`,{token});
    const run=(data?.workflow_runs||[]).find(item=>new Date(item.created_at).getTime()>=earliest);
    if(run)return {runId:run.id,runUrl:run.html_url||''};
    liveStatus('予備取得の開始を待っています…','loading');
    await sleep(1000);
  }
  throw new Error('GitHub Actionsの実行番号を確認できませんでした。');
}

async function waitForWorkflow(token,runId,runUrl){
  const cfg=LIVE_REFRESH_CONFIG;
  const started=Date.now();
  while(Date.now()-started<cfg.timeoutMs){
    const run=await githubApi(`/repos/${cfg.owner}/${cfg.repo}/actions/runs/${runId}`,{token});
    if(run.status==='completed'){
      if(run.conclusion==='success')return run;
      const error=new Error(`予備取得が${run.conclusion||'失敗'}で終了しました。`);
      error.runUrl=run.html_url||runUrl;
      throw error;
    }
    const elapsed=Math.max(0,Math.round((Date.now()-started)/1000));
    const stage=run.status==='queued'?'予備取得の開始待ち':'予備取得で確認中';
    liveStatus(`${stage}です… ${elapsed}秒`,'loading');
    await sleep(cfg.pollIntervalMs);
  }
  const error=new Error('4分以内に予備取得が完了しませんでした。');
  error.runUrl=runUrl;
  throw error;
}

function decodeGithubBase64(content){
  const binary=atob(String(content||'').replace(/\s+/g,''));
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

async function fetchAvailabilityFromGithub(){
  const cfg=LIVE_REFRESH_CONFIG;
  const data=await githubPublicApi(`/repos/${cfg.owner}/${cfg.repo}/contents/data/availability.json?ref=${encodeURIComponent(cfg.ref)}`);
  if(!data?.content)throw new Error('予備取得した予約データを読み込めませんでした。');
  const availabilityData=JSON.parse(decodeGithubBase64(data.content));
  if(!availabilityData?.ok||!Array.isArray(availabilityData.days))throw new Error('予備取得データの形式が正しくありません。');
  return availabilityData;
}

async function refreshViaGithubFallback(token){
  let dispatch=await triggerLiveWorkflow(token);
  const found=await findDispatchedRun(token,dispatch.triggeredAt);
  dispatch={...dispatch,...found};
  await waitForWorkflow(token,dispatch.runId,dispatch.runUrl);
  liveStatus('予備取得した予約データを読み込んでいます…','loading');
  return await fetchAvailabilityFromGithub();
}

function applyLiveAvailability(data,source='direct'){
  availability=data;
  availabilityLoading=false;
  selectedReserveDates.clear();
  const base=reservationBaseDate();
  if(isSelectable(findDay(base)))selectedReserveDates.add(base);
  renderReservations(false);
  const fetched=new Date(data.fetchedAt);
  const safeFetched=Number.isNaN(fetched.getTime())?new Date():fetched;
  const duration=Number(data.clientDurationMs||data.durationMs);
  lastLiveFetchAt=safeFetched;
  lastLiveFetchDurationMs=Number.isFinite(duration)?duration:null;
  const durationText=Number.isFinite(duration)?`・所要 ${(duration/1000).toFixed(1)}秒`:'';
  const sourceText=source==='direct'?'直接取得':'予備取得';
  $('reserveMessage').textContent=`エアリザーブを${sourceText}しました。最終取得：${formatLiveDateTime(safeFetched)}${durationText}`;
  $('reserveMessage').className='note live-success-note';
  if($('fetchTime'))$('fetchTime').textContent=`取得：${formatLiveDateTime(safeFetched)}`;
  renderAutoRefreshInfo();
}

function explainLiveRefreshError(error){
  if(error?.status===401)return '予備取得用トークンが正しくないか、有効期限が切れています。';
  if(error?.status===403)return '予備取得用トークンに「Actions: Read and write」の権限がありません。';
  if(error?.status===404)return '取得先または取得ワークフローを確認できません。';
  return error?.message||'最新状況の取得に失敗しました。';
}

function setLiveRefreshDisabled(disabled){
  const button=$('refreshLiveAvailability');
  if(button){
    button.disabled=disabled;
    button.textContent=disabled?'エアリザーブを確認中…':'エアリザーブから今すぐ取得';
  }
  if($('reloadAvailability'))$('reloadAvailability').disabled=disabled;
}

function refreshReasonText(reason){
  if(reason==='startup')return '起動時の自動更新';
  if(reason==='auto')return '3分ごとの自動更新';
  if(reason==='resume')return '操作再開時の自動更新';
  return '手動更新';
}

async function refreshLiveAvailability(options={}){
  const reason=typeof options?.reason==='string'?options.reason:'manual';
  if(liveRefreshRunning)return false;
  if(reason==='auto'&&Date.now()-lastUserActivityAt>=AUTO_REFRESH_CONFIG.idleMs){
    pauseAutoRefresh('無操作のため停止中');
    return false;
  }

  liveRefreshRunning=true;
  clearAutoRefreshTimer();
  setLiveRefreshDisabled(true);
  availabilityLoading=true;
  updateReserveHeader();
  renderAutoRefreshInfo();
  liveStatus(`${refreshReasonText(reason)}：Cloudflareでエアリザーブを確認しています…`,'loading');
  let success=false;

  try{
    const directData=await fetchAvailabilityFromWorker();
    applyLiveAvailability(directData,'direct');
    const seconds=((directData.clientDurationMs||directData.durationMs||0)/1000).toFixed(1);
    liveStatus(`最新状況への更新が完了しました（${seconds}秒）。`,'success');
    success=true;
  }catch(directError){
    console.error('Direct Airリザーブ fetch failed',directError);
    const token=getLiveToken();
    if(!token){
      availabilityLoading=false;
      updateReserveHeader();
      renderMenuDateStatus();
      liveStatus(explainLiveRefreshError(new Error(`${directError.message} 予備取得を使う場合はGitHubトークンを設定してください。`)),'error');
      $('reserveMessage').textContent='最新状況を取得できませんでした。保存済みデータは変更していません。';
      $('reserveMessage').className='note error-note';
    }else{
      try{
        liveStatus('直接取得に失敗したため、予備取得へ切り替えています…','warning');
        const fallbackData=await refreshViaGithubFallback(token);
        applyLiveAvailability(fallbackData,'fallback');
        liveStatus('予備取得で最新状況へ更新しました。','success');
        success=true;
      }catch(error){
        availabilityLoading=false;
        updateReserveHeader();
        renderMenuDateStatus();
        liveStatus(explainLiveRefreshError(error),'error');
        $('reserveMessage').textContent='最新状況を取得できませんでした。保存済みデータは変更していません。';
        $('reserveMessage').className='note error-note';
        console.error(error);
      }
    }
  }finally{
    liveRefreshRunning=false;
    setLiveRefreshDisabled(false);
    renderAutoRefreshInfo();
    if(autoRefreshSupported&&!autoRefreshPaused&&!document.hidden){
      scheduleIdleStop();
      scheduleAutoRefresh();
    }
  }
  return success;
}

if(document.readyState==='complete'){
  setTimeout(initAutoLiveRefresh,0);
}else{
  window.addEventListener('load',()=>setTimeout(initAutoLiveRefresh,0),{once:true});
}
