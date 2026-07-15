function openManage(key){
  activeCat=key;
  $('modal').classList.add('open');
  renderManager();
}

function renderManager(){
  const tabs=$('tabs');
  tabs.innerHTML='';
  Object.entries(store).forEach(([key,cat])=>{
    const button=document.createElement('button');
    button.className='tab'+(key===activeCat?' active':'');
    button.textContent=cat.label;
    button.onclick=()=>{activeCat=key;renderManager()};
    tabs.appendChild(button);
  });
  $('displayCount').value=store[activeCat].displayCount;
  renderList();
}

function renderList(){
  const list=$('menuList');
  list.innerHTML='';
  store[activeCat].items.forEach((item,index)=>{
    const wrap=document.createElement('div');
    wrap.className='swipe-wrap';
    wrap.innerHTML=`<button class="trash" aria-label="削除">🗑</button><div class="manage-item ${item[1]?'':'off'}" data-index="${index}"><div class="drag">≡</div><div class="item-name">${esc(item[0])}</div><div class="state-dot"></div></div>`;
    list.appendChild(wrap);
    setupGestures(wrap,index);
    wrap.querySelector('.trash').onclick=()=>{
      if(confirm(`「${item[0]}」を削除しますか？`)){
        store[activeCat].items.splice(index,1);
        save();
        renderList();
        renderMenus();
        generatePost();
      }
    };
  });
}

function setupGestures(wrap,index){
  const item=wrap.querySelector('.manage-item');
  let startX=0,startY=0,timer=null,drag=false,moved=false;
  item.addEventListener('pointerdown',event=>{
    startX=event.clientX;
    startY=event.clientY;
    moved=false;
    timer=setTimeout(()=>{
      drag=true;
      item.classList.add('dragging');
      item.setPointerCapture(event.pointerId);
    },380);
  });
  item.addEventListener('pointermove',event=>{
    const dx=event.clientX-startX;
    const dy=event.clientY-startY;
    if(Math.abs(dx)>8||Math.abs(dy)>8)moved=true;
    if(drag){
      event.preventDefault();
      const elements=[...$('menuList').querySelectorAll('.manage-item')];
      const target=elements.find(element=>{
        const rect=element.getBoundingClientRect();
        return event.clientY>rect.top&&event.clientY<rect.bottom;
      });
      if(target&&target!==item){
        const from=+item.dataset.index;
        const to=+target.dataset.index;
        const [value]=store[activeCat].items.splice(from,1);
        store[activeCat].items.splice(to,0,value);
        save();
        renderList();
      }
    }else if(dx<-45&&Math.abs(dy)<35){
      wrap.classList.add('swiped');
    }else if(dx>25){
      wrap.classList.remove('swiped');
    }
  });
  function end(){
    clearTimeout(timer);
    if(drag){
      drag=false;
      item.classList.remove('dragging');
      renderMenus();
      generatePost();
      return;
    }
    if(!moved){
      const itemIndex=+item.dataset.index;
      store[activeCat].items[itemIndex][1]=store[activeCat].items[itemIndex][1]?0:1;
      save();
      renderList();
      renderMenus();
      generatePost();
    }
  }
  item.addEventListener('pointerup',end);
  item.addEventListener('pointercancel',()=>{
    clearTimeout(timer);
    drag=false;
    item.classList.remove('dragging');
  });
}

$('closeModal').onclick=()=>$('modal').classList.remove('open');
$('modal').addEventListener('click',event=>{if(event.target===$('modal'))$('modal').classList.remove('open')});
$('displayCount').addEventListener('input',()=>{
  store[activeCat].displayCount=Math.max(1,Math.min(30,+$('displayCount').value||1));
  save();
  renderMenus();
  generatePost();
});
$('addMenu').onclick=()=>{
  const name=$('newMenu').value.trim();
  if(!name)return;
  if(store[activeCat].items.some(item=>item[0]===name)){
    alert('同じメニューが登録されています。');
    return;
  }
  store[activeCat].items.push([name,1]);
  $('newMenu').value='';
  save();
  renderList();
  renderMenus();
  generatePost();
};
$('newMenu').addEventListener('keydown',event=>{if(event.key==='Enter')$('addMenu').click()});

document.querySelectorAll('[data-emoji]').forEach(button=>button.onclick=()=>{
  emojiMode=button.dataset.emoji;
  document.querySelectorAll('[data-emoji]').forEach(item=>item.classList.toggle('active',item===button));
  generatePost();
});

document.querySelectorAll('[data-offset]').forEach(button=>button.onclick=()=>{
  $('menuDate').value=addDays($('postDate').value,+button.dataset.offset);
  syncDateShortcuts();
  renderMenuDateStatus();
  renderReservations(true);
});

document.querySelectorAll('input[name="todayTime"]').forEach(radio=>radio.addEventListener('change',generatePost));
$('generate').onclick=()=>{variant++;generatePost()};
$('postDate').addEventListener('change',()=>{
  syncDateShortcuts();
  renderMenuDateStatus();
  renderReservations(false);
  loadWeather(true);
});
$('menuDate').addEventListener('change',()=>{
  syncDateShortcuts();
  renderMenuDateStatus();
  renderReservations(true);
});
$('weatherMode').addEventListener('change',()=>{updateWeatherDisplay();generatePost()});
$('reloadWeather').onclick=()=>loadWeather(true);
['customMenu','limitedInfo'].forEach(id=>$(id).addEventListener('input',realtime));
$('reloadAvailability').onclick=()=>loadAvailability(false);
$('refreshLiveAvailability').onclick=refreshLiveAvailability;
$('saveLiveRefreshSettings').onclick=saveLiveRefreshSettings;
$('forgetLiveRefreshToken').onclick=forgetLiveRefreshToken;
$('selectAvailable').onclick=()=>{
  selectedReserveDates.clear();
  [0,1,2,3].map(i=>addDays(reservationBaseDate(),i)).forEach(date=>{
    const day=findDay(date);
    if(day?.status?.code==='available')selectedReserveDates.add(date);
  });
  renderReservations(false);
};
$('copy').onclick=async()=>{
  try{
    await navigator.clipboard.writeText($('preview').textContent);
    const button=$('copy');
    const old=button.textContent;
    button.textContent='コピーしました';
    setTimeout(()=>button.textContent=old,1300);
  }catch(e){
    alert('コピーできませんでした。Safariで開いてお試しください。');
  }
};
$('openX').onclick=()=>window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent($('preview').textContent),'_blank');

const today=localIso();
$('postDate').value=today;
$('menuDate').value=today;
renderVersion();
renderMenus();
syncDateShortcuts();
renderMenuDateStatus();
updateWeatherDisplay();
generatePost();
initLiveRefreshSettings();
loadAvailability(true);
loadWeather(true);
