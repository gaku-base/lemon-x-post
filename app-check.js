const AVAILABILITY_CHECK_DAYS_PER_PAGE=7;
let availabilityCheckPage=0;

function checkMinutes(value){
  const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!match)return null;
  return Number(match[1])*60+Number(match[2]);
}

function checkDateLabel(iso){
  if(!iso)return '日付不明';
  const [year,month,day]=String(iso).split('-').map(Number);
  const date=new Date(year,month-1,day);
  if(Number.isNaN(date.getTime()))return iso;
  return `${month}/${day}（${'日月火水木金土'[date.getDay()]}）`;
}

function sortedCheckSlots(day){
  return [...(day?.slots||[])].sort((a,b)=>{
    const aStart=checkMinutes(a.start)??9999;
    const bStart=checkMinutes(b.start)??9999;
    if(aStart!==bStart)return aStart-bStart;
    return Number(a.durationMinutes||0)-Number(b.durationMinutes||0);
  });
}

function checkSlotState(slot){
  const remaining=Number(slot?.remaining);
  const positiveRemaining=Number.isFinite(remaining)&&remaining>0;
  if(positiveRemaining&&slot?.clickable!==true)return 'waiting';
  if(remaining===0||(slot?.full===true&&!positiveRemaining))return 'full';
  if(slot?.clickable===true)return 'available';
  return 'waiting';
}

function assignCheckLanes(slots){
  const laneEnds=[];
  const assigned=[];
  for(const slot of slots){
    const start=checkMinutes(slot.start)??0;
    const end=checkMinutes(slot.end)??(start+Number(slot.durationMinutes||0));
    let lane=laneEnds.findIndex(value=>value<=start);
    if(lane<0){lane=laneEnds.length;laneEnds.push(end)}else laneEnds[lane]=end;
    assigned.push({...slot,__lane:lane});
  }
  const laneCount=Math.max(1,laneEnds.length);
  return assigned.map(slot=>({...slot,__laneCount:laneCount}));
}

