'use strict';
const http = require('http');
const url  = require('url');
const PORT = process.env.PORT || 3000;

const DB = {
  'abc123': {
    name: 'Acme Corp', enabled: true,
    allowed_domains: ['acme.com','www.acme.com','localhost','127.0.0.1'],
    features: { survey: true, analytics: true, feedback: true },
    survey_config:    { id: 'survey_acme_001', trigger: 'exit_intent', frequency: 'once_per_session' },
    analytics_config: { tracking_id: 'track_acme_001' },
    feedback_config:  { position: 'bottom_right', button_text: 'Feedback' }
  },
  'xyz789': {
    name: 'Beta Inc', enabled: true,
    allowed_domains: ['beta.com','app.beta.com','localhost','127.0.0.1'],
    features: { survey: true, analytics: false, feedback: false },
    survey_config: { id: 'survey_beta_001', trigger: 'time_on_page', frequency: 'once_per_day' }
  }
};

function makeLoader(key) {
  return `(function(w,d){'use strict';
try{
  var ns='SmartBirdly_${key}';if(w[ns])return;
  w[ns]={key:'${key}',loaded:false,blocked:false,queue:[],
    push:function(){this.queue.push(arguments)},
    info:function(){return{key:this.key,loaded:this.loaded,blocked:this.blocked,domain:w.location.hostname}}
  };
  var s=d.createElement('script');s.async=true;
  s.src=w.location.protocol+'//'+w.location.host+'/core.v1.js';
  s.dataset.sbKey='${key}';
  var t=setTimeout(function(){w[ns].blocked=true},5000);
  s.onload=function(){clearTimeout(t)};s.onerror=function(){clearTimeout(t);w[ns].blocked=true};
  d.head.appendChild(s);
}catch(e){}
})(window,document);`;
}

const CORE_JS = `(function(w,d){'use strict';
try{
  var cs=d.currentScript||(function(){var ss=d.scripts;return ss[ss.length-1]})();
  var key=cs&&cs.dataset&&cs.dataset.sbKey;if(!key)return;
  var ns='SmartBirdly_'+key,SB=w[ns];if(!SB)return;
  function safe(fn){try{return fn()}catch(e){}}
  function vd(list,host){return list.some(function(d){if(d==='*')return true;if(d.indexOf('*.')===0)return host===d.slice(2)||host.endsWith('.'+d.slice(2));return d===host;})}
  var p=new Promise(function(res,rej){
    var t=setTimeout(function(){rej(new Error('timeout'))},4000);
    fetch(w.location.protocol+'//'+w.location.host+'/api/sdk-config?key='+encodeURIComponent(key))
      .then(function(r){clearTimeout(t);return r.ok?r.json():null}).then(res)
      .catch(function(e){clearTimeout(t);rej(e)});
  });
  p.then(function(cfg){
    if(!cfg||!cfg.enabled){SB.blocked=true;return}
    if(!vd(cfg.allowed_domains||[],w.location.hostname)){SB.blocked=true;return}
    SB.loaded=true;SB.config=cfg;
    var f=cfg.features||{};
    if(f.survey)   SB.survey   ={id:cfg.survey_config&&cfg.survey_config.id,show:function(){console.log('[SmartBirdly] Survey:',this.id)}};
    if(f.analytics)SB.analytics={track:function(e,d){console.log('[SmartBirdly] Track:',e,d)}};
    if(f.feedback) SB.feedback ={show:function(){console.log('[SmartBirdly] Feedback')}};
    if(SB.queue&&SB.queue.length){SB.queue.forEach(function(a){safe(function(){})});SB.queue=[]}
    if(w.SmartBirdlyReady)safe(function(){w.SmartBirdlyReady(SB)});
  }).catch(function(){SB.blocked=true});
}catch(e){}
})(window,document);`;

