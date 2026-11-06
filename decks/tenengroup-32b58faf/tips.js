(function(){
var P={A1:["TRIGGER","The workflow starts by itself on a weekly schedule. Nobody has to remember to ask."],
A2:["COORDINATOR","The coordinator reads the request and hands the work to the right agents, here the Ads analyst and Competitor watch."],
A3:["ANALYSIS","The Ads analyst looks at last week's ad creatives and ranks them, so the team sees which ones led."],
A4:["RESEARCH","Competitor watch looks at the ads competitors are running, using Meta's public Ad Library."],
A5:["CONTENT","The Brief writer takes the ranking and the competitor research and drafts the next variants."],
A6:["REVIEW","The Gatekeeper checks the drafted content and the planned actions against the house rules before anything goes out."],
A7:["OUTPUT","The workflow ends with a brief and the ad uploads, ready for the team."],
B1:["TRIGGER","This workflow starts when the marketing emails bring fewer orders than before."],
B2:["COORDINATOR","The coordinator hands the work to the right agents, here the Analyst and the Brief writer."],
B3:["DATA","The Analyst reads how many people opened the emails, clicked, and ordered."],
B4:["ANALYSIS","The Analyst finds the step where shoppers stop, so the team knows what to fix."],
B5:["CONTENT","The Brief writer drafts new emails and subject lines for that step."],
B6:["REVIEW","The Gatekeeper checks the drafted content and the planned actions against the house rules before anything goes out."],
B7:["OUTPUT","The workflow ends with a revised email flow in Klaviyo, the tool that sends the emails."]};
var T={"coordinator":"The agent that reads a request and hands each part to the right agent.",
"ads analyst":"An agent that studies how ads perform and ranks them.",
"competitor watch":"An agent that looks at the ads and moves competitors make.",
"brief writer":"An agent that turns findings into a clear brief and first drafts.",
"analyst":"An agent that reads the numbers and explains what they show.",
"gatekeeper":"An agent that checks work against the house rules before it goes out.",
"meta ad library":"Meta's public archive of the ads currently running on Facebook and Instagram.",
"klaviyo":"The tool many online shops use to send marketing emails.",
"house rules":"The team's own do's and don'ts, written down so every agent follows them.",
"team memory":"The shared record of what the team has learned, which every agent can read.",
"flow":"A series of emails that send automatically after something a shopper does."};
var sl=document.getElementById('slide-5');if(!sl)return;
var boxes=[].slice.call(sl.querySelectorAll('div[style*="width:212px"]'));
var tip=document.createElement('div');tip.id='tip';document.body.appendChild(tip);
var pan=document.createElement('div');pan.id='pan';document.body.appendChild(pan);
var sel=null;
function place(el,anchor,gap){var r=anchor.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight;
 var x=Math.min(Math.max(12,r.left+r.width/2-w/2),window.innerWidth-w-12);
 var y=r.bottom+gap;if(y+h>window.innerHeight-76)y=r.top-h-gap;
 el.style.left=x+'px';el.style.top=Math.max(8,y)+'px'}
function closePan(){pan.classList.remove('on');if(sel)sel.classList.remove('sel');sel=null}
boxes.forEach(function(b,i){var id=(i<7?'A':'B')+(i%7+1);b.classList.add('bx');b.tabIndex=0;b.setAttribute('role','button');
 function open(e){e.stopPropagation();if(sel===b){closePan();return}closePan();sel=b;b.classList.add('sel');
  pan.innerHTML='<b></b><span></span>';pan.firstChild.textContent=P[id][0];pan.lastChild.textContent=P[id][1];
  pan.classList.add('on');place(pan,b,14)}
 b.addEventListener('click',open);b.addEventListener('keydown',function(e){if(e.key==='Enter'){open(e)}});});
document.addEventListener('click',closePan);
document.addEventListener('keydown',function(e){if(e.key==='Escape'){closePan();tip.classList.remove('on')}});
document.getElementById('deck').addEventListener('scroll',function(){closePan();tip.classList.remove('on')},{passive:true});
window.addEventListener('resize',closePan);
/* hover definitions */
var keys=Object.keys(T).sort(function(a,b){return b.length-a.length}),re=new RegExp('\\b('+keys.join('|')+')\\b','gi');
var w=document.createTreeWalker(sl.querySelector('section'),NodeFilter.SHOW_TEXT),nodes=[],n;
while(n=w.nextNode()){if(n.parentNode.closest('h2,[style*="letter-spacing:0.1em"],[style*="letter-spacing:0.02em"]'))continue;
 if(n.parentNode.tagName==='P'||n.parentNode.tagName==='SPAN')nodes.push(n)}
nodes.forEach(function(t){var s=t.nodeValue;re.lastIndex=0;if(!re.test(s))return;re.lastIndex=0;
 var f=document.createDocumentFragment(),last=0,m;
 while(m=re.exec(s)){f.appendChild(document.createTextNode(s.slice(last,m.index)));
  var sp=document.createElement('span');sp.className='term';sp.tabIndex=0;sp.dataset.k=m[1].toLowerCase();sp.textContent=m[1];f.appendChild(sp);last=m.index+m[1].length}
 f.appendChild(document.createTextNode(s.slice(last)));t.parentNode.replaceChild(f,t)});
function show(el){tip.textContent=T[el.dataset.k];tip.classList.add('on');place(tip,el,10)}
sl.addEventListener('mouseover',function(e){var t=e.target.closest&&e.target.closest('.term');if(t)show(t)});
sl.addEventListener('mouseout',function(e){if(e.target.closest&&e.target.closest('.term'))tip.classList.remove('on')});
sl.addEventListener('focusin',function(e){if(e.target.classList.contains('term'))show(e.target)});
sl.addEventListener('focusout',function(){tip.classList.remove('on')});
sl.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('.term');if(t){tip.classList.contains('on')?0:show(t)}});
/* hint */
var h=document.createElement('div');h.id='bxhint';h.textContent='Click a step to see what it does';sl.querySelector('.frame').appendChild(h);
})();
