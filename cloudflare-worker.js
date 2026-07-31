export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const tmdbId = url.searchParams.get('id');
    const proxyUrl = url.searchParams.get('proxy');
    const debugId = url.searchParams.get('debug');

    if (proxyUrl) {
      return await handleProxy(proxyUrl, corsHeaders);
    }

    if (debugId) {
      return await handleDebug(debugId, corsHeaders);
    }

    if (!tmdbId) {
      return new Response(JSON.stringify({ error: 'Missing id parameter' }), {
        status: 400, headers: corsHeaders
      });
    }

    try {
      const players = await getPlayers(tmdbId);
      return new Response(JSON.stringify({
        tmdb_id: tmdbId,
        players: players
      }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: corsHeaders
      });
    }
  }
};

async function getIframePage(tmdbId) {
  const resp = await fetch('https://iframe.cloud/iframe/' + tmdbId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
      'Referer': 'https://iframe.cloud/'
    }
  });
  return resp;
}

async function getPlayers(tmdbId) {
  const iframeResp = await getIframePage(tmdbId);

  if (!iframeResp.ok) throw new Error('iframe.cloud returned ' + iframeResp.status);

  const html = await iframeResp.text();
  let players = extractPlayers(html);

  players = players.filter(function(p) { return !isVeoveo(p); });

  const cookies = getSetCookies(iframeResp);

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    try {
      const result = await findVideoUrl(p.url, cookies);
      if (result) {
        p.video_url = result.url;
        p.type = result.type;
      }
    } catch (e) {}
  }

  return players;
}

function getSetCookies(resp) {
  const raw = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
  if (raw && raw.length) {
    return raw.map(function(c) { return c.split(';')[0]; }).join('; ');
  }
  const one = resp.headers.get('Set-Cookie');
  if (one) return one.split(';')[0];
  return '';
}

function isVeoveo(p) {
  var t = (p.title || '').toLowerCase();
  var u = (p.url || '').toLowerCase();
  return t.indexOf('veoveo') !== -1 || u.indexOf('veoveo') !== -1;
}

async function handleProxy(targetUrl, corsHeaders) {
  try {
    var resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });
    var headers = { 'Access-Control-Allow-Origin': '*' };
    var ct = resp.headers.get('Content-Type');
    if (ct) headers['Content-Type'] = ct;
    return new Response(resp.body, { status: resp.status, headers: headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleDebug(tmdbId, corsHeaders) {
  try {
    const iframeResp = await getIframePage(tmdbId);
    const html = await iframeResp.text();
    const players = extractPlayers(html);
    const filtered = players.filter(function(p) { return !isVeoveo(p); });

    const results = [];
    const cookies = getSetCookies(iframeResp);

    for (let i = 0; i < filtered.length; i++) {
      const p = filtered[i];
      const debug = { title: p.title, url: p.url, status: null, html_snippet: null, video_url: null };

      try {
        if (p.url.startsWith('//')) p.url = 'https:' + p.url;
        const resp = await fetch(p.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
            'Referer': 'https://iframe.cloud/',
            'Cookie': cookies
          },
          redirect: 'follow'
        });
        debug.status = resp.status;
        const embedHtml = await resp.text();
        debug.html_snippet = embedHtml.substring(0, 3000);

        const result = extractVideoFromHtml(embedHtml);
        if (result) {
          debug.video_url = result.url;
        }
      } catch (e) {
        debug.error = e.message;
      }

      results.push(debug);
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function findVideoUrl(embedUrl, cookies) {
  if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

  var attempts = [
    {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
      'Referer': 'https://iframe.cloud/',
      'Cookie': cookies || ''
    },
    {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9',
      'Referer': 'https://iframe.cloud/',
      'Cookie': cookies || ''
    }
  ];

  for (var i = 0; i < attempts.length; i++) {
    var result = await tryExtract(embedUrl, attempts[i]);
    if (result) return result;
  }

  return null;
}

async function tryExtract(embedUrl, headers) {
  try {
    var resp = await fetch(embedUrl, {
      headers: headers,
      redirect: 'follow'
    });
    if (!resp.ok) return null;
    var html = await resp.text();
    return extractVideoFromHtml(html);
  } catch (e) {
    return null;
  }
}

function extractVideoFromHtml(html) {
  var patterns = [
    /["'](https?:\/\/[^"'\s]*superdupercdn[^"'\s]*\.m3u8[^"'\s]*)/gi,
    /["'](https?:\/\/[^"'\s]*superdupercdn[^"'\s]*\.mp4[^"'\s]*)/gi,
    /["'](https?:\/\/[^"'\s]*cdn[^"'\s]*\.m3u8[^"'\s]*)/gi,
    /["'](https?:\/\/[^"'\s]*cdn[^"'\s]*\.mp4[^"'\s]*)/gi,
    /(?:file|src|video|url|source|playbackUrl|videoUrl|streamUrl)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
    /(?:file|src|video|url|source|playbackUrl|videoUrl|streamUrl)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
    /["'](?:file|src|video|url|source)["']\s*:\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
    /["'](?:file|src|video|url|source)["']\s*:\s*["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
    /data-(?:src|url|video|file)\s*=\s*["'](https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/gi,
    /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
    /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match;
    var regex = new RegExp(patterns[i].source, patterns[i].flags);
    while ((match = regex.exec(html)) !== null) {
      var url = match[1];
      if (url && (url.indexOf('.m3u8') !== -1 || url.indexOf('.mp4') !== -1)) {
        if (url.indexOf('example.com') !== -1) continue;
        if (url.indexOf('iframe.cloud') !== -1) continue;
        if (url.startsWith('//')) url = 'https:' + url;
        return {
          url: url,
          type: url.indexOf('.m3u8') !== -1 ? 'hls' : 'mp4'
        };
      }
    }
  }

  return null;
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function fixUrl(url) {
  url = decodeHtml(url);
  if (url.indexOf('http://') === 0) url = 'https://' + url.substring(7);
  return url;
}

function extractPlayers(html) {
  var players = [];
  var match;

  var regex1 = /class="cinemaplayer-item-select"[^>]*data-value="([^"]+)"[^>]*>([^<]*)/g;
  while ((match = regex1.exec(html)) !== null) {
    players.push({ url: fixUrl(match[1]), title: decodeHtml(match[2].trim()) });
  }

  if (!players.length) {
    var regex2 = /data-value="([^"]+)"[^>]*class="cinemaplayer-item-select"/g;
    while ((match = regex2.exec(html)) !== null) {
      players.push({ url: fixUrl(match[1]), title: '' });
    }
  }

  if (!players.length) {
    var regex3 = /data-value="(https?:\/\/[^"]+)"/g;
    while ((match = regex3.exec(html)) !== null) {
      players.push({ url: fixUrl(match[1]), title: '' });
    }
  }

  return players;
}
