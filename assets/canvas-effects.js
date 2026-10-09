// Pure time-based trajectories. Colors stay within the film's rose / ivory / gold palette.
// Classic browser script; call draw(time) from your render timeline.
(function(root){
function createWeddingEffects(canvas, options={}) {
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas 2D context unavailable');
  const fxPeriod=options.beatPeriod ?? .75;
  if(!(fxPeriod>0))throw new Error('beatPeriod must be positive');
  const getProtectedBoxes=options.getProtectedBoxes ?? (()=>[]);
  const width=options.width ?? canvas.width,height=options.height ?? canvas.height;
  if(!(width>0&&height>0))throw new Error('Invalid design dimensions');
  const allowed=new Set(['fireworks','sunset','bloom','hearts','rays','ribbon','planes','ripples','confetti','rings']);
  const fxPlans=(options.plans??[]).map((p,i)=>{
    if(!allowed.has(p.kind)||!(p.end>p.start)||!p.anchor?.every(Number.isFinite)||p.anchor.length!==2||!(p.radius>0))throw new Error('Invalid effect plan '+i);
    if((p.attacks??[]).some(t=>!Number.isFinite(t)||t<p.start||t>=p.end))throw new Error('Attack outside plan '+i);
    return {...p,seed:p.seed??i,blocks:p.blocks??[],attacks:p.attacks??[],companions:p.companions??[]};
  });
const TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const gold=options.palette?.gold??[240,194,112],rose=options.palette?.rose??[222,151,163],ivory=options.palette?.ivory??[255,237,197];
const color=(c,a=1)=>`rgba(${c.join(',')},${clamp(a)})`;
function line(x,y,xx,yy,c,w=1.5,a=1){ctx.strokeStyle=color(c,a);ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();}
function star(x,y,r,c,a=1){ctx.save();ctx.translate(x,y);ctx.fillStyle=color(c,a);ctx.beginPath();for(let i=0;i<8;i++){let ang=i*Math.PI/4,rr=i%2?r*.24:r;ctx.lineTo(Math.cos(ang)*rr,Math.sin(ang)*rr);}ctx.closePath();ctx.fill();ctx.restore();}
function heart(x,y,r,rot,c,a=1,fill=false){ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.scale(r/22,r/22);ctx.beginPath();ctx.moveTo(0,18);ctx.bezierCurveTo(-36,-4,-17,-32,0,-12);ctx.bezierCurveTo(17,-32,36,-4,0,18);ctx.strokeStyle=color(c,a);ctx.fillStyle=color(c,a*.17);ctx.lineWidth=1.65;if(fill)ctx.fill();ctx.stroke();ctx.restore();}
function glow(x,y,r,c,a){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color(c,a));g.addColorStop(.22,color(c,a*.26));g.addColorStop(1,color(c,0));ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
function firework(p,t){
  p.attacks.forEach((hit,k)=>{
    const age=t-hit,cycle=Math.min(fxPeriod*7,Math.max(fxPeriod*4,p.end-hit-.08));if(age<-.7||age>cycle)return;
    const xx=p.anchor[0]+(k%2?65:-38),yy=p.anchor[1]+(k%2?12:-25),r=p.radius*(k%2?.82:1);
    if(age<0){const u=1+age/.7;const y=yy+(1-u)*r*.8;line(xx,y,xx-4,y+Math.min(38,r*.25),gold,2.3,.9*u);star(xx,y,4.8,ivory,u);return;}
    const u=clamp(age/cycle),expand=1-Math.exp(-7*u),fade=1-smooth((u-.46)/.54);
    glow(xx,yy,28+u*24,gold,.32*Math.exp(-8*u));
    for(let i=0;i<48;i++){
      const theta=i/48*TAU+p.seed*.01,v=.7+.3*Math.sin(i*17.83)**2,rr=r*expand*v,drop=u*u*r*.21;
      const x=xx+Math.cos(theta)*rr,y=yy+Math.sin(theta)*rr+drop;
      const back=Math.max(0,rr-r*.18*(1-u*.7));
      const c=i%5===0?rose:i%3===0?ivory:gold;
      const tail=ctx.createLinearGradient(xx+Math.cos(theta)*back,yy+Math.sin(theta)*back+drop,x,y);tail.addColorStop(0,color(c,0));tail.addColorStop(1,color(c,fade));
      ctx.strokeStyle=tail;ctx.lineWidth=2.1;ctx.beginPath();ctx.moveTo(xx+Math.cos(theta)*back,yy+Math.sin(theta)*back+drop);ctx.lineTo(x,y);ctx.stroke();
      if(i%4===0){star(x,y,3+(1-u)*2,c,fade);glow(x,y,7,c,fade*.18);}
      else{ctx.fillStyle=color(c,fade);ctx.beginPath();ctx.arc(x,y,1.1,0,TAU);ctx.fill();}
      if(u>.15&&i%3===0){const rr2=rr*.8;star(xx+Math.cos(theta+.05)*rr2,yy+Math.sin(theta+.05)*rr2+drop+11,1.8,c,fade*.7);}
    }
    if(k%2===0)heart(xx,yy-2,16+12*expand,0,rose,fade*.7);
  });
}
function sunset(p,t){
  const age=t-p.start,u=smooth(age/(fxPeriod*1.6)),x=p.anchor[0],h=p.anchor[1]+p.radius*.34,r=p.radius*.57;
  // Half-disc emergence above the horizon, with luminous rays expanding on beats.
  ctx.save();ctx.beginPath();ctx.rect(x-p.radius*1.3,h-p.radius*1.5,p.radius*2.6,p.radius*1.5);ctx.clip();
  const cy=h+r*.7*(1-u),g=ctx.createLinearGradient(0,cy-r,0,cy+r*.4);
  g.addColorStop(0,color(ivory,.86));g.addColorStop(.28,color(gold,.72));g.addColorStop(1,color([189,108,72],.02));
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,cy,r*u,Math.PI,TAU);ctx.closePath();ctx.fill();
  for(let i=0;i<17;i++){const angle=Math.PI+(i+.5)/17*Math.PI,rr=r+14,reach=p.radius*(.87+.05*Math.sin(age/fxPeriod*Math.PI+i*.3));const ray=smooth((age-i*.024)/.85);line(x+Math.cos(angle)*rr,cy+Math.sin(angle)*rr,x+Math.cos(angle)*(rr+(reach-rr)*ray),cy+Math.sin(angle)*(rr+(reach-rr)*ray),gold,i%4===0?2.7:1.3,.48*u);}
  ctx.restore();
  for(let i=0;i<4;i++){const w=r*(1-i*.19)*u,yy=h+12+i*10;line(x-w,yy,x+w,yy,gold,i===0?2:1,.5-i*.095);}
  for(let i=0;i<9;i++){const ph=(age/(fxPeriod*4)+i*.137)%1,xx=x+Math.sin(i*2.41)*p.radius*.85,yy=h-ph*p.radius*1.18;star(xx,yy,2.5+Math.sin(ph*Math.PI)*2,gold,Math.sin(ph*Math.PI)*.8);}
}
function bloom(p,t){
  const age=t-p.start,x=p.anchor[0],y=p.anchor[1],r=p.radius*.69,opening=smooth(age/(fxPeriod*1.7));
  ctx.save();ctx.translate(x,y);ctx.rotate(.1*Math.sin(age*.5));
  for(let layer=0;layer<2;layer++)for(let i=0;i<6;i++){
    const a=i*TAU/6+layer*Math.PI/6,rr=r*(layer?.6:1)*opening;
    ctx.save();ctx.rotate(a);ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-rr*.59,-rr*.37,-rr*.46,-rr*1.22,0,-rr);ctx.bezierCurveTo(rr*.46,-rr*1.22,rr*.59,-rr*.37,0,0);
    const g=ctx.createLinearGradient(0,0,0,-rr);g.addColorStop(0,color(gold,.03));g.addColorStop(1,color(rose,layer?.13:.065));ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=color(layer?gold:rose,.68*opening);ctx.lineWidth=layer?1.4:2;ctx.stroke();ctx.restore();
  }
  for(let i=0;i<9;i++){const a=i/9*TAU;line(0,0,Math.cos(a)*15*opening,Math.sin(a)*15*opening,gold,1.4,.8);star(Math.cos(a)*18*opening,Math.sin(a)*18*opening,2.5,ivory,.8);}
  ctx.restore();
  for(let i=0;i<6;i++){const u=(age/(fxPeriod*5)+i*.173)%1,theta=i*2.32;const xx=x+Math.cos(theta)*(r*.8+u*65),yy=y+Math.sin(theta)*r+u*50;ctx.save();ctx.translate(xx,yy);ctx.rotate(theta+u*2);ctx.strokeStyle=color(rose,Math.sin(u*Math.PI)*.65*opening);ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,5+u*3,11+u*3,0,0,TAU);ctx.stroke();ctx.restore();}
}
function hearts(p,t){
  const age=t-p.start,x=p.anchor[0],y=p.anchor[1],r=p.radius,show=smooth(age/.7);
  // Two larger intertwined hearts; a comet carries tiny hearts along a looping arc.
  heart(x-33,y+8,44+Math.sin(age*Math.PI/fxPeriod/2)*3,-.18,rose,.85*show,true);
  heart(x+40,y-25,31,.18,gold,.82*show);
  for(let i=0;i<16;i++){const phase=age/(fxPeriod*6)+i/16,ang=phase*TAU,xx=x+Math.cos(ang)*r*.8,yy=y+Math.sin(ang)*r*.53,alpha=(.3+.5*(1-i/16))*show;if(i%5===0)heart(xx,yy,8+(i%3)*2,Math.sin(ang)*.4,rose,alpha);else star(xx,yy,2.7,gold,alpha);}
  // Partial orbit, drawn as a travel trail rather than a closed static ring.
  const head=age/(fxPeriod*6)*TAU;
  for(let i=0;i<32;i++){const a=head-i*.023,aa=a-.023;line(x+Math.cos(a)*r*.8,y+Math.sin(a)*r*.53,x+Math.cos(aa)*r*.8,y+Math.sin(aa)*r*.53,gold,1.2,(1-i/32)*.45*show);}
}
function rays(p,t){
  const age=t-p.start,x=p.anchor[0],y=p.anchor[1],u=smooth(age/(fxPeriod*1.2));
  for(let i=0;i<24;i++){const a=i/24*TAU+.08*Math.sin(age*.5),inner=25+10*Math.sin(age*.6),outer=p.radius*(.58+(i%3)*.13)*u;const g=ctx.createLinearGradient(x+Math.cos(a)*inner,y+Math.sin(a)*inner,x+Math.cos(a)*outer,y+Math.sin(a)*outer);g.addColorStop(0,color(gold,0));g.addColorStop(.55,color(gold,.6));g.addColorStop(1,color(ivory,0));ctx.strokeStyle=g;ctx.lineWidth=i%3===0?3:1.5;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*inner,y+Math.sin(a)*inner);ctx.lineTo(x+Math.cos(a)*outer,y+Math.sin(a)*outer);ctx.stroke();if(i%4===0)star(x+Math.cos(a)*outer,y+Math.sin(a)*outer,4,gold,u*.7);}
  heart(x,y,31,.03*Math.sin(age),rose,u*.9,true);
}
function ribbon(p,t){
  const age=t-p.start,x=p.anchor[0],y=p.anchor[1],r=p.radius,u=smooth(age/.8);
  // A flowing infinity ribbon symbolises the continuing story; the head runs six beats.
  const head=age/(fxPeriod*6)*TAU;
  const point=a=>[x+Math.cos(a)*r*.91,y+Math.sin(2*a)*r*.37];
  for(let j=0;j<100;j++){const a=head-j*.026,b=a-.026,v=point(a),w=point(b);line(...v,...w,j<35?gold:rose,2.5,(1-j/100)*.78*u);}
  const q=point(head);star(q[0],q[1],7,ivory,u);glow(q[0],q[1],20,gold,.17*u);
  for(let i=0;i<4;i++){const a=head-i*.9,v=point(a);heart(v[0],v[1],8+i*.9,Math.sin(a)*.35,rose,(.8-i*.12)*u);}
}
function paperPlane(x,y,size,angle,c,alpha){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size/30,size/30);
  ctx.fillStyle=color(c,alpha*.94);ctx.beginPath();ctx.moveTo(32,0);ctx.lineTo(-22,-18);ctx.lineTo(-10,0);ctx.closePath();ctx.fill();
  ctx.fillStyle=color(c,alpha*.52);ctx.beginPath();ctx.moveTo(32,0);ctx.lineTo(-10,0);ctx.lineTo(-22,18);ctx.closePath();ctx.fill();
  line(-10,0,32,0,ivory,1,alpha*.78);ctx.restore();
}
function planes(p,t){
  const age=t-p.start,show=smooth(age/.65),x=p.anchor[0],y=p.anchor[1],r=p.radius;
  const point=a=>[x+Math.cos(a)*r*.72,y+Math.sin(a*2)*r*.3];
  for(let k=0;k<2;k++){
    const a=age/(fxPeriod*8)*TAU+k*.9,c=k?rose:ivory;
    for(let i=0;i<45;i++){const aa=a-i*.022,v=point(aa),w=point(aa-.022);line(...v,...w,k?rose:gold,1.7,show*(1-i/45)*.6);}
    const q=point(a),tangent=Math.atan2(.6*Math.cos(2*a),-.72*Math.sin(a));
    paperPlane(q[0],q[1],k?19:25,tangent,c,show);
    const trail=point(a-1.15);heart(trail[0],trail[1],8,-.2,k?rose:gold,.65*show);
  }
  for(let i=0;i<4;i++){const a=i*1.65+age*.08;star(x+Math.cos(a)*r*.83,y+Math.sin(a)*r*.53,2.5,gold,(.45+.2*Math.sin(age*1.2+i))*show);}
}
function ripples(p,t){
  const age=t-p.start,show=smooth(age/.6),x=p.anchor[0],y=p.anchor[1]+p.radius*.08,r=p.radius;
  for(let k=0;k<2;k++){
    const cx=x+(k?1:-1)*r*.25,cy=y+(k?13:-8),clock=age/(fxPeriod*5)+k*.48;
    const u=clock%1;
    if(u<.25){const drop=(1-u/.25)*r*.57;glow(cx,cy-drop,12,gold,.14*show);star(cx,cy-drop,3.4,ivory,show);}
    for(let j=0;j<3;j++){
      const v=(clock+j/3)%1,rr=r*(.08+v*.69),alpha=Math.sin(v*Math.PI)*.67*show;
      ctx.save();ctx.translate(cx,cy);ctx.rotate((k?1:-1)*.055);ctx.strokeStyle=color(k?rose:gold,alpha);ctx.lineWidth=j===0?2.2:1.4;
      ctx.beginPath();ctx.ellipse(0,0,rr,rr*.24,0,0,TAU);ctx.stroke();ctx.restore();
      const a=v*TAU+k;star(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr*.24,2.5,ivory,alpha);
    }
  }
  heart(x,y-r*.31,24,.04*Math.sin(age*.8),rose,.8*show,true);
}
function confetti(p,t){
  const age=t-p.start,show=smooth(age/.65),x=p.anchor[0],y=p.anchor[1],r=p.radius;
  // Folded paper drifts on different long arcs; each piece fades before wrapping.
  for(let i=0;i<30;i++){
    const u=(age/(fxPeriod*6)+(i*.61803398875)%1)%1;
    const sway=Math.sin(u*TAU+i*2.3),xx=x+Math.sin(i*8.27)*r*.68+sway*15;
    const yy=y-r*.77+u*r*1.6,alpha=Math.pow(Math.sin(u*Math.PI),.6)*show;
    const width=6+(i%4)*2,height=12+(i%3)*5,c=i%3===0?rose:i%3===1?gold:ivory;
    ctx.save();ctx.translate(xx,yy);ctx.rotate(i+u*2.8);ctx.scale(.3+.7*Math.abs(Math.cos(i+u*4)),1);
    ctx.fillStyle=color(c,alpha*.84);ctx.beginPath();ctx.moveTo(-width/2,-height/2);ctx.lineTo(width/2,-height/2+3);ctx.lineTo(width/2,height/2);ctx.lineTo(-width/2,height/2-3);ctx.closePath();ctx.fill();
    line(-width/2,0,width/2,2,ivory,.8,alpha*.5);ctx.restore();
  }
  for(let i=0;i<5;i++){const a=i*2.21+age*.17;star(x+Math.cos(a)*r*.66,y+Math.sin(a)*r*.6,3.4,gold,show*.68);}
}
function rings(p,t){
  const age=t-p.start,show=smooth(age/.6),join=smooth(age/(fxPeriod*1.8)),x=p.anchor[0],y=p.anchor[1],r=p.radius*.35;
  for(let k=0;k<2;k++){
    const sign=k?1:-1,cx=x+sign*r*(1.08-.48*join),cy=y+sign*7;
    const tilt=sign*.22+Math.sin(age/(fxPeriod*4)*Math.PI)*.05;
    ctx.save();ctx.translate(cx,cy);ctx.rotate(tilt);
    const g=ctx.createLinearGradient(-r,-r,r,r);g.addColorStop(0,color(gold,.9*show));g.addColorStop(.45,color(ivory,.94*show));g.addColorStop(1,color(k?rose:gold,.52*show));
    ctx.strokeStyle=g;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,0,r*.82,r,0,0,TAU);ctx.stroke();
    ctx.strokeStyle=color(gold,.22*show);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,r*.82-5,r-5,0,0,TAU);ctx.stroke();
    const a=age/(fxPeriod*5)*TAU+sign*.8;star(Math.cos(a)*r*.82,Math.sin(a)*r,6,ivory,show);glow(Math.cos(a)*r*.82,Math.sin(a)*r,18,gold,.14*show);
    if(k===1){ctx.fillStyle=color(ivory,.12*show);ctx.strokeStyle=color(ivory,.85*show);ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(0,-r-23);ctx.lineTo(15,-r-12);ctx.lineTo(0,-r+1);ctx.lineTo(-15,-r-12);ctx.closePath();ctx.fill();ctx.stroke();}
    ctx.restore();
  }
  for(let i=0;i<4;i++){const a=i*1.7+age*.11;star(x+Math.cos(a)*p.radius*.75,y+Math.sin(a)*p.radius*.56,2.6,gold,(.55+.15*Math.sin(age+i))*show);}
}
function drawEffects(t){
  if(!Number.isFinite(t))throw new Error('Time must be finite');
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.scale(canvas.width/width,canvas.height/height);ctx.lineCap='round';ctx.lineJoin='round';
  const active=fxPlans.filter(p=>t>=p.start&&t<p.end);
  for(const p of active){ctx.save();ctx.globalAlpha=Math.min(smooth((t-p.start)/.25),smooth((p.end-t)/.5));({fireworks:firework,sunset,bloom,hearts,rays,ribbon,planes,ripples,confetti,rings}[p.kind])(p,t);
    for(const q of p.companions||[]){
      const age=t-p.start,phase=age/(fxPeriod*8)*TAU+q.phase,x=q.anchor[0],y=q.anchor[1],r=q.radius;
      const reveal=smooth(age/.9),drift=Math.sin(phase)*6;
      if(['rings','hearts','ripples'].includes(p.kind)){
        heart(x-10,y+drift,23,-.14,rose,.67*reveal);heart(x+19,y-15-drift*.4,14,.17,gold,.54*reveal);
      }else if(p.kind==='planes'){
        paperPlane(x+Math.sin(phase)*r*.23,y+Math.cos(phase)*8,21,-.35+.12*Math.sin(phase),ivory,.65*reveal);
      }else{
        star(x,y+drift,10+2*Math.sin(phase),gold,.68*reveal);
        star(x+26,y-17,5,ivory,.5*reveal);heart(x-23,y+17,12,-.1,rose,.54*reveal);
      }
      for(let j=0;j<3;j++){const a=phase+j*2.1;star(x+Math.cos(a)*r*.72,y+Math.sin(a)*r*.6,2.5+(j===0),gold,(.32+.18*Math.sin(phase+j))*reveal);}
    }
    ctx.restore();}
  // Protect the *current transformed* bounds as well as the generous planned envelopes.
  ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';
  for(const p of active)for(const q of p.blocks)ctx.fillRect(...q);
  for(const q of getProtectedBoxes(t))ctx.fillRect(...q);
  ctx.restore();ctx.restore();
}

  return {draw:drawEffects, kinds:[...allowed]};
}
root.createWeddingEffects=createWeddingEffects;
})(typeof globalThis!=='undefined'?globalThis:window);