const TEST_HTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SmartBirdly – Teste</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;color:#1d1d1f;padding:40px 24px}.wrap{max-width:680px;margin:0 auto}h1{font-size:26px;font-weight:700;margin-bottom:4px}.sub{color:#6e6e73;font-size:13px;margin-bottom:28px}.card{background:#fff;border:1px solid #d2d2d7;border-radius:14px;padding:22px;margin-bottom:14px}.card h2{font-size:15px;font-weight:600;margin-bottom:4px}.card p{font-size:13px;color:#6e6e73;margin-bottom:14px;line-height:1.5}.pill{display:inline-block;padding:1px 9px;border-radius:20px;font-size:11px;font-weight:600;font-family:monospace;margin-left:6px}.pill.g{background:#d1f5d1;color:#1a5c1a}.pill.b{background:#e0f0ff;color:#004080}.row{display:flex;gap:8px;flex-wrap:wrap}button{padding:8px 16px;border-radius:8px;border:1px solid #c7c7cc;background:#fff;font-size:13px;cursor:pointer;font-weight:500}button:hover{background:#f0f0f5}button.p{background:#0071e3;color:#fff;border-color:#0071e3}button.p:hover{background:#006bd6}.st{margin-top:12px;padding:11px 14px;border-radius:9px;font-size:13px;line-height:1.5;display:none}.ok{background:#f0faf0;border:1px solid #b8e6b8;color:#1a5c1a}.er{background:#fff5f5;border:1px solid #ffc9c9;color:#8b0000}.wn{background:#fffce8;border:1px solid #ffe066;color:#7a5a00}pre{background:#1c1c1e;color:#e5e5ea;padding:14px;border-radius:10px;font-size:12px;overflow-x:auto;white-space:pre-wrap;margin-top:10px;display:none;line-height:1.6}code{font-family:monospace;font-size:12px;background:#f0f0f5;padding:1px 5px;border-radius:4px}.badge{display:inline-flex;align-items:center;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-left:10px;vertical-align:middle}.badge.pend{background:#f5f5f7;color:#6e6e73;border:1px solid #d2d2d7}.badge.pass{background:#d1f5d1;color:#1a5c1a;border:1px solid #b8e6b8}hr{border:none;border-top:1px solid #e5e5ea;margin:24px 0}</style></head><body><div class="wrap"><h1>SmartBirdly SDK <span id="badge" class="badge pend">não testado</span></h1><p class="sub">Testes de isolamento multi-cliente</p><div class="card"><h2>Cliente 1 <span class="pill g">abc123</span><span class="pill b">Acme Corp</span></h2><p>Features: survey + analytics + feedback</p><div class="row"><button class="p" onclick="load('abc123')">Carregar SDK</button><button onclick="info('abc123')">Info</button></div><div class="st" id="s-abc123"></div></div><div class="card"><h2>Cliente 2 <span class="pill g">xyz789</span><span class="pill b">Beta Inc</span></h2><p>Features: survey apenas</p><div class="row"><button class="p" onclick="load('xyz789')">Carregar SDK</button><button onclick="info('xyz789')">Info</button></div><div class="st" id="s-xyz789"></div></div><div class="card"><h2>Isolamento</h2><p>Verifica <code>SmartBirdly_abc123 !== SmartBirdly_xyz789</code></p><button class="p" onclick="testIso()">Verificar</button><div class="st" id="s-iso"></div></div><hr><div class="card"><h2>Backend API</h2><p>Teste ao endpoint <code>/api/sdk-config?key=…</code></p><div class="row" style="margin-bottom:0"><input id="ak" value="abc123" style="padding:8px 12px;border:1px solid #c7c7cc;border-radius:8px;font-size:13px;width:180px;font-family:monospace"><button class="p" onclick="testAPI()">Buscar</button></div><div class="st" id="s-api"></div><pre id="pre-api"></pre></div></div><script>function show(id,msg,t){var e=document.getElementById(id);e.innerHTML=msg;e.className='st '+t;e.style.display='block'}function load(key){show('s-'+key,'⏳ Carregando…','wn');var s=document.createElement('script');s.src='/survey-'+key+'.js';s.onerror=function(){show('s-'+key,'❌ Erro','er')};document.head.appendChild(s);var n=0;(function chk(){var inst=window['SmartBirdly_'+key];if(!inst&&n++<25)return setTimeout(chk,200);if(!inst)return show('s-'+key,'❌ Namespace não criado','er');if(inst.loaded){show('s-'+key,'✅ Carregado! key=<strong>'+inst.key+'</strong> domain='+inst.info().domain,'ok');upd()}else if(inst.blocked)show('s-'+key,'⚠️ Bloqueado','wn');else if(n<25){n++;setTimeout(chk,200)}else show('s-'+key,'⏳ Timeout','wn')})()}function info(key){var i=window['SmartBirdly_'+key];if(!i)return show('s-'+key,'Carregue o SDK primeiro','wn');show('s-'+key,'<pre style="margin:0;background:none;padding:0;display:block;color:inherit;font-size:12px">'+JSON.stringify(i.info(),null,2)+'</pre>','ok')}function testIso(){var a=window.SmartBirdly_abc123,b=window.SmartBirdly_xyz789;if(!a||!b)return show('s-iso','⚠️ Carregue os dois clientes primeiro','wn');if(a!==b){show('s-iso','✅ <strong>ISOLADOS!</strong> SmartBirdly_abc123 !== SmartBirdly_xyz789','ok');var el=document.getElementById('badge');el.textContent='✅ Tudo OK';el.className='badge pass'}else show('s-iso','❌ CONFLITO','er')}function upd(){var a=window.SmartBirdly_abc123,b=window.SmartBirdly_xyz789;if(a&&b&&a.loaded&&b.loaded){var el=document.getElementById('badge');el.textContent='Pronto para testar';el.className='badge pass'}}async function testAPI(){var key=document.getElementById('ak').value.trim();if(!key)return;show('s-api','⏳…','wn');try{var r=await fetch('/api/sdk-config?key='+encodeURIComponent(key));var d=await r.json();if(r.ok){show('s-api','✅ Config recebida (HTTP '+r.status+')','ok');var p=document.getElementById('pre-api');p.textContent=JSON.stringify(d,null,2);p.style.display='block'}else{show('s-api','❌ '+d.error,'er');document.getElementById('pre-api').style.display='none'}}catch(e){show('s-api','❌ Erro: '+e.message,'er')}}<\/script></body></html>`;

