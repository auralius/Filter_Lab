/* Deterministic signal synthesis and phase/amplitude measurement for Filter Lab. */
(function(root) {
  'use strict';
  function randomGenerator(seed) {
    let s = (Math.floor(seed) >>> 0) || 1;
    return function() {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }
  function gaussianGenerator(seed) {
    const rnd = randomGenerator(seed);
    let spare = null;
    return function() {
      if (spare !== null) { const z = spare; spare = null; return z; }
      const a = Math.max(1e-12, rnd()), b = rnd();
      const radius = Math.sqrt(-2 * Math.log(a));
      spare = radius * Math.sin(2*Math.PI*b);
      return radius * Math.cos(2*Math.PI*b);
    };
  }
  function generate(p) {
    const n = Math.round(p.duration * p.fs), gaussian = gaussianGenerator(p.seed);
    const out = [];
    for (let k = 0; k < n; ++k) {
      const t = k / p.fs;
      const clean = p.offset + p.amplitude * Math.sin(2*Math.PI*p.frequency*t);
      out.push({ k, t, clean, x: clean + p.noiseStd * gaussian() });
    }
    return out;
  }
  // Sinusoidal least squares: fit y(t) = dc + a*sin(wt) + b*cos(wt).
  function sineFit(data, frequency) {
    let ss=0, sc=0, cc=0, s1=0, c1=0, sy=0, cy=0, yy=0, n=0;
    for (const p of data) {
      const sn=Math.sin(2*Math.PI*frequency*p.t);
      const cs=Math.cos(2*Math.PI*frequency*p.t);
      ss+=sn*sn; sc+=sn*cs; cc+=cs*cs; s1+=sn; c1+=cs;
      sy+=sn*p.y; cy+=cs*p.y; yy+=p.y; n++;
    }
    // Solve 3x3 normal equations by elimination.
    const a=[[ss,sc,s1,sy],[sc,cc,c1,cy],[s1,c1,n,yy]];
    for(let j=0;j<3;j++){
      let pick=j;
      for(let i=j+1;i<3;i++) if(Math.abs(a[i][j])>Math.abs(a[pick][j])) pick=i;
      if(Math.abs(a[pick][j])<1e-10) return {amplitude:NaN,phase:NaN};
      [a[j],a[pick]]=[a[pick],a[j]];
      const div=a[j][j];for(let h=j;h<4;h++)a[j][h]/=div;
      for(let i=0;i<3;i++) if(i!==j){const z=a[i][j];for(let h=j;h<4;h++)a[i][h]-=z*a[j][h];}
    }
    const sinCoef=a[0][3], cosCoef=a[1][3];
    return { amplitude: Math.hypot(sinCoef,cosCoef), phase: Math.atan2(cosCoef,sinCoef)*180/Math.PI };
  }
  function metrics(rows) {
    if(!rows.length) return null;
    let a=0,b=0;
    for(const r of rows){a+=(r.x-r.clean)**2;b+=(r.y-r.clean)**2;}
    const inputRMSE=Math.sqrt(a/rows.length), outputRMSE=Math.sqrt(b/rows.length);
    return { inputRMSE, outputRMSE, improvementDb:20*Math.log10(Math.max(inputRMSE,1e-12)/Math.max(outputRMSE,1e-12)) };
  }
  // In-place radix-2 FFT, forward transform using exp(-j*2*pi*k*n/N).
  function fft(real, imag) {
    const n=real.length;
    if(n!==imag.length || n<2 || (n&(n-1))) throw Error('FFT size must be power-of-two.');
    for(let i=1,j=0;i<n;i++){
      let bit=n>>1;
      for(;j&bit;bit>>=1)j^=bit;
      j^=bit;
      if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}
    }
    for(let size=2;size<=n;size*=2){
      const half=size/2, ang=-2*Math.PI/size,wr=Math.cos(ang),wi=Math.sin(ang);
      for(let start=0;start<n;start+=size){
        let ar=1,ai=0;
        for(let k=0;k<half;k++){
          const a=start+k,b=a+half,br=real[b]*ar-imag[b]*ai,bi=real[b]*ai+imag[b]*ar;
          const xr=real[a],xi=imag[a];real[a]=xr+br;imag[a]=xi+bi;real[b]=xr-br;imag[b]=xi-bi;
          const nr=ar*wr-ai*wi;ai=ar*wi+ai*wr;ar=nr;
        }
      }
    }
  }
  // Periodogram averaging with a Hann window and 50% overlap. The complex
  // H1 estimate H = sum(Y*conj(X))/sum(X*conj(X)) is more robust than |Y|/|X|.
  function prbsFrequencyResponse(inputs,outputs,fs,desiredFrequencies,fftSize=4096){
    if(inputs.length!==outputs.length || inputs.length<fftSize)throw Error('Not enough PRBS samples.');
    const half=fftSize>>1, step=half;
    const sxx=new Float64Array(half+1),syr=new Float64Array(half+1),syi=new Float64Array(half+1);
    const window=Float64Array.from({length:fftSize},(_,i)=>0.5-0.5*Math.cos(2*Math.PI*i/(fftSize-1)));
    let segments=0;
    for(let start=0;start+fftSize<=inputs.length;start+=step){
      const xr=new Float64Array(fftSize),xi=new Float64Array(fftSize);
      const yr=new Float64Array(fftSize),yi=new Float64Array(fftSize);
      let xm=0,ym=0;
      for(let j=0;j<fftSize;j++){xm+=inputs[start+j];ym+=outputs[start+j];}
      xm/=fftSize;ym/=fftSize;
      for(let j=0;j<fftSize;j++){
        xr[j]=(inputs[start+j]-xm)*window[j];yr[j]=(outputs[start+j]-ym)*window[j];
      }
      fft(xr,xi);fft(yr,yi);
      for(let k=1;k<=half;k++){
        sxx[k]+=xr[k]*xr[k]+xi[k]*xi[k];
        syr[k]+=yr[k]*xr[k]+yi[k]*xi[k];
        syi[k]+=yi[k]*xr[k]-yr[k]*xi[k];
      }
      segments++;
    }
    // Interpolate the complex H1 estimate between neighboring FFT bins.
    // This keeps frequency coordinates on the shared logarithmic grid and
    // avoids duplicated lower-frequency bins in the wider Bode plot.
    function estimate(bin){
      const denom=sxx[bin];
      if(denom<=1e-20)throw Error('Insufficient PRBS energy near FFT bin '+bin+'.');
      return {re:syr[bin]/denom,im:syi[bin]/denom};
    }
    const points=desiredFrequencies.map(f=>{
      const index=Math.max(1,Math.min(half-1,f*fftSize/fs));
      const bin0=Math.floor(index),bin1=Math.min(half,bin0+1),alpha=index-bin0;
      const a=estimate(bin0), b=bin1===bin0?a:estimate(bin1);
      const re=a.re+(b.re-a.re)*alpha,im=a.im+(b.im-a.im)*alpha;
      const amplitude=Math.hypot(re,im);
      return {frequency:f,gainDb:20*Math.log10(Math.max(1e-12,amplitude)),phaseDeg:Math.atan2(im,re)*180/Math.PI,amplitude};
    });
    return {points,segments};
  }
  const api = {randomGenerator,gaussianGenerator,generate,sineFit,metrics,fft,prbsFrequencyResponse};
  root.SignalLab=api;
  if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
