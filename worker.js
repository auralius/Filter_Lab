'use strict';
importScripts('./signal.js');
let codeText = '';
let session = null;
const defaultConfig={fs:100,duration:10,frequency:2,amplitude:1,noiseStd:0.45,offset:0,seed:17};
function validate(input){
  const p={...defaultConfig,...input};
  for(const k of ['fs','duration','frequency','amplitude','noiseStd','offset','seed']) if(!Number.isFinite(p[k])) throw Error('Invalid '+k);
  if(p.fs<20||p.fs>500||p.duration!==10||p.frequency<=0||p.frequency>=p.fs/2||p.amplitude<0||p.noiseStd<0) throw Error('Invalid test-signal parameters');
  p.seed=Math.floor(p.seed);
  return Object.freeze({...p,dt:1/p.fs});
}
function createFilter(source,params) {
  // These are intentionally lexical bindings, accessible from all custom functions.
  // Rebuild the closure for every independent run / sweep frequency.
  const body='"use strict";\nlet state, params, memory;\n'+source+'\n'+
    'return { bind(s,p,m){state=s;params=p;memory=m;},'+
    'init:(typeof init === "function" ? init : null),'+
    'filter:(typeof filter === "function" ? filter : null) };';
  let instance;
  try{instance=new Function(body)();}catch(e){throw Error('Compile error: '+e.message);}
  if(typeof instance.filter!=='function')throw Error('Define a function named filter() that returns one finite number.');
  const memory={};
  instance.bind(Object.freeze({x:0}),params,memory);
  try{if(instance.init)instance.init();}catch(e){throw Error('init() error: '+e.message);}
  return {
    process(x){
      // Only the current sample is provided; no clean value, future samples, or time index.
      instance.bind(Object.freeze({x}),params,memory);
      let y;
      try{y=instance.filter();}catch(e){throw Error('filter() error: '+e.message);}
      if(typeof y!=='number'||!Number.isFinite(y))throw Error('filter() must return one finite number; got '+String(y));
      return y;
    }
  };
}
function newSession(cfg){
  const p=validate(cfg), runtime=createFilter(codeText,p);
  return {params:p,runtime,input:SignalLab.generate(p),index:0,rows:[]};
}
function next(s){
  if(s.index>=s.input.length)return null;
  const sample=s.input[s.index];
  let y;
  try{y=s.runtime.process(sample.x);}catch(e){throw Error('Sample '+sample.k+' (t='+sample.t.toFixed(3)+'s): '+e.message);}
  const row={...sample,y};
  s.rows.push(row);s.index++;
  return row;
}
function logarithmicFrequencies(fs){
  const lo=0.35,hi=Math.min(30,0.4*fs), count=22;
  return Array.from({length:count},(_,i)=>lo*Math.pow(hi/lo,i/(count-1)));
}
function sweep(cfg){
  const cfgBase=validate(cfg), result=[];
  const frequencies=logarithmicFrequencies(cfgBase.fs);
  for(const frequency of frequencies){
    // Sweep is deliberately CLEAN (no noise) to measure sinusoidal gain and phase.
    const p=Object.freeze({...cfgBase,frequency,amplitude:1,offset:0,noiseStd:0});
    const runtime=createFilter(codeText,p);
    const fs=p.fs,cyclesWarm=4,cyclesMeasure=5;
    let warmN=Math.ceil(cyclesWarm*fs/frequency),
        measureN=Math.ceil(cyclesMeasure*fs/frequency);
    if(warmN+measureN>16000)throw Error('Frequency sweep simulation length exceeded limit.');
    const output=[];
    for(let k=0;k<warmN+measureN;k++){
      const t=k/fs,x=Math.sin(2*Math.PI*frequency*t);
      let y;
      try{y=runtime.process(x);}catch(e){throw Error('Sweep '+frequency.toFixed(2)+' Hz, sample '+k+': '+e.message);}
      if(k>=warmN)output.push({t,y});
    }
    const fit=SignalLab.sineFit(output,frequency);
    if(!Number.isFinite(fit.amplitude))throw Error('Cannot estimate response at '+frequency.toFixed(2)+' Hz.');
    result.push({frequency,gainDb:20*Math.log10(Math.max(1e-12,fit.amplitude)),phaseDeg:fit.phase,amplitude:fit.amplitude});
  }
  return result;
}
self.onmessage=function(evt){
  const {id,action,config,code}=evt.data;
  try{
    let result;
    if(action==='compile'){
      codeText=String(code||'');
      session=newSession(config);
      result={ready:true,length:session.input.length};
    }else if(action==='step'){
      if(!session)throw Error('Press Apply & reset first');
      result={row:next(session),rows:session.rows.slice(),done:session.index===session.input.length,metrics:SignalLab.metrics(session.rows)};
    }else if(action==='run'){
      if(!session)throw Error('Press Apply & reset first');
      while(session.index<session.input.length)next(session);
      result={rows:session.rows.slice(),done:true,metrics:SignalLab.metrics(session.rows)};
    }else if(action==='sweep'){
      if(!codeText)throw Error('Press Apply & reset first');
      result={points:sweep(config)};
    }else throw Error('Unknown action');
    self.postMessage({id,ok:true,result});
  }catch(e){self.postMessage({id,ok:false,error:e.message||String(e)});}
};
