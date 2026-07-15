const DIRECT_REFRESH_CONFIG={
  workerUrl:'https://divine-smoke-b143.mail-skgc.workers.dev',
  timeoutMs:15*1000,
  offsets:'0,1,2,3'
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
  return $('menuDate')?.value||$('postDate')?.value||localIso();
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
      const timeoutError=new Error('直接取得が15秒以内に完了しませんでした。');
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
        days:'4'
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
  const time=Number.isNaN(fetched.getTime())?'取得時刻不明':fetched.toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const duration=Number(data.clientDurationMs||data.durationMs);
  const durationText=Number.isFinite(duration)?`・${(duration/1000).toFixed(1)}秒` : '';
  const sourceText=source==='direct'?'直接取得':'予備取得';
  $('reserveMessage').textContent=`エアリザーブを${sourceText}しました。取得：${time}${durationText}`;
  $('reserveMessage').className='note live-success-note';
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

async function refreshLiveAvailability(){
  if(liveRefreshRunning)return;
  liveRefreshRunning=true;
  setLiveRefreshDisabled(true);
  availabilityLoading=true;
  updateReserveHeader();
  liveStatus('Cloudflareでエアリザーブを直接確認しています…','loading');

  try{
    const directData=await fetchAvailabilityFromWorker();
    applyLiveAvailability(directData,'direct');
    const seconds=((directData.clientDurationMs||directData.durationMs||0)/1000).toFixed(1);
    liveStatus(`最新状況への更新が完了しました（${seconds}秒）。`,'success');
  }catch(directError){
    console.error('Direct Airリザーブ fetch failed',directError);
    const token=getLiveToken();
    if(!token){
      throw new Error(`${directError.message} 予備取得を使う場合はGitHubトークンを設定してください。`);
    }
    liveStatus('直接取得に失敗したため、予備取得へ切り替えています…','warning');
    const fallbackData=await refreshViaGithubFallback(token);
    applyLiveAvailability(fallbackData,'fallback');
    liveStatus('予備取得で最新状況へ更新しました。','success');
  }finally{
    liveRefreshRunning=false;
    setLiveRefreshDisabled(false);
  }
}

const originalRefreshLiveAvailability=refreshLiveAvailability;
refreshLiveAvailability=async function(){
  try{
    await originalRefreshLiveAvailability();
  }catch(error){
    availabilityLoading=false;
    updateReserveHeader();
    renderMenuDateStatus();
    liveStatus(explainLiveRefreshError(error),'error');
    $('reserveMessage').textContent='最新状況を取得できませんでした。保存済みデータは変更していません。';
    $('reserveMessage').className='note error-note';
    console.error(error);
  }
};
