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
    const embedUrl = url.searchParams.get('embed');

    if (proxyUrl) {
      return await handleProxy(proxyUrl, corsHeaders);
    }

    if (embedUrl) {
      return await handleEmbedFetch(embedUrl, corsHeaders);
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

async function getPlayers(tmdbId) {
  var resp = await fetch('https://iframe.cloud/iframe/' + tmdbId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0'
    }
  });

  if (!resp.ok) throw new Error('iframe.cloud returned ' + resp.status);

  var html = await resp.text();
  var players = extractPlayers(html);

  players = players.filter(function(p) { return !isVeoveo(p); });

  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    try {
      var result = await tryGetVideoUrl(p.url);
      if (result) {
        p.video_url = result.url;
        p.type = result.type;
      }
    } catch (e) {}
  }

  return players;
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

async function handleEmbedFetch(embedUrl, corsHeaders) {
  try {
    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
    var resp = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        'Referer': 'https://iframe.cloud/'
      },
      redirect: 'follow'
    });
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'Embed returned ' + resp.status, status: resp.status }), {
        status: resp.status, headers: corsHeaders
      });
    }
    var html = await resp.text();
    var result = extractVideoFromHtml(html);
    return new Response(JSON.stringify({
      status: resp.status,
      html_length: html.length,
      html_snippet: html.substring(0, 5000),
      video: result
    }), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function tryGetVideoUrl(embedUrl) {
  if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

  var resp = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
      'Referer': 'https://iframe.cloud/'
    },
    redirect: 'follow'
  });

  if (!resp.ok) return null;
  var html = await resp.text();
  return extractVideoFromHtml(html);
}

function extractVideoFromHtml(html) {
  var patterns = [
    /["'](https?:\/\/[^"'\s]*superdupercdn[^"'\s]*\.m3u8[^"'\s]*)/gi,
    /["'](https?:\/\/[^"'\s]*superdupercdn[^"'\s]*\.mp4[^"'\s]*)/gi,
    /(?:file|src|video|url|source|playbackUrl|videoUrl|streamUrl|hls|dash|manifest)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
    /(?:file|src|video|url|source|playbackUrl|videoUrl|streamUrl|hls|dash)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
    /["'](?:file|src|video|url|source|hls|dash)["']\s*:\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
    /["'](?:file|src|video|url|source|hls|dash)["']\s*:\s*["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
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
    .replace(/&#x27;/g, "'")
    .replace(/&#\d+;/g, function(m) {
      try { return String.fromCharCode(parseInt(m.substring(2, m.length - 1))); } catch(e) { return m; }
    });
}

function fixUrl(url) {
  url = decodeHtml(url).trim();
  if (url.indexOf('http://') === 0) url = 'https://' + url.substring(7);
  return url;
}

function extractPlayers(html) {
  var players = [];
  var seen = {};

  var regex = /data-value="(https?:\/\/[^"]+)"[^>]*>([^<]*)/g;
  var match;

  while ((match = regex.exec(html)) !== null) {
    var url = fixUrl(match[1]);
    var title = decodeHtml(match[2]).trim();
    if (!seen[url]) {
      seen[url] = true;
      players.push({ url: url, title: title });
    }
  }

  if (!players.length) {
    var regex2 = /data-value="(https?:\/\/[^"]+)"/g;
    while ((match = regex2.exec(html)) !== null) {
      var u = fixUrl(match[1]);
      if (!seen[u]) {
        seen[u] = true;
        players.push({ url: u, title: '' });
      }
    }
  }

  return players;
}
