const PUBLICATION_WAITING_CODE='notOpen';
const CREATION_PENDING_CODE='notCreated';

const BUSINESS_ENDED_CODE='businessEnded';
const BUSINESS_END_ADVANCE_MINUTES=180;
const RESERVATION_TIME_ZONE='Asia/Tokyo';

function reservationTokyoDateTime(value){
  const date=value instanceof Date?value:new Date(value||Date.now());
  if(Number.isNaN(date.getTime()))return null;

  const values={};
  new Intl.DateTimeFormat('en-CA',{
    timeZone:RESERVATION_TIME_ZONE,
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
    hourCycle:'h23'
  }).formatToParts(date).forEach(part=>{
    if(part.type!=='literal')values[part.type]=part.value;
  });

  if(!values.year||!values.month||!values.day)return null;
  return {
    date:`${values.year}-${values.month}-${values.day}`,
    minutes:Number(values.hour||0)*60+Number(values.minute||0)
  };
}

function reservationClockMinutes(value){
  const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!match)return null;
  return Number(match[1])*60+Number(match[2]);
}

function reservationLatestBusinessEnd(day){
  const values=(Array.isArray(day?.slots)?day.slots:[])
    .map(slot=>{
      const explicitEnd=reservationClockMinutes(slot?.end);
      if(explicitEnd!==null)return explicitEnd;
      const start=reservationClockMinutes(slot?.start);
      const duration=Number(slot?.durationMinutes);
      return start!==null&&Number.isFinite(duration)?start+duration:null;
    })
    .filter(Number.isFinite);

  return values.length?Math.max(...values):null;
}

function reservationShouldShowBusinessEnded(day,data){
  if(day?.status?.code!==PUBLICATION_WAITING_CODE)return false;

  const fetched=reservationTokyoDateTime(data?.fetchedAt);
  if(!fetched||fetched.date!==day?.date)return false;

  const businessEnd=reservationLatestBusinessEnd(day);
  if(businessEnd===null)return false;

  return fetched.minutes>=Math.max(0,businessEnd-BUSINESS_END_ADVANCE_MINUTES);
}

function reservationBusinessEndLabel(day){
  const end=reservationLatestBusinessEnd(day);
  if(end===null)return '';
  return `${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`;
}

function reservationRgbValues(value){
  const match=String(value||'').match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i
  );
  if(!match)return null;
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4]===undefined?1:Number(match[4])
  ];
}

function reservationLooksAvailableColor(value){
  const rgb=reservationRgbValues(value);
  if(!rgb)return false;
  const [red,green,blue,alpha]=rgb;
  if(alpha===0)return false;
  return green>=215&&blue>=220&&red<=225&&(green-red>=5||blue-red>=8);
}

function reservationLooksWaitingColor(value){
  const rgb=reservationRgbValues(value);
  if(!rgb)return false;
  const [red,green,blue,alpha]=rgb;
  if(alpha===0)return false;
  const spread=Math.max(red,green,blue)-Math.min(red,green,blue);
  return spread<=12&&red>=165&&red<=235&&green>=165&&green<=235&&blue>=165&&blue<=235;
}

function reservationSlotVisualColors(slot){
  return [
    slot?.backgroundColor,
    ...(Array.isArray(slot?.visualBackgroundColors)?slot.visualBackgroundColors:[])
  ].filter(Boolean);
}

function reservationSlotLooksAvailable(slot){
  const classText=[
    slot?.className,
    slot?.anchorClassName,
    ...(Array.isArray(slot?.parentClasses)?slot.parentClasses:[])
  ].join(' ');

  const classHint=
    /(^|\s)is-label\d+(\s|$)/i.test(classText)||
    /(^|\s)(available|reservable|selectable|bookable)(\s|$)/i.test(classText);
  const colorHint=reservationSlotVisualColors(slot).some(reservationLooksAvailableColor);

  return classHint||colorHint||slot?.availableClassHint===true||slot?.availableColorHint===true;
}

function reservationSlotLooksWaiting(slot){
  const colors=reservationSlotVisualColors(slot);
  return (
    slot?.publicationWaiting===true||
    slot?.waitingColorHint===true||
    colors.some(reservationLooksWaitingColor)
  );
}

