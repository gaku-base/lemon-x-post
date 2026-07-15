const TSU_WEATHER={latitude:34.7186,longitude:136.5055,timezone:'Asia/Tokyo'};
function weatherCodeLabel(code){if([0].includes(code))return '快晴';if([1].includes(code))return '晴れ';if([2].includes(code))return '一部くもり';if([3,45,48].includes(code))return 'くもり';if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return '雨';if([71,73,75,77,85,86].includes(code))return '雪';if([95,96,99].includes(code))return '雷雨';return '天気'}
function weatherKind(data){const code=Number(data?.weatherCode);const max=Number(data?.maxTemp);if([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(code))return 'rain';if(Number.isFinite(max)&&max>=35)return 'veryhot';if(Number.isFinite(max)&&max>=30)return 'hot';if(Number.isFinite(max)&&max<=20)return 'cool';if([0,1].includes(code))return 'sunny';return 'cloudy'}
function weatherMenuHint(){const groups=typeof selectedMenus==='function'?selectedMenus():{};if((groups.ice||[]).length)return '冷たいかき氷';if((groups.dessert||[]).length)return '甘いものとお飲み物';if((groups.bread||[]).length)return '軽食や喫茶メニュー';return '季節のメニュー'}
function updateWeatherDisplay(){const mode=$('weatherMode').value;const badge=$('weatherBadge');const title=$('weatherTitle');const detail=$('weatherDetail');const holiday=typeof getPostContext==='function'&&getPostContext().holidayMode;if(mode!=='auto'){title.textContent='天気は手動設定を使用します';detail.textContent=`投稿文には「${$('weatherMode').selectedOptions[0].textContent}」に合う営業案内を反映します。`;badge.textContent='手動';badge.className='weather-pill manual';return}if(weatherLoading){title.textContent='投稿日の津市の天気を取得中です';detail.textContent='';badge.textContent='取得中';badge.className='weather-pill loading';return}if(!weatherForecast){title.textContent='投稿日の天気を取得できませんでした';detail.textContent='天気の使用方法から手動設定を選べます。';badge.textContent='取得失敗';badge.className='weather-pill error';return}title.textContent=`${formatDate(weatherForecast.date,true)} 津市の天気`;const values=[];values.push(weatherCodeLabel(weatherForecast.weatherCode));if(Number.isFinite(weatherForecast.maxTemp))values.push(`最高${Math.round(weatherForecast.maxTemp)}℃`);if(Number.isFinite(weatherForecast.minTemp))values.push(`最低${Math.round(weatherForecast.minTemp)}℃`);if(Number.isFinite(weatherForecast.precipProbability))values.push(`降水確率${Math.round(weatherForecast.precipProbability)}%`);detail.textContent=values.join('・')+(holiday?'／定休日投稿では天気文を自動で省略します。':'／営業案内向けの自然な文章に整えます。');badge.textContent=holiday?'自動省略':'自動取得';badge.className=holiday?'weather-pill manual':'weather-pill'}
async function loadWeather(force=false){const date=$('postDate').value;if(!date)return;if(!force&&weatherForecast?.date===date){updateWeatherDisplay();generatePost();return}weatherLoading=true;weatherForecast=null;updateWeatherDisplay();generatePost();try{const params=new URLSearchParams({latitude:String(TSU_WEATHER.latitude),longitude:String(TSU_WEATHER.longitude),daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',timezone:TSU_WEATHER.timezone,forecast_days:'16'});const res=await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();const index=data?.daily?.time?.indexOf(date);if(index<0)throw new Error('投稿日が予報範囲外です');weatherForecast={date,weatherCode:Number(data.daily.weather_code?.[index]),maxTemp:Number(data.daily.temperature_2m_max?.[index]),minTemp:Number(data.daily.temperature_2m_min?.[index]),precipProbability:Number(data.daily.precipitation_probability_max?.[index])}}catch(e){weatherForecast=null}finally{weatherLoading=false;updateWeatherDisplay();generatePost()}}
function manualWeatherText(mode){const templates={
sunny:['今日は気持ちのよいお天気になりそうです。店内でゆっくり、メニューをお楽しみください。','穏やかなお天気になりそうです。ひと息つきに、ぜひお立ち寄りください。'],
hot:['今日は暑い一日になりそうです。冷たいメニューでひと息つきに、ぜひお立ち寄りください。','暑さの合間に、店内でゆっくり涼んでいきませんか。'],
veryhot:['今日も厳しい暑さになりそうです。冷たいメニューをご用意してお待ちしております。','暑さの厳しい一日になりそうです。どうぞ無理のないよう、涼みにお立ち寄りください。'],
rain:['今日は雨の予報です。店内でゆっくりお過ごしいただけるメニューをご用意しています。お足元にお気を付けてお越しください。','雨の一日になりそうです。ほっとひと息つく時間を過ごしに、ぜひお立ち寄りください。'],
cloudy:['今日は雲の多い一日になりそうです。店内でゆっくり喫茶時間をお楽しみください。','少し落ち着いたお天気になりそうです。ひと休みにぜひお立ち寄りください。'],
cool:['今日は少し過ごしやすい一日になりそうです。ゆっくり喫茶時間をお楽しみください。','心地よく過ごせそうな一日です。メニューをご用意してお待ちしております。'],
none:['']};return pick(templates[mode]||templates.none)}
function buildWeatherText(){const mode=$('weatherMode').value;const holiday=typeof getPostContext==='function'&&getPostContext().holidayMode;if(mode==='none'||(holiday&&mode==='auto'))return '';if(mode!=='auto')return manualWeatherText(mode);if(!weatherForecast||weatherForecast.date!==$('postDate').value)return '';const kind=weatherKind(weatherForecast);const hint=weatherMenuHint();const max=Number.isFinite(weatherForecast.maxTemp)?Math.round(weatherForecast.maxTemp):null;const rain=Number.isFinite(weatherForecast.precipProbability)?Math.round(weatherForecast.precipProbability):null;const variants={
rain:[
`今日は雨の予報です。店内でゆっくりお過ごしいただけるよう、${hint}をご用意してお待ちしております。お足元にお気を付けてお越しください。`,
`雨の一日になりそうです。${hint}とともに、ほっとひと息つく時間をお過ごしください。ご来店の際はどうぞお気を付けてお越しください。`,
`${rain!==null&&rain>=60?`降水確率${rain}%で、`:''}雨のお天気になりそうです。店内でゆっくり過ごしに、ぜひお立ち寄りください。`
],
veryhot:[
`今日も厳しい暑さになりそうです。${hint}をご用意してお待ちしております。涼みにお立ち寄りください。`,
`${max!==null?`最高気温${max}℃の予報です。`:''}暑さの合間に、店内でひと休みしませんか。${hint}をご用意しています。`,
`暑さの厳しい一日になりそうです。${hint}で涼みながら、ゆっくりお過ごしください。`
],
hot:[
`今日は暑い一日になりそうです。${hint}でひと息つきに、ぜひお立ち寄りください。`,
`${max!==null?`最高気温${max}℃の予報です。`:''}店内で涼みながら、${hint}をお楽しみください。`,
`日中は気温が上がりそうです。${hint}をご用意して、皆さまのご来店をお待ちしております。`
],
sunny:[
`今日は気持ちのよいお天気になりそうです。${hint}をご用意して、皆さまのご来店をお待ちしております。`,
`穏やかな一日になりそうです。${hint}とともに、ゆっくり喫茶時間をお過ごしください。`,
`お出かけしやすいお天気になりそうです。ひと息つきに、ぜひお立ち寄りください。`
],
cool:[
`今日は少し過ごしやすい一日になりそうです。${hint}とともに、ゆっくり喫茶時間をお過ごしください。`,
`心地よく過ごせそうな一日です。${hint}をご用意してお待ちしております。`,
`少し涼しく感じられそうです。店内でゆっくり、${hint}をお楽しみください。`
],
cloudy:[
`今日は雲の多い一日になりそうです。店内でゆっくり、${hint}をお楽しみください。`,
`少し落ち着いたお天気になりそうです。${hint}とともに、ほっとひと息つきませんか。`,
`曇り空の一日になりそうです。ゆっくり喫茶時間を過ごしに、ぜひお立ち寄りください。`
]};return pick(variants[kind]||variants.cloudy)}
