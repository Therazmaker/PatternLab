/**
 * worker/index.js
 * Cloudflare Worker – proxies Yahoo Finance chart data for the PatternLab
 * GitHub Pages frontend, adding CORS headers so the browser can fetch it.
 *
 * Endpoint : GET /yahoo-chart
 * Query params:
 *   symbol   – ticker symbol   (default: EURUSD=X)
 *   interval – candle interval  (default: 5m)
 *   range    – history range    (default: 5d)
 */

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Handle pre-flight CORS requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname !== "/yahoo-chart") {
      return new Response(
        JSON.stringify({ error: "Not found", path: url.pathname }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const symbol = url.searchParams.get("symbol") || "EURUSD=X";
    const interval = url.searchParams.get("interval") || "5m";
    const range = url.searchParams.get("range") || "5d";

    const yahooUrl = `${YAHOO_BASE}${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;

    let response;
    try {
      response = await fetch(yahooUrl);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "upstream_fetch_failed", message: err.message }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    let json;
    try {
      json = await response.json();
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "invalid_upstream_json", message: err.message }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "upstream_http_error",
          status: response.status,
          body: json,
        }),
        { status: response.status, headers: CORS_HEADERS }
      );
    }

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: CORS_HEADERS,
    });
  },
};
