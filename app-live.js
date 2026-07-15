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
  if(input&&getLiveToken())input.placeholder='設定済みです。変更するときだけ入力してください';
  liveStatus(getLiveToken()?'今すぐ取得を使用できます。':'初回のみGitHub更新用トークンを設定してください。',getLiveToken()?'ready':'neutral');
}

function saveLiveRefreshSettings(){
  const input=$('githubActionsToken');
  const remember=$('rememberGithubToken');
  const token=input?.value.trim()||getLiveToken();
  if(!token){
    liveStatus('GitHub更新用トークンを入力してください。','error');
    return;
  }
  if(!/^(github_pat_|ghp_)/.test(token)){
    liveStatus('トークンの形式を確認してください。fine-grained tokenを推奨します。','warning');
    return;
  }
  setLiveToken(token,!!remember?.checked);
  if(input){
    input.value='';
    input.placeholder='設定済みです。変更するときだけ入力してください';
  }
  const details=$('liveRefreshSettings');
  if(details)details.open=false;
  liveStatus(remember?.checked?'この端末に設定を保存しました。':'このブラウザーを閉じるまで設定を保持します。','success');
}

function forgetLiveRefreshToken(){
  clearLiveToken();
  const input=$('githubActionsToken');
  const remember=$('rememberGithubToken');
  if(input){input.value='';input.placeholder='github_pat_ から始まるトークン';}
  if(remember)remember.checked=false;
  liveStatus('設定を削除しました。','neutral');
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

async function triggerLiveWorkflow(token){
  const cfg=LIVE_REFRESH_CONFIG;
  const triggeredAt=Date.now();
  const requestId=`live-${triggeredAt}-${Math.random().toString(36).slice(2,8)}`;
  const data=await githubApi(`/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${encodeURIComponent(cfg.workflow)}/dispatches`,{
    method:'POST',
    token,
    body:{
      ref:cfg.ref,
      inputs:{
        start_date:$('postDate')?.value||localIso(),
        days:'4',
        request_id:requestId
      }
    }
  });
  return {
    triggeredAt,
    requestId,
    runId:data?.workflow_run_id||null,
    runUrl:data?.html_url||''
  };
}

async function findDispatchedRun(token,triggeredAt,requestId){
  const cfg=LIVE_REFRESH_CONFIG;
  const earliest=triggeredAt-15000;
  for(let attempt=0;attempt<12;attempt+=1){
    const data=await githubApi(`/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${encodeURIComponent(cfg.workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(cfg.ref)}&per_page=10`,{token});
    const runs=data?.workflow_runs||[];
    const run=runs.find(item=>item.display_title===requestId)
      ||runs.find(item=>new Date(item.created_at).getTime()>=earliest);
    if(run)return {runId:run.id,runUrl:run.html_url||''};
    liveStatus('取得処理の開始を待っています…','loading');
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
      const error=new Error(`取得処理が${run.conclusion||'失敗'}で終了しました。`);
      error.runUrl=run.html_url||runUrl;
      throw error;
    }
    const elapsed=Math.max(0,Math.round((Date.now()-started)/1000));
    const stage=run.status==='queued'?'開始待ち':'エアリザーブを確認中';
    liveStatus(`${stage}です… ${elapsed}秒`,'loading');
    await sleep(cfg.pollIntervalMs);
  }
  const error=new Error('4分以内に取得が完了しませんでした。GitHub Actionsの状態を確認してください。');
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
  if(!data?.content)throw new Error('最新の予約データを読み込めませんでした。');
  const availabilityData=JSON.parse(decodeGithubBase64(data.content));
  if(!availabilityData?.ok||!Array.isArray(availabilityData.days))throw new Error('取得した予約データの形式が正しくありません。');
  return availabilityData;
}

function applyLiveAvailability(data){
  availability=data;
  availabilityLoading=false;
  selectedReserveDates.clear();
  const base=reservationBaseDate();
  if(isSelectable(findDay(base)))selectedReserveDates.add(base);
  renderReservations(false);
  const fetched=new Date(data.fetchedAt);
  const time=Number.isNaN(fetched.getTime())?'取得時刻不明':fetched.toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  $('reserveMessage').textContent=`エアリザーブを今すぐ確認しました。取得：${time}`;
  $('reserveMessage').className='note live-success-note';
}

function explainLiveRefreshError(error){
  if(error?.status===401)return 'トークンが正しくないか、有効期限が切れています。';
  if(error?.status===403)return 'トークンに「Actions: Read and write」の権限がありません。';
  if(error?.status===404)return '対象リポジトリまたは取得ワークフローを確認できません。';
  return error?.message||'リアルタイム取得に失敗しました。';
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
  const token=getLiveToken();
  if(!token){
    const details=$('liveRefreshSettings');
    if(details)details.open=true;
    $('githubActionsToken')?.focus();
    liveStatus('初回設定を完了してから、もう一度押してください。','warning');
    return;
  }

  liveRefreshRunning=true;
  setLiveRefreshDisabled(true);
  availabilityLoading=true;
  updateReserveHeader();
  liveStatus('GitHub Actionsへ取得を依頼しています…','loading');

  try{
    let dispatch=await triggerLiveWorkflow(token);
    if(!dispatch.runId){
      const found=await findDispatchedRun(token,dispatch.triggeredAt,dispatch.requestId);
      dispatch={...dispatch,...found};
    }
    await waitForWorkflow(token,dispatch.runId,dispatch.runUrl);
    liveStatus('最新の予約データを読み込んでいます…','loading');
    const data=await fetchAvailabilityFromGithub();
    applyLiveAvailability(data);
    liveStatus('最新状況への更新が完了しました。','success');
  }catch(error){
    availabilityLoading=false;
    updateReserveHeader();
    renderMenuDateStatus();
    liveStatus(explainLiveRefreshError(error),'error');
    $('reserveMessage').textContent=error?.runUrl
      ?'取得処理を確認してください。GitHub Actionsへのリンクは初回設定欄から開けます。'
      :'リアルタイム取得に失敗しました。設定と通信状態を確認してください。';
    $('reserveMessage').className='note error-note';
    console.error(error);
  }finally{
    liveRefreshRunning=false;
    setLiveRefreshDisabled(false);
  }
}
