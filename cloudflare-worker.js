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
  return await fetch('https://iframe.cloud/iframe/' + tmdbId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
      'Referer': 'https://iframe.cloud/'
    }
  });
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
    const cookies = getSetCookies(iframeResp);

    const results = {
      iframe_cloud_status: iframeResp.status,
      iframe_cloud_html_length: html.length,
      iframe_cloud_html_snippet: html.substring(0, 5000),
      raw_player_count: players.length,
      filtered_count: filtered.length,
      players: []
    };

    for (let i = 0; i < filtered.length; i++) {
      const p = filtered[i];
      const debug = { title: p.title, url: p.url, status: null, html_snippet: null, video_url: null };

      try {
        let embedUrl = p.url;
        if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
        const resp = await fetch(embedUrl, {
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
        debug.finalUrl = resp.url;
        const embedHtml = await resp.text();
        debug.html_snippet = embedHtml.substring(0, 3000);

        const result = extractVideoFromHtml(embedHtml);
        if (result) {
          debug.video_url = result.url;
          debug.video_type = result.type;
        }
      } catch (e) {
        debug.error = e.message;
      }

      results.players.push(debug);
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
  var match;

  var patterns = [
    /class="cinemaplayer-item-select"[^>]*data-value="([^"]+)"[^>]*>([^<]*)/g,
    /data-value="([^"]+)"[^>]*class="cinemaplayer-item-select"[^>]*>([^<]*)/g,
    /class="cinemaplayer-item-select"[^>]*>([^<]*)[^>]*data-value="([^"]+)"/g,
    /data-value="(https?:\/\/[^"]+)"[^>]*class="cinemaplayer-item-select"/g,
    /data-value="(https?:\/\/[^"]+)"[^>]*>/g,
    /class="cinemaplayer[^"]*"[^>]*data-value="(https?:\/\/[^"]+)"/g,
    /data-value="(https?:\/\/[^"]+)"\s*class/g,
    /class="[^"]*select[^"]*"[^>]*data-value="(https?:\/\/[^"]+)"/g
  ];

  for (var p = 0; p < patterns.length; p++) {
    var regex = new RegExp(patterns[p].source, patterns[p].flags);
    while ((match = regex.exec(html)) !== null) {
      var url, title;
      if (match[0].indexOf(match[1]) < match[0].indexOf(match[2] || '')) {
        url = match[1];
        title = match[2] || '';
      } else {
        url = match[2] || match[1];
        title = match[1] !== url ? match[1] : '';
      }

      if (url && url.indexOf('http') === 0 && !seen[url]) {
        seen[url] = true;
        players.push({ url: fixUrl(url), title: decodeHtml(title).trim() });
      }
    }
    if (players.length) break;
  }

  if (!players.length) {
    var allUrls = html.match(/data-value="(https?:\/\/[^"]+)"/g);
    if (allUrls) {
      for (var i = 0; i < allUrls.length; i++) {
        var m = allUrls[i].match(/data-value="(https?:\/\/[^"]+)"/);
        if (m && m[1] && !seen[m[1]]) {
          seen[m[1]] = true;
          players.push({ url: fixUrl(m[1]), title: '' });
        }
      }
    }
  }

  if (!players.length) {
    var hrefs = html.match(/href="(https?:\/\/[^"]*(?:player|embed|video|stream)[^"]*)"/gi);
    if (hrefs) {
      for (var j = 0; j < hrefs.length; j++) {
        var hm = hrefs[j].match(/href="([^"]+)"/);
        if (hm && hm[1] && !seen[hm[1]]) {
          seen[hm[1]] = true;
          players.push({ url: fixUrl(hm[1]), title: '' });
        }
      }
    }
  }

  return players;
}
