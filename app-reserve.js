function findDay(date){
  return availability?.days?.find(day=>day.date===date)||null;
}

function isBusinessDay(day){
  return !!day&&['available','full','notOpen'].includes(day.status?.code);
}

function isClosedDay(day){
  return day?.status?.code==='noSlots';
}

function isSelectable(day){
  return !!day&&['available','full'].includes(day.status?.code);
}

function sortedAvailabilityDays(){
  return [...(availability?.days||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}

function findNextBusinessDay(afterDate){
  return sortedAvailabilityDays().find(day=>day.date>afterDate&&isBusinessDay(day))||null;
}

function dayDistance(from,to){
  const [fy,fm,fd]=from.split('-').map(Number);
  const [ty,tm,td]=to.split('-').map(Number);
  return Math.round((Date.UTC(ty,tm-1,td)-Date.UTC(fy,fm-1,fd))/86400000);
}

function getPostContext(){
  const postDate=$('postDate')?.value||localIso();
  const selectedMenuDate=$('menuDate')?.value||postDate;
  const postDay=findDay(postDate);
  const selectedMenuDay=findDay(selectedMenuDate);
  const postClosed=isClosedDay(postDay);
  const menuClosed=isClosedDay(selectedMenuDay);
  let closedDate=null;
  if(menuClosed)closedDate=selectedMenuDate;
  else if(postClosed)closedDate=postDate;
  let nextBusiness=null;
  if(menuClosed)nextBusiness=findNextBusinessDay(selectedMenuDate);
  else if(postClosed)nextBusiness=findNextBusinessDay(postDate);
  const effectiveMenuDate=menuClosed?(nextBusiness?.date||selectedMenuDate):selectedMenuDate;
  return {
    postDate,
    selectedMenuDate,
    effectiveMenuDate,
    postDay,
    selectedMenuDay,
    postClosed,
    menuClosed,
    closedDate,
    nextBusiness,
    holidayMode:postClosed||menuClosed
  };
}

function relativeMenuDateText(postDate,date){
  const distance=dayDistance(postDate,date);
  if(distance===1)return `明日${formatDate(date,true)}`;
  if(distance===2)return `明後日${formatDate(date,true)}`;
  return `次回営業日${formatDate(date,true)}`;
}

function renderMenuDateStatus(){
  const box=$('menuDateStatus');
  if(!box)return;
  const ctx=getPostContext();
  if(availabilityLoading){
    box.className='menu-date-status loading';
    box.innerHTML='<strong>営業日を確認中です</strong><span>Airリザーブの予約枠を読み込んでいます。</span>';
    return;
  }
  if(!availability?.ok){
    box.className='menu-date-status error';
    box.innerHTML='<strong>営業日を判定できません</strong><span>予約状況を取得できないため、日付を確認して投稿してください。</span>';
    return;
  }
  if(ctx.menuClosed){
    const next=ctx.nextBusiness;
    box.className='menu-date-status closed';
    box.innerHTML=`<div class="menu-date-status-top"><strong>${formatDate(ctx.selectedMenuDate,true)}は定休日です</strong><span class="menu-date-badge closed">定休日</span></div><span>${next?`${relativeMenuDateText(ctx.postDate,next.date)}のメニュー投稿として自動で作成します。`:'取得範囲内に次回営業日が見つかりません。'}</span>${next?`<span class="next-business">次回営業日：${formatDate(next.date,true)}（${esc(next.status?.label||'営業日')}）</span>`:''}`;
    return;
  }
  if(ctx.postClosed){
    const next=ctx.nextBusiness;
    box.className='menu-date-status closed';
    box.innerHTML=`<div class="menu-date-status-top"><strong>${ctx.postDate===localIso()?'本日':formatDate(ctx.postDate,true)}は定休日です</strong><span class="menu-date-badge closed">定休日投稿</span></div><span>${next?`${relativeMenuDateText(ctx.postDate,ctx.effectiveMenuDate)}のメニューを案内します。`:'メニュー対象日の内容で定休日投稿を作成します。'}</span>`;
    return;
  }
  if(isBusinessDay(ctx.selectedMenuDay)){
    box.className='menu-date-status open';
    box.innerHTML=`<div class="menu-date-status-top"><strong>${formatDate(ctx.selectedMenuDate,true)}の営業メニュー</strong><span class="menu-date-badge open">営業日</span></div><span>通常の営業日投稿として作成します。</span>`;
    return;
  }
  box.className='menu-date-status neutral';
  box.innerHTML='<strong>営業日判定なし</strong><span>この日付は取得範囲外です。予約ページで営業日をご確認ください。</span>';
}

function uniqueSlotsFrom(source){
  const map=new Map();
  for(const slot of source||[]){
    const key=`${slot.start}|${slot.end}|${slot.durationMinutes}`;
    if(!map.has(key))map.set(key,slot);
  }
  return [...map.values()];
}

function uniqueAllSlots(day){
  const slots=Array.isArray(day?.slots)&&day.slots.length?day.slots:day?.availableSlots;
  return uniqueSlotsFrom(slots);
}

function uniqueAvailableSlots(day){
  return uniqueSlotsFrom(day?.availableSlots||[]);
}

function totalRemainingFromSlots(slots){
  const values=slots.map(slot=>Number(slot.remaining)).filter(value=>Number.isFinite(value)&&value>0);
  if(values.length)return values.reduce((sum,value)=>sum+value,0);
  return slots.filter(slot=>slot.full!==true&&slot.clickable!==false).length;
}

function totalRemaining(day){
  return totalRemainingFromSlots(uniqueAvailableSlots(day));
}

function slotStartMinutes(slot){
  const match=String(slot?.start||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!match)return null;
  return Number(match[1])*60+Number(match[2]);
}

function periodSlots(day,period,availableOnly=false){
  const source=availableOnly?uniqueAvailableSlots(day):uniqueAllSlots(day);
  return source.filter(slot=>{
    const start=slotStartMinutes(slot);
    if(start===null)return false;
    return period==='morning'?start<12*60:start>=12*60;
  });
}

function periodAvailability(day,period){
  const slots=periodSlots(day,period);
  if(!slots.length)return {code:'no-slots',label:'予約枠なし',remaining:0,slots:[]};
  const available=slots.filter(slot=>{
    const remaining=Number(slot.remaining);
    if(Number.isFinite(remaining))return remaining>0;
    return slot.full!==true&&slot.clickable!==false;
  });
  if(!available.length)return {code:'full',label:'満席',remaining:0,slots};
  const remaining=totalRemainingFromSlots(available);
  if(remaining<=3)return {code:'few',label:'残りわずか',remaining,slots};
  if(remaining<=8)return {code:'some',label:'まだ空きあり',remaining,slots};
  return {code:'plenty',label:'比較的余裕あり',remaining,slots};
}

function reserveBand(day){
  if(!day)return {code:'error',label:'取得結果なし'};
  if(day.status?.code==='full')return {code:'full',label:'満席'};
  if(day.status?.code==='noSlots')return {code:'no-slots',label:'定休日'};
  if(day.status?.code==='notOpen')return {code:'not-open',label:'受付開始前'};
  if(day.status?.code!=='available')return {code:'error',label:day.status?.label||'判定保留'};
  const remaining=totalRemaining(day);
  if(remaining<=3)return {code:'few',label:'残り枠わずか'};
  if(remaining<=8)return {code:'some',label:'まだ空きあり'};
  return {code:'plenty',label:'比較的余裕あり'};
}

function slotSummary(day){
  const slots=uniqueAvailableSlots(day);
  if(!slots.length)return '';
  return slots.map(slot=>`${slot.start}〜${slot.end}（${slot.durationMinutes}分枠）`).join('、');
}

function slotSummaryByPeriod(day){
  const groups=[
    ['午前',periodSlots(day,'morning',true)],
    ['午後',periodSlots(day,'afternoon',true)]
  ];
  return groups
    .filter(([,slots])=>slots.length)
    .map(([label,slots])=>`空き時間（${label}）：${slots.map(slot=>`${slot.start}〜${slot.end}`).join('、')}`);
}

function periodDetail(day,period,label){
  const state=periodAvailability(day,period);
  if(state.code==='no-slots')return `${label}：予約枠なし`;
  if(state.code==='full')return `${label}：満席`;
  return `${label}：残り${state.remaining}枠（${state.label}）`;
}

function reservationBaseDate(){
  return getPostContext().effectiveMenuDate;
}

function renderReservations(resetSelection=false){
  const ctx=getPostContext();
  const base=reservationBaseDate();
  const postDate=ctx.postDate;
  const dates=[0,1,2,3].map(i=>addDays(base,i));
  if(resetSelection){
    selectedReserveDates.clear();
    const first=findDay(base);
    if(isSelectable(first))selectedReserveDates.add(base);
  }
  const list=$('reserveList');
  list.innerHTML='';
  dates.forEach((date,index)=>{
    const day=findDay(date);
    const selectable=isSelectable(day);
    if(!selectable)selectedReserveDates.delete(date);
    const row=document.createElement('label');
    row.className='reserve-day'+(selectable?'':' disabled')+(day?.status?.code==='noSlots'?' closed-day':'');
    const checked=selectedReserveDates.has(date);
    const band=reserveBand(day);
    let detail='';
    if(['available','full'].includes(day?.status?.code)){
      detail=[
        periodDetail(day,'morning','午前'),
        periodDetail(day,'afternoon','午後')
      ].join('／');
    }else if(day?.status?.code==='noSlots'){
      detail='予約枠がないため定休日として扱います';
    }else if(day?.status?.code==='notOpen'){
      detail='予約受付開始前です';
    }else{
      detail='この日付の取得結果がありません';
    }
    const dateNotes=[];
    if(index===0)dateNotes.push(ctx.holidayMode?'次回営業日':'対象日');
    if(date===postDate)dateNotes.push('投稿日');
    row.innerHTML=`<input type="checkbox" data-reserve-date="${date}" ${checked?'checked':''} ${selectable?'':'disabled'}><div class="reserve-day-main"><div class="reserve-day-top"><span class="reserve-date">${formatDate(date,true)}${dateNotes.length?` ${dateNotes.join('・')}`:''}</span><span class="reserve-state ${band.code}">${esc(band.label)}</span></div><div class="reserve-slots">${esc(detail)}</div></div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-reserve-date]').forEach(input=>input.addEventListener('change',()=>{
    if(input.checked)selectedReserveDates.add(input.dataset.reserveDate);
    else selectedReserveDates.delete(input.dataset.reserveDate);
    updateTodayOption();
    generatePost();
  }));
  renderMenuDateStatus();
  updateTodayOption();
  updateReserveHeader();
  updateWeatherDisplay();
  generatePost();
}

function updateTodayOption(){
  const postDate=$('postDate').value;
  const show=selectedReserveDates.has(postDate)&&findDay(postDate)?.status?.code==='available';
  $('todayTimeOption').hidden=!show;
}

function updateReserveHeader(){
  const badge=$('reserveBadge');
  const selected=[...selectedReserveDates];
  if(availabilityLoading){
    $('reserveTitle').textContent='予約状況を取得中です';
    badge.textContent='取得中';
    badge.className='status-pill loading';
    return;
  }
  if(!availability?.ok){
    $('reserveTitle').textContent='予約状況を取得できませんでした';
    badge.textContent='取得失敗';
    badge.className='status-pill error';
    return;
  }
  const ctx=getPostContext();
  const count=selected.length;
  $('reserveTitle').textContent=ctx.holidayMode
    ?(count?`定休日投稿に${count}日分の予約状況を使用します`:'次回営業日の予約状況を選択してください')
    :(count?`${count}日分を投稿文に使用します`:'掲載する日を選択してください');
  badge.textContent=ctx.holidayMode?'定休日投稿':'実データ';
  badge.className=ctx.holidayMode?'status-pill holiday':'status-pill';
  if(availability.fetchedAt){
    const date=new Date(availability.fetchedAt);
    $('fetchTime').textContent=`取得：${date.toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`;
  }
}

async function loadAvailability(resetSelection=false){
  availabilityLoading=true;
  updateReserveHeader();
  renderMenuDateStatus();
  $('reserveMessage').textContent='Airリザーブの取得結果を読み込んでいます。';
  $('reserveMessage').className='note';
  try{
    const res=await fetch(`data/availability.json?t=${Date.now()}`,{cache:'no-store'});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(!data?.ok||!Array.isArray(data.days))throw new Error('取得データが不正です');
    availability=data;
    $('reserveMessage').textContent='予約状況を読み込みました。午前・午後に分けて判定します。';
    $('reserveMessage').className='note';
    const age=Date.now()-new Date(data.fetchedAt).getTime();
    if(Number.isFinite(age)&&age>2*60*60*1000){
      $('reserveMessage').textContent='取得から2時間以上経過しています。投稿前に最新データへ更新されているか確認してください。';
      $('reserveMessage').className='note warning-note';
    }
  }catch(e){
    availability=null;
    selectedReserveDates.clear();
    $('reserveMessage').textContent='予約状況を読み込めませんでした。通信状態を確認して再度お試しください。';
    $('reserveMessage').className='note error-note';
  }finally{
    availabilityLoading=false;
    renderReservations(resetSelection);
  }
}

function periodSentence(state,label){
  if(state.code==='full')return `${label}は満席となっております`;
  if(state.code==='few')return `${label}は残りわずかとなっております`;
  if(state.code==='some')return `${label}はまだご案内できるお時間がございます`;
  if(state.code==='plenty')return `${label}は比較的ゆったりとご案内できます`;
  return '';
}

function singlePeriodComment(name,period,state){
  const isMorning=period==='morning';
  if(state.code==='full'){
    return isMorning
      ?`${name}は午前中のみのご案内となり、満席となっております。`
      :`${name}は午後のみのご案内となり、満席となっております。`;
  }
  const intro=isMorning
    ?`${name}は午前中のみのご案内となります。`
    :`${name}は午後よりご案内しております。`;
  if(state.code==='few')return `${intro}ご案内できるお時間が残りわずかとなっております。`;
  if(state.code==='some')return `${intro}ご案内できるお時間がございます。`;
  return `${intro}比較的ゆったりとご利用いただけます。`;
}

function reservationComment(day,name){
  const morning=periodAvailability(day,'morning');
  const afternoon=periodAvailability(day,'afternoon');
  const hasMorning=morning.code!=='no-slots';
  const hasAfternoon=afternoon.code!=='no-slots';

  if(!hasMorning&&!hasAfternoon)return '';
  if(hasMorning&&!hasAfternoon)return singlePeriodComment(name,'morning',morning);
  if(!hasMorning&&hasAfternoon)return singlePeriodComment(name,'afternoon',afternoon);

  if(morning.code===afternoon.code){
    if(morning.code==='full')return `${name}は午前・午後ともに満席となっております。`;
    if(morning.code==='few')return `${name}は午前・午後ともにご案内できるお時間が残りわずかとなっております。`;
    if(morning.code==='some')return `${name}は午前・午後ともに、まだご案内できるお時間がございます。`;
    if(morning.code==='plenty')return `${name}は午前・午後ともに、比較的ゆったりとご案内できます。`;
  }

  const prefix=name==='本日'?'':`${name}の`;
  return `${prefix}${periodSentence(morning,'午前')}が、${periodSentence(afternoon,'午後')}。`;
}

function buildReservationLines(){
  const postDate=$('postDate').value;
  const showPostDateTime=document.querySelector('input[name="todayTime"]:checked')?.value!=='hide';
  const lines=[];
  [...selectedReserveDates].sort().forEach(date=>{
    const day=findDay(date);
    if(!day||!['available','full'].includes(day.status?.code))return;
    const name=date===postDate?'本日':formatDate(date,true);
    let text=reservationComment(day,name);
    if(!text)return;
    if(date===postDate&&showPostDateTime){
      const summaries=slotSummaryByPeriod(day);
      if(summaries.length)text+=`\n${summaries.join('\n')}`;
    }
    lines.push(text);
  });
  return lines;
}

function buildHolidayIntroduction(ctx){
  if(!ctx.holidayMode)return [];
  const closedDate=ctx.closedDate;
  const nextDate=ctx.menuClosed?ctx.nextBusiness?.date:ctx.effectiveMenuDate;
  const closedText=closedDate===ctx.postDate?'本日は定休日です。':`${formatDate(closedDate,true)}は定休日です。`;
  if(!nextDate||nextDate===closedDate)return [closedText,'次回営業日は改めてご案内いたします。'];
  return [closedText,`${relativeMenuDateText(ctx.postDate,nextDate)}のメニューです。`];
}

function setActionsDisabled(disabled){
  $('copy').disabled=disabled;
  $('openX').disabled=disabled;
}

function holidayVisitLabel(ctx){
  const nextDate=ctx.menuClosed?ctx.nextBusiness?.date:ctx.effectiveMenuDate;
  if(!nextDate)return '次回営業日';
  const distance=dayDistance(ctx.postDate,nextDate);
  if(distance===1)return '明日';
  if(distance===2)return '明後日';
  return formatDate(nextDate,true);
}

function buildClosing(ctx){
  if(!ctx.holidayMode)return applyEmoji(pick(learnedPatterns.closings,2),'close');
  const label=holidayVisitLabel(ctx);
  const variants=[
    `${label}のご来店をお待ちしております。`,
    `${label}も皆さまのご来店をお待ちしております。`,
    `${label}はぜひお立ち寄りください。`
  ];
  return applyEmoji(pick(variants,2),'close');
}

function generatePost(){
  const ctx=getPostContext();
  const displayDate=ctx.holidayMode?formatDate(ctx.postDate):formatDate(ctx.effectiveMenuDate);
  const menu=buildMenuLine(selectedMenus());
  const opening=ctx.holidayMode?'':pick(learnedPatterns.openings,1);
  const weather=applyEmoji(buildWeatherText(),'weather');
  const limited=$('limitedInfo').value.trim();
  const reservationLines=buildReservationLines().map(text=>applyEmoji(text,'reserve'));
  const closing=buildClosing(ctx);
  const parts=[displayDate];
  const holidayIntro=buildHolidayIntroduction(ctx);
  if(holidayIntro.length)parts.push('',...holidayIntro);
  else if(opening)parts.push('',opening);
  parts.push('',menu);
  if(weather)parts.push('',weather);
  if(reservationLines.length)parts.push('',...reservationLines);
  if(limited)parts.push('',limited);
  parts.push('','最新状況は予約ページよりご確認ください。',closing);
  const text=parts.join('\n');
  $('preview').textContent=text;
  $('charCount').textContent=text.length+'文字';
  $('generatedAt').textContent='更新 '+new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
  setActionsDisabled(!text.trim());
}

function realtime(){
  clearTimeout(inputTimer);
  inputTimer=setTimeout(generatePost,220);
}
