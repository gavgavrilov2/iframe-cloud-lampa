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

    if (!tmdbId) {
      return new Response(JSON.stringify({ error: 'Missing id parameter' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    try {
      const iframeUrl = 'https://iframe.cloud/iframe/' + tmdbId;
      const iframeResp = await fetch(iframeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://iframe.cloud/',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });

      if (!iframeResp.ok) {
        return new Response(JSON.stringify({ error: 'iframe.cloud returned ' + iframeResp.status }), {
          status: 502,
          headers: corsHeaders
        });
      }

      const iframeHtml = await iframeResp.text();
      const players = extractPlayers(iframeHtml);

      return new Response(JSON.stringify({
        tmdb_id: tmdbId,
        players: players
      }), { headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

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
  if (url.startsWith('http://')) url = 'https://' + url.substring(7);
  return url;
}

function extractPlayers(html) {
  const players = [];
  let match;

  const regex1 = /class="cinemaplayer-item-select"[^>]*data-value="([^"]+)"[^>]*>([^<]*)/g;
  while ((match = regex1.exec(html)) !== null) {
    players.push({ url: fixUrl(match[1]), title: decodeHtml(match[2].trim()) });
  }

  if (!players.length) {
    const regex2 = /data-value="([^"]+)"[^>]*class="cinemaplayer-item-select"/g;
    while ((match = regex2.exec(html)) !== null) {
      players.push({ url: fixUrl(match[1]), title: '' });
    }
  }

  if (!players.length) {
    const regex3 = /data-value="(https?:\/\/[^"]+)"/g;
    while ((match = regex3.exec(html)) !== null) {
      players.push({ url: fixUrl(match[1]), title: '' });
    }
  }

  return players;
}
