/* v4.10.4 X向け投稿文自動調整
 * X公式の weightedLength を使用:
 * 目標 220〜250 / 最大 270（X上限280に対して10の安全余白）
 */
const POST_X_TARGET_MIN=220;
const POST_X_TARGET_MAX=250;
const POST_X_HARD_MAX=270;
const POST_X_IDEAL=235;

function xPostWeightedLength(text){
  return window.twitterText.parseTweet(String(text||'')).weightedLength;
}

function xPostDistanceToTarget(weight){
  if(weight<POST_X_TARGET_MIN)return POST_X_TARGET_MIN-weight;
  if(weight>POST_X_TARGET_MAX)return weight-POST_X_TARGET_MAX;
  return 0;
}

function takeFirstSentences(text,count=1){
  const source=String(text||'').trim();
  if(!source)return '';
  const parts=source.match(/[^。！？\n]+[。！？]?/g)||[source];
  return parts.slice(0,count).join('').trim();
}

function compactWeatherForX(text){
  return takeFirstSentences(text,1)
    .replace(/^今日は/,'')
    .replace(/皆さまのご来店をお待ちしております。?$/,'')
    .trim();
}

function compactReservationForX(text){
  const firstLine=String(text||'').split('\n')[0];
  return firstLine
    .replace(/午前・午後ともにご案内できるお時間が残りわずかとなっております/g,'午前・午後ともに残りわずかです')
    .replace(/午前・午後ともに、まだご案内できるお時間がございます/g,'午前・午後ともに空きがございます')
    .replace(/午前・午後ともに、比較的ゆったりとご案内できます/g,'午前・午後ともに比較的ゆったりご案内できます')
    .replace(/ご案内できるお時間が残りわずかとなっております/g,'空きが残りわずかです')
    .replace(/まだご案内できるお時間がございます/g,'まだ空きがございます')
    .replace(/比較的ゆったりとご利用いただけます/g,'比較的ゆったりご利用いただけます')
    .replace(/比較的ゆったりとご案内できます/g,'比較的ゆったりご案内できます')
    .replace(/満席となっております/g,'満席です')
    .replace(/ご案内しております/g,'ご案内します')
    .trim();
}

function truncateBlockToXWeight(text,maxWeight,suffix='…'){
  const source=String(text||'').trim();
  if(!source||xPostWeightedLength(source)<=maxWeight)return source;
  const chars=Array.from(source);
  let low=0;
  let high=chars.length;
  while(low<high){
    const mid=Math.ceil((low+high)/2);
    const candidate=chars.slice(0,mid).join('').trimEnd()+suffix;
    if(xPostWeightedLength(candidate)<=maxWeight)low=mid;
    else high=mid-1;
  }
  let result=chars.slice(0,low).join('').trimEnd();
  const sentenceEnd=Math.max(
    result.lastIndexOf('。'),
    result.lastIndexOf('！'),
    result.lastIndexOf('？'),
    result.lastIndexOf('\n')
  );
  if(sentenceEnd>=Math.floor(result.length*.58))result=result.slice(0,sentenceEnd+1).trimEnd();
  else result+=suffix;
  return result;
}

function compactLimitedForX(text){
  return truncateBlockToXWeight(text,72);
}

function compactClosingForX(ctx){
  if(ctx.holidayMode)return `${holidayVisitLabel(ctx)}のご来店をお待ちしております。`;
  return 'ご来店をお待ちしております。';
}