function normalizeReservationStatusAvailability(data){
  if(!data||!Array.isArray(data.days))return data;

  data.days.forEach(day=>{
    const slots=Array.isArray(day?.slots)?day.slots:[];
    let hasAvailable=false;
    let hasPublicationWaiting=false;
    let allDefinitelyFull=slots.length>0;

    slots.forEach(slot=>{
      const remaining=Number(slot?.remaining);
      const positiveRemaining=Number.isFinite(remaining)&&remaining>0;
      const definitelyFull=remaining===0||(slot?.full===true&&!positiveRemaining);

      const visuallyAvailable=positiveRemaining&&reservationSlotLooksAvailable(slot);
      const visuallyWaiting=positiveRemaining&&reservationSlotLooksWaiting(slot);

      if(visuallyAvailable){
        slot.full=false;
        slot.clickable=true;
        slot.publicationWaiting=false;
        slot.detectionReason=slot.detectionReason||'app-available-visual';
        hasAvailable=true;
        allDefinitelyFull=false;
      }else if(
        positiveRemaining&&
        (
          visuallyWaiting||
          slot?.publicationWaiting===true||
          slot?.clickable!==true
        )
      ){
        slot.full=false;
        slot.clickable=false;
        slot.publicationWaiting=true;
        slot.detectionReason=slot.detectionReason||'app-waiting-fallback';
        hasPublicationWaiting=true;
        allDefinitelyFull=false;
      }else if(positiveRemaining&&slot?.clickable===true){
        slot.full=false;
        slot.publicationWaiting=false;
        hasAvailable=true;
        allDefinitelyFull=false;
      }else if(!definitelyFull){
        allDefinitelyFull=false;
      }
    });

    day.availableSlots=slots.filter(slot=>
      slot?.full!==true&&
      Number(slot?.remaining)!==0&&
      slot?.clickable===true
    );

    if(hasAvailable){
      day.status={
        code:'available',
        label:'空きあり',
        reason:'選択可能な予約枠があります。'
      };
    }else if(hasPublicationWaiting){
      day.status={
        code:PUBLICATION_WAITING_CODE,
        label:'予約枠公開前',
        reason:'予約枠は表示されていますが、まだ公開されていません。'
      };
      day.availableSlots=[];
    }else if(allDefinitelyFull&&slots.length){
      day.status={
        code:'full',
        label:'満席',
        reason:'すべての予約枠が満席です。'
      };
    }else if(day.status?.code===PUBLICATION_WAITING_CODE){
      day.status.label='予約枠公開前';
      day.status.reason='予約枠は表示されていますが、まだ公開されていません。';
    }else if(day.status?.code===CREATION_PENDING_CODE){
      day.status.label='予約枠作成前';
      day.status.reason='この週は予約時間枠がまだ作成されていません。';
    }

    if(reservationShouldShowBusinessEnded(day,data)){
      const endLabel=reservationBusinessEndLabel(day);
      day.status={
        code:BUSINESS_ENDED_CODE,
        label:'営業終了',
        reason:endLabel
          ?`当日の予約受付時間を過ぎています（最終枠終了 ${endLabel}）。`
          :'当日の予約受付時間を過ぎています。'
      };
      day.availableSlots=[];
    }
  });

  // Compatibility with data obtained before Worker v1.3.0:
  // a complete later seven-day page that is empty/notVisible is known to be
  // the Air Reserve week whose time slots have not yet been created.
  const sorted=[...data.days].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  for(let index=0;index<sorted.length;index+=7){
    const week=sorted.slice(index,index+7);
    if(week.length<7)continue;

    const allEmpty=week.every(day=>!Array.isArray(day?.slots)||day.slots.length===0);
    const hasNotVisible=week.some(day=>day?.status?.code==='notVisible');
    const compatibleCodes=week.every(day=>
      ['notVisible','noSlots',CREATION_PENDING_CODE].includes(day?.status?.code)
    );

    if(allEmpty&&hasNotVisible&&compatibleCodes){
      week.forEach(day=>{
        day.status={
          code:CREATION_PENDING_CODE,
          label:'予約枠作成前',
          reason:'この週は予約時間枠がまだ作成されていません。'
        };
        day.slots=[];
        day.availableSlots=[];
      });
    }
  }

  return data;
}

const originalApplyLiveAvailabilityStatusFix=applyLiveAvailability;
applyLiveAvailability=function(data,source='direct'){
  return originalApplyLiveAvailabilityStatusFix(
    normalizeReservationStatusAvailability(data),
    source
  );
};

