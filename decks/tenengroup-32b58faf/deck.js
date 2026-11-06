(function(){
var deck=document.getElementById('deck'),slides=[].slice.call(document.querySelectorAll('.slide')),N=slides.length,cur=1;
var bar=64;
function fit(){var s=Math.min(window.innerWidth/1920,(window.innerHeight-bar)/1080);document.documentElement.style.setProperty('--s',s)}
window.addEventListener('resize',fit);fit();
/* entrance animation targets: every direct child of each slide section except the full-bleed photo and notes */
slides.forEach(function(sl){var sec=sl.querySelector('section'),i=0;[].slice.call(sec.children).forEach(function(c){
 if(c.tagName==='ASIDE')return;
 if(c.tagName==='IMG'&&/width:\s*1920px/.test(c.getAttribute('style')||''))return;
 c.classList.add('rv');c.style.setProperty('--i',i++);});
 var glow=sl.querySelector('[style*="background:#D9A441"]');if(glow&&/compounding|system/.test(sl.dataset.name))glow.classList.add('pulse');});
var dots=[].slice.call(document.querySelectorAll('.dot')),count=document.getElementById('count'),prev=document.getElementById('prev'),next=document.getElementById('next');
function go(n){n=Math.max(1,Math.min(N,n));slides[n-1].scrollIntoView({behavior:'smooth',block:'start'})}
function setCur(n){cur=n;dots.forEach(function(d,i){d.classList.toggle('on',i===n-1)});count.textContent=n+' / '+N;prev.disabled=n===1;next.disabled=n===N;
 if(history.replaceState)history.replaceState(null,'','#slide-'+n)}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');setCur(slides.indexOf(e.target)+1)}})},{root:deck,threshold:.55});
slides.forEach(function(s){io.observe(s)});
prev.addEventListener('click',function(){go(cur-1)});next.addEventListener('click',function(){go(cur+1)});
dots.forEach(function(d){d.addEventListener('click',function(){go(+d.dataset.go)})});
document.addEventListener('keydown',function(e){var k=e.key;
 if(k==='ArrowDown'||k==='ArrowRight'||k==='PageDown'||k===' '){e.preventDefault();go(cur+1)}
 else if(k==='ArrowUp'||k==='ArrowLeft'||k==='PageUp'){e.preventDefault();go(cur-1)}
 else if(k==='Home'){e.preventDefault();go(1)}else if(k==='End'){e.preventDefault();go(N)}});
var m=location.hash.match(/slide-(\d+)/);if(m){var s=slides[+m[1]-1];if(s){deck.style.scrollBehavior='auto';s.scrollIntoView();s.classList.add('in');deck.style.scrollBehavior=''}}else{slides[0].classList.add('in')}
setCur(m?+m[1]:1);
var hint=document.getElementById('hint');try{if(!sessionStorage.getItem('hintx')){hint.classList.add('show')}}catch(e){hint.classList.add('show')}
document.getElementById('hintx').addEventListener('click',function(){hint.classList.remove('show');try{sessionStorage.setItem('hintx','1')}catch(e){}});
})();