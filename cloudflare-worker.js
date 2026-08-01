export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const kpuUrl = url.searchParams.get('kpu');
    const proxyUrl = url.searchParams.get('proxy');
    const apiKey = url.searchParams.get('apikey');
    const apiUrl = url.searchParams.get('api');

    if (kpuUrl) {
      return await handleKpuProxy(kpuUrl, corsHeaders);
    }

    if (apiUrl) {
      return await handleApiProxy(apiUrl, apiKey, corsHeaders);
    }

    if (proxyUrl) {
      return await handleProxy(proxyUrl, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Usage: ?kpu=URL or ?proxy=URL or ?api=URL&apikey=TOKEN' }), {
      status: 400, headers: corsHeaders
    });
  }
};

const KPU_TOKEN = '7edcf64b-b9aa-4f8b-8b5c-ef59bfe69a2c';

async function handleKpuProxy(targetUrl, corsHeaders) {
  try {
    var resp = await fetch(targetUrl, {
      headers: {
        'X-API-KEY': KPU_TOKEN,
        'Accept': 'application/json'
      },
      redirect: 'follow'
    });
    var data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleApiProxy(targetUrl, apiKey, corsHeaders) {
  try {
    var headers = { 'Accept': 'application/json' };
    if (apiKey) headers['X-API-KEY'] = apiKey;
    var resp = await fetch(targetUrl, { headers: headers, redirect: 'follow' });
    var data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleProxy(targetUrl, corsHeaders) {
  try {
    if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl;
    var target = new URL(targetUrl);
    var referer = target.origin + '/';
    var reqHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': referer,
        'Sec-Ch-Ua': '"Google Chrome";v="136", "Chromium";v="136"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
    };
    if (targetUrl.indexOf('api.kinopoisk.dev') !== -1) {
      reqHeaders['Accept'] = 'application/json';
    }
    var resp = await fetch(targetUrl, { headers: reqHeaders, redirect: 'follow' });
    var headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    var ct = resp.headers.get('Content-Type');
    headers['Content-Type'] = ct || 'text/html; charset=utf-8';
    return new Response(resp.body, { status: resp.status, headers: headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}
