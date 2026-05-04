'use strict';
const http = require('http');
const url  = require('url');
const https = require('https');

const PORT    = process.env.PORT    || 3000;
const SDK_URL = process.env.SDK_URL || 'https://confident-encouragement-production-edc6.up.railway.app';

// Supabase config (injetado via env no Railway)
const SUPABASE_URL    = process.env.SUPABASE_URL    || 'https://wmhybkrrgjhdfvkgpteg.supabase.co';
const SUPABASE_ANON   = process.env.SUPABASE_ANON   || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtaHlia3JyZ2poZGZ2a2dwdGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA4MDYsImV4cCI6MjA5MDQ5NjgwNn0.X_VAf_v1yrsdwXahBNQ4HWiRVmyNMtwNPZXoGh7ZlGY';

// ── Cache de clientes (TTL 60s) ────────────────────────────────────────────
let clientCache = {};
let cacheAt = 0;
const CACHE_TTL = 60_000;

function supabaseFetch(path) {
  return new Promise((resolve, reject) => {
    const reqUrl = new URL(SUPABASE_URL + path);
    const options = {
      hostname: reqUrl.hostname,
      path: reqUrl.pathname + reqUrl.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getClient(key) {
  // Renovar cache se expirado
  if (Date.now() - cacheAt > CACHE_TTL) {
    try {
      const rows = await supabaseFetch(
        '/rest/v1/sites?select=public_key,name,url&apikey=' + SUPABASE_ANON
      );
      const fresh = {};
      for (const r of rows) {
        if (!r.public_key) continue;
        // Extrair hostname da URL do site para allowed_domains
        let domains = ['localhost', '127.0.0.1'];
        try {
          const u = new URL(r.url);
          domains.push(u.hostname);
          domains.push('www.' + u.hostname);
        } catch(_) {}
        fresh[r.public_key] = {
          name: r.name,
          enabled: true,
          allowed_domains: domains,
          features: { survey: true, analytics: true, feedback: true },
          survey_config: { id: 'survey_' + r.public_key.slice(0, 8), trigger: 'exit_intent' }
        };
      }
      clientCache = fresh;
      cacheAt = Date.now();
      console.log('[SDK] Cache atualizado:', Object.keys(fresh).length, 'clientes');
    } catch(e) {
      console.error('[SDK] Erro ao buscar clientes:', e.message);
    }
  }
  return clientCache[key] || null;
}

// ── Loader JS (gerado por key) ─────────────────────────────────────────────
function makeLoader(key) {
  return `(function(w,d){'use strict';
try{
  var ns='SmartBirdly_${key}';if(w[ns])return;
  w[ns]={key:'${key}',loaded:false,blocked:false,queue:[],
    push:function(){this.queue.push(arguments)},
    info:function(){return{key:this.key,loaded:this.loaded,blocked:this.blocked,domain:w.location.hostname}}
  };
  var s=d.createElement('script');s.async=true;
  s.src='${SDK_URL}/core.v2.js';
  s.dataset.sbKey='${key}';
  var t=setTimeout(function(){w[ns].blocked=true},5000);
  s.onload=function(){clearTimeout(t)};
  s.onerror=function(){clearTimeout(t);w[ns].blocked=true};
  d.head.appendChild(s);
}catch(e){}
})(window,document);`;
}

// ── Core SDK ───────────────────────────────────────────────────────────────
const CORE_JS = `(function(w,d){'use strict';
try{
  var cs=d.currentScript||(function(){var ss=d.scripts;return ss[ss.length-1]})();
  var key=cs&&cs.dataset&&cs.dataset.sbKey;if(!key)return;
  var ns='SmartBirdly_'+key,SB=w[ns];if(!SB)return;
  function safe(fn){try{return fn()}catch(e){}}
  function vd(list,host){return list.some(function(d){
    if(d==='*')return true;
    if(d.indexOf('*.')===0)return host===d.slice(2)||host.endsWith('.'+d.slice(2));
    return d===host;
  })}
  fetch('${SDK_URL}/api/sdk-config?key='+encodeURIComponent(key))
    .then(function(r){return r.ok?r.json():null})
    .then(function(cfg){
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

// ── Test Page ──────────────────────────────────────────────────────────────
const TEST_HTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SmartBirdly SDK</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;color:#1d1d1f;padding:40px 24px}.wrap{max-width:680px;margin:0 auto}h1{font-size:26px;font-weight:700;margin-bottom:4px}.sub{color:#6e6e73;font-size:13px;margin-bottom:28px}.card{background:#fff;border:1px solid #d2d2d7;border-radius:14px;padding:22px;margin-bottom:14px}.card h2{font-size:15px;font-weight:600;margin-bottom:14px}.row{display:flex;gap:8px;flex-wrap:wrap}button{padding:8px 16px;border-radius:8px;border:1px solid #c7c7cc;background:#fff;font-size:13px;cursor:pointer;font-weight:500}button:hover{background:#f0f0f5}button.p{background:#0071e3;color:#fff;border-color:#0071e3}.st{margin-top:12px;padding:11px 14px;border-radius:9px;font-size:13px;display:none}.ok{background:#f0faf0;border:1px solid #b8e6b8;color:#1a5c1a}.er{background:#fff5f5;border:1px solid #ffc9c9;color:#8b0000}.wn{background:#fffce8;border:1px solid #ffe066;color:#7a5a00}pre{background:#1c1c1e;color:#e5e5ea;padding:14px;border-radius:10px;font-size:12px;overflow-x:auto;white-space:pre-wrap;margin-top:10px;display:none}</style></head>
<body><div class="wrap">
<h1>SmartBirdly SDK</h1><p class="sub">Servidor ativo — clientes carregados do Supabase dinamicamente</p>
<div class="card"><h2>Health Check</h2><div class="row"><button class="p" onclick="testHealth()">Testar</button></div><div class="st" id="s-health"></div></div>
<div class="card"><h2>API Config por Key</h2><div class="row"><input id="k" placeholder="public_key..." style="padding:8px 12px;border:1px solid #c7c7cc;border-radius:8px;font-size:13px;width:300px"><button class="p" onclick="testConfig()">Buscar</button></div><div class="st" id="s-cfg"></div><pre id="pre-cfg"></pre></div>
</div>
<script>
function show(id,msg,t){var e=document.getElementById(id);e.innerHTML=msg;e.className='st '+t;e.style.display='block'}
async function testHealth(){try{const r=await fetch('/api/health');const d=await r.json();show('s-health','✅ '+JSON.stringify(d),'ok')}catch(e){show('s-health','❌ '+e.message,'er')}}
async function testConfig(){const key=document.getElementById('k').value.trim();if(!key)return;show('s-cfg','⏳ Buscando...','wn');try{const r=await fetch('/api/sdk-config?key='+encodeURIComponent(key));const d=await r.json();if(r.ok){show('s-cfg','✅ Config encontrada','ok');const p=document.getElementById('pre-cfg');p.textContent=JSON.stringify(d,null,2);p.style.display='block'}else show('s-cfg','❌ '+d.error,'er')}catch(e){show('s-cfg','❌ '+e.message,'er')}}
<\/script></body></html>`;

// ── HTTP Helpers ───────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJS(res, code, maxAge) {
  cors(res);
  res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=' + (maxAge || 60) });
  res.end(code);
}
function sendJSON(res, status, data) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
  res.end(JSON.stringify(data));
}

// ── Server ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  // CDN Loader
  const m = pathname.match(/^\/survey-([a-zA-Z0-9_-]+)\.js$/);
  if (m) return sendJS(res, makeLoader(m[1]), 60);

  // Core SDK
  if (pathname === '/core.v2.js') return sendJS(res, CORE_JS, 60);

  // Backend API
  if (pathname === '/api/sdk-config') {
    const key = query.key;
    if (!key || !/^[a-zA-Z0-9_-]{4,80}$/.test(key)) return sendJSON(res, 400, { error: 'Invalid key' });
    const client = await getClient(key);
    if (!client) return sendJSON(res, 404, { error: 'Key not found' });
    return sendJSON(res, 200, {
      enabled: client.enabled,
      allowed_domains: client.allowed_domains,
      features: client.features,
      survey_config: client.survey_config,
      version: 'v2'
    });
  }

  // Health
  if (pathname === '/api/health') {
    return sendJSON(res, 200, {
      status: 'healthy',
      clients: Object.keys(clientCache).length,
      cache_age_s: Math.round((Date.now() - cacheAt) / 1000),
      sdk_url: SDK_URL
    });
  }

  // Test Page
  if (pathname === '/' || pathname === '/test') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(TEST_HTML);
  }

  res.writeHead(404); res.end('Not found');
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.error('Porta ocupada:', PORT); process.exit(1); }
  throw e;
});

// Pre-aquecer cache ao iniciar
getClient('__warmup__').then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  SmartBirdly SDK v2  —  Supabase-powered');
    console.log('══════════════════════════════════════════════════');
    console.log('  URL:     http://localhost:' + PORT);
    console.log('  Clientes: ' + Object.keys(clientCache).length + ' carregados do Supabase');
    console.log('══════════════════════════════════════════════════\n');
  });
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
