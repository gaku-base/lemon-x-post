const PUBLICATION_WAITING_CODE='notOpen';

function normalizePublicationWaitingAvailability(data){
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

      if(positiveRemaining&&slot?.clickable!==true){
        slot.full=false;
        slot.publicationWaiting=true;
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

    if(hasAvailable){
      if(day.status?.code!=='available'){
        day.status={
          code:'available',
          label:'空きあり',
          reason:'選択可能な予約枠があります。'
        };
      }
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
    }
  });
  return data;
}

const originalApplyLiveAvailabilityPublicationFix=applyLiveAvailability;
applyLiveAvailability=function(data,source='direct'){
  return originalApplyLiveAvailabilityPublicationFix(
    normalizePublicationWaitingAvailability(data),
    source
  );
};

const originalLoadAvailabilityPublicationFix=loadAvailability;
loadAvailability=async function(resetSelection=false){
  await originalLoadAvailabilityPublicationFix(resetSelection);
  if(availability){
    normalizePublicationWaitingAvailability(availability);
    renderReservations(resetSelection);
  }
};

const originalReserveBandPublicationFix=reserveBand;
reserveBand=function(day){
  if(day?.status?.code===PUBLICATION_WAITING_CODE){
    return {code:'not-open',label:'予約枠公開前'};
  }
  return originalReserveBandPublicationFix(day);
};

function applyPublicationWaitingRows(){
  const list=$('reserveList');
  if(!list)return;
  list.querySelectorAll('[data-reserve-date]').forEach(input=>{
    const day=findDay(input.dataset.reserveDate);
    const waiting=day?.status?.code===PUBLICATION_WAITING_CODE;
    const row=input.closest('.reserve-day');
    if(!row)return;
    row.classList.toggle('publication-waiting',waiting);
    if(!waiting)return;

    const state=row.querySelector('.reserve-state');
    const detail=row.querySelector('.reserve-slots');
    if(state){
      state.textContent='予約枠公開前';
      state.className='reserve-state not-open';
    }
    if(detail)detail.textContent='予約枠はまだ公開されていません';
  });
}

const originalRenderReservationsPublicationFix=renderReservations;
renderReservations=function(resetSelection=false){
  originalRenderReservationsPublicationFix(resetSelection);
  applyPublicationWaitingRows();
};

const originalRenderMenuDateStatusPublicationFix=renderMenuDateStatus;
renderMenuDateStatus=function(){
  const box=$('menuDateStatus');
  const ctx=getPostContext();
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
  originalRenderMenuDateStatusPublicationFix();
};
