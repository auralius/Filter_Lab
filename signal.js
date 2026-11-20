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
  const api = {randomGenerator,gaussianGenerator,generate,sineFit,metrics};
  root.SignalLab=api;
  if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