function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type')}
function sendJS(res,code,a){cors(res);res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'public, max-age='+(a||600)});res.end(code)}
function sendJSON(res,s,d){cors(res);res.writeHead(s,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=600'});res.end(JSON.stringify(d))}
function sendHTML(res,c){cors(res);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(c)}

const server=http.createServer(function(req,res){
  const{pathname,query}=url.parse(req.url,true);
  if(req.method==='OPTIONS'){cors(res);res.writeHead(204);return res.end()}
  const m=pathname.match(/^\/survey-([a-zA-Z0-9_-]+)\.js$/);
  if(m)return sendJS(res,makeLoader(m[1]));
  if(pathname==='/core.v1.js')return sendJS(res,CORE_JS,31536000);
  if(pathname==='/api/sdk-config'){
    const k=query.key;
    if(!k||!/^[a-zA-Z0-9_-]{4,50}$/.test(k))return sendJSON(res,400,{error:'Invalid key format'});
    const c=DB[k];
    if(!c)return sendJSON(res,404,{error:'Key not found'});
    return sendJSON(res,200,{enabled:c.enabled,allowed_domains:c.allowed_domains,features:c.features,survey_config:c.survey_config||null,analytics_config:c.analytics_config||null,feedback_config:c.feedback_config||null,cache_ttl:600,version:'v1'});
  }
  if(pathname==='/api/health'){const c=DB[query.key||'abc123'];return sendJSON(res,c?200:404,c?{status:'healthy',name:c.name,domains:c.allowed_domains.length}:{status:'not_found'})}
  if(pathname==='/'||pathname==='/test')return sendHTML(res,TEST_HTML);
  res.writeHead(404);res.end('Not found');
});
server.on('error',function(e){if(e.code==='EADDRINUSE'){console.error('\n❌ Porta '+PORT+' ocupada. Tente: PORT=8080 node server.js\n');process.exit(1)}throw e});
server.listen(PORT,'0.0.0.0',function(){
  console.log('\n'+'═'.repeat(52));
  console.log('  SmartBirdly SDK  —  Servidor rodando!');
  console.log('═'.repeat(52));
  console.log('  URL → http://localhost:'+PORT);
  console.log('  Abra no navegador para testar');
  console.log('═'.repeat(52)+'\n');
});
process.on('SIGTERM',function(){server.close(function(){process.exit(0)})});
process.on('SIGINT', function(){server.close(function(){process.exit(0)})});