function joinPostParts(parts){
  const lines=[];
  for(const part of parts){
    if(part===null||part===undefined)continue;
    const text=String(part).trim();
    if(!text)continue;
    if(lines.length&&lines[lines.length-1]!=='')lines.push('');
    lines.push(text);
  }
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

function buildXPostCandidate(content,mode){
  const parts=[content.displayDate];

  if(content.holidayIntro.length){
    parts.push(content.holidayIntro.join('\n'));
  }else if(mode.opening==='full'&&content.opening){
    parts.push(content.opening);
  }

  parts.push(content.menu);

  if(mode.weather==='full'&&content.weather)parts.push(content.weather);
  if(mode.weather==='compact'&&content.weather)parts.push(compactWeatherForX(content.weather));

  const reservationLines=mode.reservation==='full'
    ?content.reservationLines
    :content.reservationLines.map(compactReservationForX);
  if(reservationLines.length)parts.push(reservationLines.join('\n'));

  if(content.limited){
    parts.push(mode.limited==='full'?content.limited:compactLimitedForX(content.limited));
  }

  if(mode.latest==='full')parts.push('最新状況は予約ページよりご確認ください。');
  if(mode.latest==='compact')parts.push('最新状況は予約ページをご確認ください。');

  parts.push(mode.closing==='full'?content.closing:compactClosingForX(content.ctx));
  return joinPostParts(parts);
}

function chooseBestXPostCandidate(content){
  const candidates=[];
  const openings=['full'];
  const weathers=['full','compact','none'];
  const reservations=['full','compact'];
  const limitedModes=content.limited?['full','compact']:['none'];
  const latestModes=['full','compact','none'];
  const closings=['full','compact'];

  for(const opening of openings){
    for(const weather of weathers){
      for(const reservation of reservations){
        for(const limited of limitedModes){
          for(const latest of latestModes){
            for(const closing of closings){
              const mode={opening,weather,reservation,limited,latest,closing};
              const text=buildXPostCandidate(content,mode);
              const weight=xPostWeightedLength(text);
              const informationScore=
                (opening==='full'?1:0)+
                (weather==='full'?4:weather==='compact'?2:0)+
                (reservation==='full'?7:5)+
                (limited==='full'?6:limited==='compact'?5:0)+
                (latest==='full'?2:latest==='compact'?1:0)+
                (closing==='full'?2:1);
              candidates.push({text,weight,informationScore,mode});
            }
          }
        }
      }
    }
  }

  const unique=[...new Map(candidates.map(item=>[item.text,item])).values()];
  const valid=unique.filter(item=>item.weight<=POST_X_HARD_MAX);
  const target=valid.filter(item=>item.weight>=POST_X_TARGET_MIN&&item.weight<=POST_X_TARGET_MAX);

  if(target.length){
    target.sort((a,b)=>
      b.informationScore-a.informationScore||
      Math.abs(a.weight-POST_X_IDEAL)-Math.abs(b.weight-POST_X_IDEAL)
    );
    const best=target[0];
    return {...best,summarized:
      best.mode.weather!=='full'||
      best.mode.reservation!=='full'||
      best.mode.limited==='compact'||
      best.mode.opening!=='full'
    };
  }

  if(valid.length){
    valid.sort((a,b)=>
      xPostDistanceToTarget(a.weight)-xPostDistanceToTarget(b.weight)||
      b.informationScore-a.informationScore||
      Math.abs(a.weight-POST_X_IDEAL)-Math.abs(b.weight-POST_X_IDEAL)
    );
    let selected={...valid[0],summarized:true};

    if(selected.weight<POST_X_TARGET_MIN){
      const fillers=[
        '店内でゆっくり喫茶時間をお過ごしください。',
        'お近くへお越しの際は、ぜひお立ち寄りください。',
        '皆さまのご来店を心よりお待ちしております。'
      ];
      let text=selected.text;
      for(const filler of fillers){
        const next=joinPostParts([text,filler]);
        const weight=xPostWeightedLength(next);
        if(weight<=POST_X_TARGET_MAX){
          text=next;
          selected.weight=weight;
          if(weight>=POST_X_TARGET_MIN)break;
        }
      }
      selected.text=text;
    }
    return selected;
  }

  const shortest=unique.sort((a,b)=>a.weight-b.weight)[0];
  const text=truncateBlockToXWeight(shortest.text,POST_X_HARD_MAX);
  return {text,weight:xPostWeightedLength(text),informationScore:0,mode:shortest.mode,summarized:true};
}

function updateXPostCharacterCount(){
  const text=currentPostText();
  const weightedLength=xPostWeightedLength(text);
  const counter=$('charCount');
  let note='';

  if(weightedLength<POST_X_TARGET_MIN){
    note=`目標まであと${POST_X_TARGET_MIN-weightedLength}`;
  }else if(weightedLength<=POST_X_TARGET_MAX){
    note='目標範囲';
  }else if(weightedLength<=POST_X_HARD_MAX){
    note='やや長め';
  }else{
    note=`${weightedLength-POST_X_HARD_MAX}オーバー`;
  }

  counter.textContent=`Xカウント ${weightedLength} / ${POST_X_HARD_MAX}（${note}）`;
  counter.setAttribute('aria-label',`X公式カウント ${weightedLength}。目標${POST_X_TARGET_MIN}から${POST_X_TARGET_MAX}、最大${POST_X_HARD_MAX}`);
  counter.classList.toggle('is-near-limit',weightedLength>POST_X_TARGET_MAX&&weightedLength<=POST_X_HARD_MAX);
  counter.classList.toggle('is-over-limit',weightedLength>POST_X_HARD_MAX);

  const empty=!text.trim();
  $('copy').disabled=empty;
  $('openX').disabled=empty||weightedLength>POST_X_HARD_MAX;
}

function generateXPost(options={}){
  if(postTextEdited&&options?.force!==true)return;

  const ctx=getPostContext();
  const displayDate=ctx.holidayMode?formatDate(ctx.postDate):formatDate(ctx.effectiveMenuDate);
  const menu=buildMenuLine(selectedMenus());
  const opening=buildDateAwareOpening(ctx);
  const weather=applyEmoji(buildWeatherText(),'weather');
  const limited=$('limitedInfo').value.trim();
  const reservationLines=buildReservationLines().map(text=>applyEmoji(text,'reserve'));
  const closing=buildClosing(ctx);
  const holidayIntro=buildHolidayIntroduction(ctx);

  const result=chooseBestXPostCandidate({
    ctx,
    displayDate,
    menu,
    opening,
    weather,
    limited,
    reservationLines,
    closing,
    holidayIntro
  });

  $('preview').value=result.text;
  postTextEdited=false;
  updateXPostCharacterCount();
  const time=new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
  $('generatedAt').textContent=`更新 ${time}${result.summarized?'／X向け自動調整':''}`;
}

function instagramReservationParagraph(){
  const lines=buildReservationLines();
  if(!lines.length)return '';
  return lines.join('\n');
}

function instagramMenuParagraph(menu){
  if(!menu||menu==='メニューをご用意しております'){
    return '本日のメニューをご用意しております。';
  }
  return `本日は\n${menu}\nをご用意しております。`;
}

function instagramSeasonalLine(){
  const weather=buildWeatherText();
  if(!weather)return '';
  return applyEmoji(weather,'weather');
}

function instagramHashtags(ctx){
  const tags=['#和洋喫茶レモンの木','#津市カフェ','#三重カフェ'];
  const menus=selectedMenus();
  if((menus.ice||[]).length)tags.push('#かき氷');
  if((menus.bread||[]).length)tags.push('#厚焼き玉子サンド');
  if((menus.dessert||[]).length)tags.push('#喫茶店スイーツ');
  return tags.join(' ');
}

function buildInstagramClosing(ctx){
  if(ctx.holidayMode)return buildClosing(ctx);
  const variants=[
    'ご予約、ご来店をお待ちしております。',
    '皆さまのご来店をお待ちしております。',
    'どうぞゆっくりとお過ごしください。'
  ];
  return applyEmoji(pick(variants,1),'close');
}

function generateInstagramPost(options={}){
  if(postTextEdited&&options?.force!==true)return;

  const ctx=getPostContext();
  const displayDate=ctx.holidayMode?formatDate(ctx.postDate,true):formatDate(ctx.effectiveMenuDate,true);
  const opening=buildDateAwareOpening(ctx);
  const holidayIntro=buildHolidayIntroduction(ctx);
  const menu=instagramMenuParagraph(buildMenuLine(selectedMenus()));
  const weather=instagramSeasonalLine();
  const reservation=instagramReservationParagraph();
  const limited=$('limitedInfo').value.trim();
  const closing=buildInstagramClosing(ctx);

  const parts=[displayDate];
  if(holidayIntro.length)parts.push('',...holidayIntro);
  else if(opening)parts.push('',opening);
  parts.push('',menu);
  if(limited)parts.push('',limited);
  if(weather)parts.push('',weather);
  if(reservation)parts.push('',reservation);
  parts.push(
    '',
    'ご予約はプロフィール記載の予約ページよりご確認ください。',
    closing,
    '',
    instagramHashtags(ctx)
  );

  $('preview').value=parts.filter((part,index,array)=>!(
    part===''&&index>0&&array[index-1]===''
  )).join('\n');
  postTextEdited=false;
  updateInstagramCharacterCount();
  const time=new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
  $('generatedAt').textContent=`更新 ${time}／Instagram用`;
}

function updateInstagramCharacterCount(){
  const text=currentPostText();
  const length=[...text].length;
  const counter=$('charCount');
  counter.textContent=`Instagram文字数 ${length} / 2,200`;
  counter.setAttribute('aria-label',`Instagram文字数 ${length} / 2200`);
  counter.classList.toggle('is-near-limit',length>=1800&&length<=2200);
  counter.classList.toggle('is-over-limit',length>2200);
  const empty=!text.trim();
  $('copy').disabled=empty;
  $('openX').disabled=empty;
}

function updatePostCharacterCount(){
  if(activePostPlatform==='instagram')updateInstagramCharacterCount();
  else updateXPostCharacterCount();
}

function generatePost(options={}){
  if(activePostPlatform==='instagram')generateInstagramPost(options);
  else generateXPost(options);
}