function checkAvailabilityDays(){
  return [...(availability?.days||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}

function checkAvailabilityPages(){
  const days=checkAvailabilityDays();
  const pages=[];
  for(let index=0;index<days.length;index+=AVAILABILITY_CHECK_DAYS_PER_PAGE){
    pages.push(days.slice(index,index+AVAILABILITY_CHECK_DAYS_PER_PAGE));
  }
  return pages;
}

function checkTimeRange(days){
  const values=[];
  days.forEach(day=>sortedCheckSlots(day).forEach(slot=>{
    const start=checkMinutes(slot.start);
    const end=checkMinutes(slot.end);
    if(start!==null)values.push(start);
    if(end!==null)values.push(end);
  }));
  if(!values.length)return {start:10*60,end:17*60};
  const min=Math.min(...values);
  const max=Math.max(...values);
  return {
    start:Math.min(10*60,Math.floor(min/60)*60),
    end:Math.max(17*60,Math.ceil(max/60)*60)
  };
}

function renderAvailabilityCheckTabs(pages){
  const tabs=$('availabilityCheckTabs');
  if(!tabs)return;
  tabs.innerHTML='';
  pages.forEach((days,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='availability-check-tab'+(index===availabilityCheckPage?' active':'');
    const first=days[0]?.date;
    const last=days.at(-1)?.date;
    button.textContent=first&&last?`${formatDate(first)}〜${formatDate(last)}`:`期間${index+1}`;
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected',String(index===availabilityCheckPage));
    button.onclick=()=>{
      availabilityCheckPage=index;
      renderAvailabilityCheck();
    };
    tabs.appendChild(button);
  });
}

function makeCheckSlot(slot,range,pxPerMinute){
  const start=checkMinutes(slot.start);
  if(start===null)return null;
  const duration=Math.max(20,Number(slot.durationMinutes)||75);
  const state=checkSlotState(slot);
  const element=document.createElement('div');
  element.className=`availability-check-slot ${state}`;
  const top=(start-range.start)*pxPerMinute;
  const height=Math.max(42,duration*pxPerMinute-2);
  const laneCount=Math.max(1,slot.__laneCount||1);
  const lane=Math.max(0,slot.__lane||0);
  element.style.top=`${top}px`;
  element.style.height=`${height}px`;
  element.style.left=`calc(${lane/laneCount*100}% + 2px)`;
  element.style.width=`calc(${100/laneCount}% - 4px)`;
  const badge=state==='full'?'満':state==='waiting'?'前':'仮';
  const remaining=Number.isFinite(Number(slot.remaining))?`残${Number(slot.remaining)}`:'残—';
  element.innerHTML=`<div class="check-slot-line"><span class="check-slot-badge ${state}">${badge}</span><strong>${esc(slot.start||'--:--')}</strong></div><span>${duration}分</span><em>${esc(remaining)}</em>`;
  element.title=`${slot.start||''}〜${slot.end||''}／${duration}分／${state==='available'?'予約可能':state==='full'?'満席':'予約枠公開前'}／${remaining}`;
  return element;
}

function renderAvailabilityCheckGrid(days){
  const grid=$('availabilityCheckGrid');
  if(!grid)return;
  grid.innerHTML='';
  if(!days.length){
    grid.innerHTML='<div class="availability-check-empty">取得データがありません。「再取得して確認」を押してください。</div>';
    return;
  }
  const range=checkTimeRange(days);
  const pxPerMinute=1.15;
  const bodyHeight=(range.end-range.start)*pxPerMinute;
  const minWidth=72+days.length*126;
  const frame=document.createElement('div');
  frame.className='availability-check-week';
  frame.style.minWidth=`${minWidth}px`;

  const header=document.createElement('div');
  header.className='availability-check-week-header';
  header.style.gridTemplateColumns=`72px repeat(${days.length},minmax(126px,1fr))`;
  header.innerHTML='<div class="availability-check-corner">時間</div>';
  days.forEach(day=>{
    const item=document.createElement('div');
    item.className=`availability-check-day-head ${day.status?.code||'unknown'}`;
    item.innerHTML=`<strong>${esc(checkDateLabel(day.date))}</strong><span>${esc(day.status?.label||'判定なし')}</span>`;
    header.appendChild(item);
  });
  frame.appendChild(header);

  const body=document.createElement('div');
  body.className='availability-check-week-body';
  body.style.gridTemplateColumns=`72px repeat(${days.length},minmax(126px,1fr))`;
  body.style.height=`${bodyHeight}px`;

  const axis=document.createElement('div');
  axis.className='availability-check-time-axis';
  axis.style.height=`${bodyHeight}px`;
  for(let minute=range.start;minute<=range.end;minute+=60){
    const label=document.createElement('span');
    label.style.top=`${(minute-range.start)*pxPerMinute}px`;
    label.textContent=`${String(Math.floor(minute/60)).padStart(2,'0')}:00`;
    axis.appendChild(label);
  }
  body.appendChild(axis);

  days.forEach(day=>{
    const column=document.createElement('div');
    column.className=`availability-check-day-column ${day.status?.code||'unknown'}`;
    column.style.height=`${bodyHeight}px`;
    column.style.setProperty('--hour-height',`${60*pxPerMinute}px`);
    const slots=assignCheckLanes(sortedCheckSlots(day));
    if(!slots.length){
      const empty=document.createElement('div');
      empty.className='availability-check-no-slots';
      if(day.status?.code==='notCreated')empty.textContent='予約枠作成前';
      else if(day.status?.code==='noSlots')empty.textContent='予約枠なし';
      else empty.textContent='取得枠なし';
      column.appendChild(empty);
    }else{
      slots.forEach(slot=>{
        const item=makeCheckSlot(slot,range,pxPerMinute);
        if(item)column.appendChild(item);
      });
    }
    body.appendChild(column);
  });
  frame.appendChild(body);
  grid.appendChild(frame);
}

function availabilityCheckSummaryText(){
  const lines=[];
  lines.push('Airリザーブ取得チェック');
  if(availability?.fetchedAt)lines.push(`取得時刻：${formatLiveDateTime(availability.fetchedAt)}`);
  if(availability?.workerVersion)lines.push(`Worker：v${availability.workerVersion}`);
  lines.push('');
  checkAvailabilityDays().forEach(day=>{
    lines.push(`${checkDateLabel(day.date)}　${day.status?.label||'判定なし'}`);
    const slots=sortedCheckSlots(day);
    if(!slots.length){
      lines.push(
        day.status?.code==='notCreated'
          ?'  予約時間枠はまだ作成されていません'
          :'  予約枠なし'
      );
    }else{
      slots.forEach(slot=>{
        const state=checkSlotState(slot);
        const stateText=state==='available'?'予約可能':state==='full'?'満席':'予約枠公開前';
        const remaining=Number.isFinite(Number(slot.remaining))?`残${Number(slot.remaining)}`:'残—';
        lines.push(`  ${slot.start||'--:--'}〜${slot.end||'--:--'} ${slot.durationMinutes||'—'}分 ${stateText} ${remaining}`);
      });
    }
  });
  return lines.join('\n');
}

function renderAvailabilityCheck(){
  const pages=checkAvailabilityPages();
  if(availabilityCheckPage>=pages.length)availabilityCheckPage=Math.max(0,pages.length-1);
  renderAvailabilityCheckTabs(pages);
  renderAvailabilityCheckGrid(pages[availabilityCheckPage]||[]);
  const meta=$('availabilityCheckMeta');
  if(meta){
    if(!availability?.ok){
      meta.textContent='予約データを取得できていません。';
      meta.className='availability-check-meta error';
    }else{
      const slotCount=checkAvailabilityDays().reduce((sum,day)=>sum+(day.slots?.length||0),0);
      const duration=Number(availability.clientDurationMs||availability.durationMs);
      const durationText=Number.isFinite(duration)?`／取得 ${(duration/1000).toFixed(1)}秒`:'';
      meta.textContent=`${checkAvailabilityDays().length}日分・全${slotCount}枠／最終 ${formatLiveDateTime(availability.fetchedAt)}${durationText}`;
      meta.className='availability-check-meta';
    }
  }
}

function openAvailabilityCheck(){
  const modal=$('availabilityCheckModal');
  if(!modal)return;
  renderAvailabilityCheck();
  modal.hidden=false;
  document.body.classList.add('availability-check-open');
}

function closeAvailabilityCheck(){
  const modal=$('availabilityCheckModal');
  if(!modal)return;
  modal.hidden=true;
  document.body.classList.remove('availability-check-open');
}

function installAvailabilityCheck(){
  $('openAvailabilityCheck')?.addEventListener('click',openAvailabilityCheck);
  $('closeAvailabilityCheck')?.addEventListener('click',closeAvailabilityCheck);
  $('availabilityCheckModal')?.addEventListener('click',event=>{
    if(event.target===$('availabilityCheckModal'))closeAvailabilityCheck();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!$('availabilityCheckModal')?.hidden)closeAvailabilityCheck();
  });
  $('refreshAvailabilityCheck')?.addEventListener('click',async()=>{
    const button=$('refreshAvailabilityCheck');
    button.disabled=true;
    button.textContent='取得中…';
    try{
      await refreshLiveAvailability({reason:'manual'});
      renderAvailabilityCheck();
    }finally{
      button.disabled=false;
      button.textContent='再取得して確認';
    }
  });
  $('copyAvailabilityCheck')?.addEventListener('click',async()=>{
    const text=availabilityCheckSummaryText();
    try{
      await navigator.clipboard.writeText(text);
      const button=$('copyAvailabilityCheck');
      const original=button.textContent;
      button.textContent='コピーしました';
      setTimeout(()=>button.textContent=original,1400);
    }catch(error){
      alert('確認内容をコピーできませんでした。');
    }
  });

  if(typeof uniqueSlotsFrom==='function'){
    const originalUniqueSlotsFrom=uniqueSlotsFrom;
    uniqueSlotsFrom=function(source){
      return originalUniqueSlotsFrom(source).sort((a,b)=>(checkMinutes(a.start)??9999)-(checkMinutes(b.start)??9999));
    };
  }

  if(typeof applyLiveAvailability==='function'){
    const originalApplyLiveAvailability=applyLiveAvailability;
    applyLiveAvailability=function(data,source='direct'){
      const result=originalApplyLiveAvailability(data,source);
      if(!$('availabilityCheckModal')?.hidden)renderAvailabilityCheck();
      return result;
    };
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAvailabilityCheck,{once:true});
else installAvailabilityCheck();