const originalLoadAvailabilityStatusFix=loadAvailability;
loadAvailability=async function(resetSelection=false){
  await originalLoadAvailabilityStatusFix(resetSelection);
  if(availability){
    normalizeReservationStatusAvailability(availability);
    renderReservations(resetSelection);
  }
};

const originalReserveBandStatusFix=reserveBand;
reserveBand=function(day){
  if(day?.status?.code===PUBLICATION_WAITING_CODE){
    return {code:'not-open',label:'予約枠公開前'};
  }
  if(day?.status?.code===CREATION_PENDING_CODE){
    return {code:'not-created',label:'予約枠作成前'};
  }
  if(day?.status?.code===BUSINESS_ENDED_CODE){
    return {code:'business-ended',label:'営業終了'};
  }
  return originalReserveBandStatusFix(day);
};

function applySpecialReservationRows(){
  const list=$('reserveList');
  if(!list)return;

  list.querySelectorAll('[data-reserve-date]').forEach(input=>{
    const day=findDay(input.dataset.reserveDate);
    const publicationWaiting=day?.status?.code===PUBLICATION_WAITING_CODE;
    const creationPending=day?.status?.code===CREATION_PENDING_CODE;
    const businessEnded=day?.status?.code===BUSINESS_ENDED_CODE;
    const row=input.closest('.reserve-day');
    if(!row)return;

    row.classList.toggle('publication-waiting',publicationWaiting);
    row.classList.toggle('creation-pending',creationPending);
    row.classList.toggle('business-ended',businessEnded);

    const state=row.querySelector('.reserve-state');
    const detail=row.querySelector('.reserve-slots');

    if(businessEnded){
      if(state){
        state.textContent='営業終了';
        state.className='reserve-state business-ended';
      }
      if(detail)detail.textContent='本日の予約受付は終了しました';
      input.checked=false;
      input.disabled=true;
      selectedReserveDates.delete(input.dataset.reserveDate);
      return;
    }

    if(publicationWaiting){
      if(state){
        state.textContent='予約枠公開前';
        state.className='reserve-state not-open';
      }
      if(detail)detail.textContent='予約枠はまだ公開されていません';
      return;
    }

    if(creationPending){
      if(state){
        state.textContent='予約枠作成前';
        state.className='reserve-state not-created';
      }
      if(detail)detail.textContent='予約時間枠はまだ作成されていません';
    }
  });
}

const originalRenderReservationsStatusFix=renderReservations;
renderReservations=function(resetSelection=false){
  originalRenderReservationsStatusFix(resetSelection);
  applySpecialReservationRows();
};

const originalRenderMenuDateStatusStatusFix=renderMenuDateStatus;
renderMenuDateStatus=function(){
  const box=$('menuDateStatus');
  const ctx=getPostContext();

  if(
    box &&
    !availabilityLoading &&
    availability?.ok &&
    ctx.selectedMenuDay?.status?.code===BUSINESS_ENDED_CODE
  ){
    box.className='menu-date-status business-ended';
    box.innerHTML=`<div class="menu-date-status-top"><strong>${formatDate(ctx.selectedMenuDate,true)}の営業状況</strong><span class="menu-date-badge business-ended">営業終了</span></div><span>本日の予約受付は終了しました。</span>`;
    return;
  }

  if(
    box &&
    !availabilityLoading &&
    availability?.ok &&
    ctx.selectedMenuDay?.status?.code===PUBLICATION_WAITING_CODE
  ){
    box.className='menu-date-status publication-waiting';
    box.innerHTML=`<div class="menu-date-status-top"><strong>${formatDate(ctx.selectedMenuDate,true)}の営業予定</strong><span class="menu-date-badge publication-waiting">予約枠公開前</span></div><span>営業予定ですが、Airリザーブの予約枠はまだ公開されていません。</span>`;
    return;
  }

  if(
    box &&
    !availabilityLoading &&
    availability?.ok &&
    ctx.selectedMenuDay?.status?.code===CREATION_PENDING_CODE
  ){
    box.className='menu-date-status creation-pending';
    box.innerHTML=`<div class="menu-date-status-top"><strong>${formatDate(ctx.selectedMenuDate,true)}の予約状況</strong><span class="menu-date-badge creation-pending">予約枠作成前</span></div><span>Airリザーブの予約時間枠はまだ作成されていません。</span>`;
    return;
  }

  originalRenderMenuDateStatusStatusFix();
};
