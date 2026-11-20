/* Barefoot Filter Lab v1.1 — browser UI; filtering runs only in a Worker. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const savedKey='barefoot.filterlab.student.code.v1_1';
  const starterCode=`// Second-order resonant low-pass filter (Tustin biquad).
// Try changing zeta and watch the frequency-response peak.
function init() {
  const f0 = 5.0;       // Natural frequency (Hz)
  const zeta = 0.30;    // Damping (< 0.707 gives resonance)
  const K = Math.tan(Math.PI * f0 / params.fs);
  const D = 1 + 2 * zeta * K + K * K;

  memory.b0 = K * K / D;
  memory.b1 = 2 * memory.b0;
  memory.b2 = memory.b0;
  memory.a1 = 2 * (K * K - 1) / D;
  memory.a2 = (1 - 2 * zeta * K + K * K) / D;

  memory.x1 = 0; memory.x2 = 0;
  memory.y1 = 0; memory.y2 = 0;
}

function filter() {
  const x = state.x;   // Current sample only
  const y = memory.b0 * x
          + memory.b1 * memory.x1
          + memory.b2 * memory.x2
          - memory.a1 * memory.y1
          - memory.a2 * memory.y2;

  // You MUST update the input/output history yourself.
  memory.x2 = memory.x1;
  memory.x1 = x;
  memory.y2 = memory.y1;
  memory.y1 = y;
  return y;
}`;
  const ids=['frequency','amplitude','noiseStd','offset','fs','seed'];
  let codeEditor=$('codeEditor'), worker=null, requestId=0, pending=new Map();
  let appliedCode='',dirty=true,busy=false,rows=[],sweepRows=[],prbsRows=[],configuration=null;
  const initialCode=localStorage.getItem(savedKey);
  codeEditor.value=initialCode===null?starterCode:initialCode;
  function refreshLines(){
    const n=codeEditor.value.split('\n').length;
    $('lineNumbers').textContent=Array.from({length:n},(_,i)=>i+1).join('\n');
  }
  refreshLines();
  codeEditor.addEventListener('input',()=>{dirty=true;localStorage.setItem(savedKey,codeEditor.value);refreshLines();message('Code edited. Select Apply & reset to run the new version.');});
  codeEditor.addEventListener('scroll',()=>{$('lineNumbers').scrollTop=codeEditor.scrollTop;});
  codeEditor.addEventListener('keydown',e=>{if(e.key==='Tab'){
    e.preventDefault();const a=codeEditor.selectionStart,b=codeEditor.selectionEnd;
    codeEditor.setRangeText('  ',a,b,'end');codeEditor.dispatchEvent(new Event('input'));
  }});
  function status(text,isError=false){$('statusLabel').className='status'+(isError?' error':'');$('statusLabel').innerHTML='<i></i> '+text;}
  function message(text,isError=false){$('message').textContent=text;$('message').classList.toggle('error',isError);}
  function parseConfig(){
    const out={duration:10};
    for(const k of ids)out[k]=Number($(k).value);
    if(Object.values(out).some(v=>!Number.isFinite(v)))throw Error('All generator settings must be finite numbers.');
    if(![50,100,200,500].includes(out.fs))throw Error('Choose a valid sample rate.');
    if(out.frequency<=0||out.frequency>=out.fs/2)throw Error('Sine frequency must be between 0 and Nyquist ('+(out.fs/2)+' Hz).');
    if(out.amplitude<0||out.noiseStd<0||out.seed<1)throw Error('Amplitude, noise and seed must be valid positive settings.');
    if(out.amplitude>10||out.noiseStd>5||Math.abs(out.offset)>5)throw Error('Signal settings exceed the supported range.');
    return out;
  }
  function newWorker(){
    if(worker)worker.terminate();
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Worker restarted.'));}pending.clear();
    worker=new Worker('./worker.js?v=1.1.0');
    worker.onmessage=evt=>{
      const {id,ok,result,error}=evt.data,p=pending.get(id);if(!p)return;
      clearTimeout(p.timer);pending.delete(id);
      if(ok)p.resolve(result);else p.reject(Error(error));
    };
    worker.onerror=e=>{
      for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Worker failed to start or crashed: '+(e.message||'')));}pending.clear();
      status('Worker error',true);
    };
  }
  function send(action,extra={},timeout=15000){
    return new Promise((resolve,reject)=>{
      if(!worker){reject(Error('Worker is unavailable'));return;}
      const id=++requestId;
      const timer=setTimeout(()=>{
        pending.delete(id);
        // Terminates a filter() that never returns, e.g. while(true).
        newWorker();dirty=true;
        status('Timed out',true);
        reject(Error('Filter timed out. Check for infinite loops; press Apply & reset.'));
      },timeout);
      pending.set(id,{resolve,reject,timer});
      try{worker.postMessage({id,action,...extra});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
    });
  }
  function disabled(v){busy=v;for(const id of ['runBtn','stepBtn','resetBtn','applyBtn','sweepBtn','prbsBtn','restoreBtn'])$(id).disabled=v;}
  async function operation(task){
    if(busy)return;
    disabled(true);
    try{await task();}catch(e){message(e.message,true);status('Error',true);}
    finally{disabled(false);}
  }
  function clearResults(){
    rows=[];sweepRows=[];prbsRows=[];$('exportSignalBtn').disabled=true;$('exportSweepBtn').disabled=true;
    $('inRmse').textContent='—';$('outRmse').textContent='—';$('improvement').textContent='—';
    $('sampleCount').textContent='0 / '+Math.round(10*Number($('fs').value));
    $('plotMessage').textContent='Ready for ten seconds of data.';
    $('sweepMessage').textContent='Run either method, or both, to compare responses.';
    render();
  }
  async function compile(){
    const p=parseConfig();configuration=p;
    // Stale worker may contain a previous run or stuck code; always start clean.
    newWorker();
    const result=await send('compile',{config:p,code:codeEditor.value},6000);
    appliedCode=codeEditor.value;dirty=false;
    clearResults();status('Ready');
    message('Ready · init() called once. filter() awaits the first sample.');
    return result;
  }
  function updateResults(res){
    rows=res.rows||[];
    const n=Math.round(10*configuration.fs);
    $('sampleCount').textContent=rows.length+' / '+n;
    $('exportSignalBtn').disabled=rows.length===0;
    const m=res.metrics;
    if(m){
      $('inRmse').textContent=m.inputRMSE.toFixed(3);
      $('outRmse').textContent=m.outputRMSE.toFixed(3);
      $('improvement').textContent=m.improvementDb.toFixed(2);
    }
    $('plotMessage').textContent=rows.length===n?'Complete: '+rows.length+' samples over 10 seconds.':'Processed '+rows.length+' of '+n+' samples.';
    status(rows.length===n?'Finished':'Ready');render();
  }
  function configChanged(){
    if(busy)return;
    dirty=true;clearResults();
    $('dtLabel').textContent='Tₛ = '+(1/Number($('fs').value)).toFixed(3)+' s';
    message('Test configuration changed. Apply & reset before stepping or sweeping.');
    status('Setup changed');
  }
  ids.forEach(id=>$(id).addEventListener('change',configChanged));
  $('applyBtn').addEventListener('click',()=>operation(async()=>{await compile();}));
  $('resetBtn').addEventListener('click',()=>operation(async()=>{await compile();}));
  $('runBtn').addEventListener('click',()=>operation(async()=>{
    if(dirty||!configuration)await compile();
    status('Filtering…');
    const result=await send('run',{},12000);
    updateResults(result);
  }));
  $('stepBtn').addEventListener('click',()=>operation(async()=>{
    if(dirty||!configuration)await compile();
    const result=await send('step',{},4000);
    if(result.row===null){message('All 10 seconds already processed. Reset to start again.');return;}
    updateResults(result);
  }));
  $('sweepBtn').addEventListener('click',()=>operation(async()=>{
    if(dirty||!configuration)await compile();
    status('Sine sweep…');$('sweepMessage').textContent='Testing clean sinusoids across 22 frequencies…';
    const result=await send('sweep',{config:configuration},20000);
    sweepRows=result.points;
    $('exportSweepBtn').disabled=false;
    $('sweepMessage').textContent='Sine sweep: 22 independent clean-tone tests (4 warm-up + 5 fitted cycles). '+(prbsRows.length?'PRBS overlay also shown.':'Try PRBS to compare.');
    status('Ready');render();
  }));
  $('prbsBtn').addEventListener('click',()=>operation(async()=>{
    if(dirty||!configuration)await compile();
    status('PRBS analysis…');$('sweepMessage').textContent='Exciting all frequencies using a seeded ±1 PRBS; estimating H(f) from averaged FFT cross-spectra…';
    const result=await send('prbs',{config:configuration},25000);
    prbsRows=result.points;
    $('exportSweepBtn').disabled=false;
    $('sweepMessage').textContent='PRBS: 1 broadband test, 22 measured frequency bins, '+result.segments+' averaged FFT windows; '+(sweepRows.length?'sine overlay also shown.':'run a sine sweep to compare.');
    status('Ready');render();
  }));
  $('restoreBtn').addEventListener('click',()=>{
    codeEditor.value=starterCode;localStorage.setItem(savedKey,starterCode);dirty=true;refreshLines();
    message('Starter restored. Select Apply & reset to apply it.');
  });
  function saveBlob(filename,text,contentType){
    const blob=new Blob([text],{type:contentType}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  $('saveBtn').addEventListener('click',()=>saveBlob('student_filter.js',codeEditor.value,'text/javascript'));
  function csvEscape(v){return typeof v==='number'&&Number.isFinite(v)?String(v):JSON.stringify(String(v));}
  $('exportSignalBtn').addEventListener('click',()=>{
    if(!rows.length)return;
    const head=['sample','time_s','input_x','ideal_sine','output_y','input_error','output_error','sample_rate_hz','sine_frequency_hz','noise_std','seed'];
    const csv=[head.join(',')];
    for(const r of rows)csv.push([r.k,r.t,r.x,r.clean,r.y,r.x-r.clean,r.y-r.clean,configuration.fs,configuration.frequency,configuration.noiseStd,configuration.seed].map(csvEscape).join(','));
    saveBlob('filter_signal.csv',csv.join('\n')+'\n','text/csv');
  });
  $('exportSweepBtn').addEventListener('click',()=>{
    if(!sweepRows.length&&!prbsRows.length)return;
    const csv=['method,frequency_hz,gain_db,phase_deg,amplitude'];
    for(const [method,points] of [['sine',sweepRows],['prbs',prbsRows]]) {
      for(const p of points)csv.push([method,p.frequency,p.gainDb,p.phaseDeg,p.amplitude].join(','));
    }
    saveBlob('filter_frequency_response.csv',csv.join('\n')+'\n','text/csv');
  });
  function plot(canvas,series,opts={}){
    const bounds=canvas.getBoundingClientRect();if(bounds.width<20)return;
    const dpr=window.devicePixelRatio||1;
    canvas.width=Math.round(bounds.width*dpr);canvas.height=Math.round(bounds.height*dpr);
    const c=canvas.getContext('2d');c.scale(dpr,dpr);
    const w=bounds.width,h=bounds.height;
    c.fillStyle='#fff';c.fillRect(0,0,w,h);
    const area={x:49,y:15,w:w-66,h:h-51};
    const xMin=opts.xMin??0,xMax=opts.xMax??10;
    let all=[];for(const s of series)for(const p of s.points)if(Number.isFinite(p.y))all.push(p.y);
    let yMin=opts.yMin??(all.length?Math.min(...all):(-2)),yMax=opts.yMax??(all.length?Math.max(...all):2);
    if(yMax-yMin<1e-8){yMin-=1;yMax+=1;}
    if(opts.yMin===undefined){const margin=(yMax-yMin)*.1;yMin-=margin;yMax+=margin;}
    const xx=x=>area.x+((opts.logX?Math.log(x/xMin)/Math.log(xMax/xMin):(x-xMin)/(xMax-xMin)))*area.w;
    const yy=y=>area.y+area.h-(y-yMin)/(yMax-yMin)*area.h;
    c.lineWidth=1;c.strokeStyle='#e9eff1';c.fillStyle='#6c7e8c';c.font='10px system-ui';
    const f=n=>(Math.abs(n)>=100?n.toFixed(0):Math.abs(n)>=10?n.toFixed(1):n.toFixed(2)).replace(/\.00$/,'');
    for(let i=0;i<=4;i++){
      const y=area.y+i*area.h/4;
      c.beginPath();c.moveTo(area.x,y);c.lineTo(area.x+area.w,y);c.stroke();
      c.textAlign='right';c.fillText(f(yMax-i*(yMax-yMin)/4),area.x-7,y+3);
      const x=area.x+i*area.w/4;c.beginPath();c.moveTo(x,area.y);c.lineTo(x,area.y+area.h);c.stroke();
      const val=opts.logX?xMin*Math.pow(xMax/xMin,i/4):xMin+(xMax-xMin)*i/4;
      c.textAlign='center';c.fillText(f(val),x,area.y+area.h+17);
    }
    c.textAlign='center';c.fillText(opts.xLabel||'time (s)',area.x+area.w/2,h-5);
    c.save();c.beginPath();c.rect(area.x,area.y,area.w,area.h);c.clip();
    for(const s of series){
      if(!s.points.length)continue;
      c.beginPath();c.lineWidth=s.width||1.7;c.strokeStyle=s.color;
      let started=false;
      // For dense traces, subsample display only; exported CSV retains all data.
      const stride=Math.max(1,Math.floor(s.points.length/3000));
      for(let i=0;i<s.points.length;i+=stride){
        const p=s.points[i];if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<xMin||p.x>xMax)continue;
        const x=xx(p.x),y=yy(p.y);
        if(!started){c.moveTo(x,y);started=true;}else c.lineTo(x,y);
      }
      c.stroke();
    }
    c.restore();
  }
  function render(){
    const coord=arr=>arr.map(r=>({x:r.t,y:r.y}));
    plot($('timeChart'),[
      {points:rows.map(r=>({x:r.t,y:r.x})),color:'#b0bfcb',width:1.1},
      {points:rows.map(r=>({x:r.t,y:r.clean})),color:'#e99e3a',width:1.9},
      {points:coord(rows),color:'#0ca39c',width:2.0}
    ],{xMin:0,xMax:10,xLabel:'time (s)'});
    const fs=Number($('fs').value),lo=0.35,hi=Math.min(30,0.4*fs);
    const curves=[...sweepRows,...prbsRows];
    plot($('gainChart'),[
      {points:sweepRows.map(r=>({x:r.frequency,y:r.gainDb})),color:'#078b91',width:2.2},
      {points:prbsRows.map(r=>({x:r.frequency,y:r.gainDb})),color:'#7960b5',width:2.0}
    ],{xMin:lo,xMax:hi,logX:true,xLabel:'frequency (Hz)',yMin:curves.length?Math.min(-3,...curves.map(x=>x.gainDb))-5:-40,yMax:curves.length?Math.max(3,...curves.map(x=>x.gainDb))+5:5});
    plot($('phaseChart'),[
      {points:sweepRows.map(r=>({x:r.frequency,y:r.phaseDeg})),color:'#e79931',width:2.2},
      {points:prbsRows.map(r=>({x:r.frequency,y:r.phaseDeg})),color:'#7960b5',width:2.0}
    ],{xMin:lo,xMax:hi,logX:true,xLabel:'frequency (Hz)',yMin:-180,yMax:180});
  }
  window.addEventListener('resize',render);
  $('dtLabel').textContent='Tₛ = '+(1/Number($('fs').value)).toFixed(3)+' s';
  newWorker();render();
  operation(async()=>{await compile();});
})();
