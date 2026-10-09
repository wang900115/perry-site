document.getElementById('y').textContent=new Date().getFullYear();
(function(){var h=location.hostname,p=location.pathname,m=p.match(/\/ipfs\/([a-zA-Z0-9]+)/)||h.match(/^([a-z0-9]{46,})\.ipfs\./);
document.getElementById('cid').textContent=m?m[1].slice(0,10)+'…'+m[1].slice(-6):'—';})();
document.querySelectorAll('[data-s]').forEach(function(el){
fetch('https://api.github.com/repos/wang900115/'+el.dataset.s).then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&typeof j.stargazers_count==='number')el.textContent=j.stargazers_count}).catch(function(){})});

// terminal typing (language-aware)
var T={
zh:{city:'"台北"',focus:['"分散式"','"高併發"','"交易"'],note:'  // 星際伺服器'},
en:{city:'"Taipei"',focus:['"distributed"','"concurrency"','"trading"'],note:'  // InterPlanetary File System'}};
var timer=null;
function lines(l){var t=T[l];return [
['c','// whoami'],['\n'],
['k','name'],['','     = '],['s','"Perry Wang"'],['\n'],
['k','city'],['','     = '],['s',t.city],['\n'],
['k','langs'],['','    = []string{'],['s','"Go"'],['',', '],['s','"Rust"'],['',', '],['s','"Tolk"'],['',', '],['s','"Solidity"'],['',', '],['s','"Etc..."'],['','}'],['\n'],
['k','focus'],['','    = []string{'],['s',t.focus[0]],['',', '],['s',t.focus[1]],['',', '],['s',t.focus[2]],['','}'],['\n'],
['k','hosting'],['','  = '],['w','"IPFS"'],['c',t.note],['\n'],
['c','$ '],['cur']];}
function type(l){clearTimeout(timer);var L=lines(l),el=document.getElementById('t'),i=0,j=0,sp=null,
fast=matchMedia('(prefers-reduced-motion: reduce)').matches;
el.innerHTML='<span class="c">$</span> <span class="k">go run</span> ./cmd/perry\n';
function step(){if(i>=L.length)return;var x=L[i];
if(x[0]==='\n'){el.appendChild(document.createTextNode('\n'));i++;timer=setTimeout(step,fast?0:110);return}
if(x[0]==='cur'){var c=document.createElement('span');c.id='cursor';el.appendChild(c);return}
if(!sp){sp=document.createElement('span');if(x[0])sp.className=x[0];el.appendChild(sp);j=0}
j=fast?x[1].length:j+1;sp.textContent=x[1].slice(0,j);
if(j>=x[1].length){sp=null;i++}timer=setTimeout(step,fast?0:18)}
timer=setTimeout(step,300)}

// language toggle
function setLang(l){var d=document.documentElement;d.className=l;d.lang=l==='en'?'en':'zh-Hant';
try{localStorage.setItem('lang',l)}catch(e){}type(l)}
document.querySelectorAll('.lt button').forEach(function(b){b.onclick=function(){if(document.documentElement.className!==b.dataset.l)setLang(b.dataset.l)}});
type(document.documentElement.className==='en'?'en':'zh');
