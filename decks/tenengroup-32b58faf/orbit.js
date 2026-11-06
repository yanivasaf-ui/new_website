(function(){
if(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)return;
var sl=document.getElementById('slide-3');if(!sl)return;
var els=[].slice.call(sl.querySelectorAll('div'));
var OX=80,OY=40,CX=1336,CY=496,items=[];
els.forEach(function(e){var bg=e.style.backgroundColor.replace(/\s/g,''),dir=bg==='rgb(34,51,92)'?1:bg==='rgb(123,74,114)'?-1:0;if(!dir)return;
 var l=parseFloat(e.style.left),t=parseFloat(e.style.top),w=parseFloat(e.style.width),h=parseFloat(e.style.height);
 var dx=l+w/2-CX,dy=t+h/2-CY;items.push({e:e,r:Math.hypot(dx,dy),a:Math.atan2(dy,dx),dir:dir,w:w,h:h,sp:dir>0?2*Math.PI/200:2*Math.PI/260})});
els.forEach(function(e){if(e.style.position!=='absolute'||e.style.left===''||parseFloat(e.style.top)<100&&parseFloat(e.style.left)<500)return;if(!e.style.translate)e.style.translate=OX+'px '+OY+'px'});
var vis=false;new IntersectionObserver(function(es){vis=es[0].isIntersecting},{threshold:.2}).observe(sl);
var t0=performance.now();
function tick(now){if(vis){var s=(now-t0)/1000;items.forEach(function(o){var a=o.a+o.dir*o.sp*s,x=CX+o.r*Math.cos(a)-o.w/2,y=CY+o.r*Math.sin(a)-o.h/2,bx=CX+o.r*Math.cos(o.a)-o.w/2,by=CY+o.r*Math.sin(o.a)-o.h/2;
 o.e.style.translate=(x-bx+OX).toFixed(1)+'px '+(y-by+OY).toFixed(1)+'px'})}requestAnimationFrame(tick)}
requestAnimationFrame(tick);
})();
