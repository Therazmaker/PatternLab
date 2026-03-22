import { normalizeBinanceInterval, normalizeBinanceSymbol, normalizeBinanceWsKline } from "./binanceNormalize.js";

const BINANCE_WS_BASE = "wss://fstream.binance.com/ws";

export class BinanceKlineWsClient {
  constructor(config = {}) {
    this.config = {
      reconnectDelayMs: 1200,
      staleAfterMs: 45000,
      maxReconnectDelayMs: 15000,
      ...config,
    };
    this.socket = null;
    this.subscriptionToken = 0;
    this.reconnectAttempts = 0;
    this.staleTimer = null;
    this.lastMessageAt = 0;
    this.pendingReconnect = null;
    this.handlers = null;
    this.activeStream = null;
    this.stopped = true;
  }

  subscribe(options = {}, handlers = {}) {
    this.unsubscribe();
    this.handlers = handlers;
    this.stopped = false;
    this.subscriptionToken += 1;
    const token = this.subscriptionToken;
    const symbol = normalizeBinanceSymbol(options.symbol);
    const timeframe = normalizeBinanceInterval(options.timeframe);
    this.activeStream = { symbol, timeframe };
    this.#openSocket({ symbol, timeframe, token });
    return token;
  }

  unsubscribe() {
    this.stopped = true;
    this.subscriptionToken += 1;
    this.activeStream = null;
    if (this.pendingReconnect) {
      clearTimeout(this.pendingReconnect);
      this.pendingReconnect = null;
    }
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
  }

  getStatus() {
    return {
      stream: this.activeStream,
      connected: this.socket?.readyState === WebSocket.OPEN,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageAt: this.lastMessageAt || null,
      stale: this.lastMessageAt ? (Date.now() - this.lastMessageAt > this.config.staleAfterMs) : true,
    };
  }

  #openSocket({ symbol, timeframe, token }) {
    if (this.stopped || token !== this.subscriptionToken) return;
    const streamName = `${symbol.toLowerCase()}@kline_${timeframe}`;
    const wsUrl = `${BINANCE_WS_BASE}/${streamName}`;
    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      if (token !== this.subscriptionToken) return;
      this.reconnectAttempts = 0;
      this.lastMessageAt = Date.now();
      this.handlers?.onStatus?.({ type: "open", connected: true, symbol, timeframe, reconnectAttempts: this.reconnectAttempts, at: new Date().toISOString() });
      this.#ensureStaleGuard(token);
    };

    socket.onmessage = (event) => {
      if (token !== this.subscriptionToken) return;
      this.lastMessageAt = Date.now();
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      const normalized = normalizeBinanceWsKline(parsed, { symbol, timeframe });
      if (!normalized) return;
      this.handlers?.onKline?.(normalized, parsed);
    };

    socket.onerror = () => {
      if (token !== this.subscriptionToken) return;
      this.handlers?.onStatus?.({ type: "error", connected: false, symbol, timeframe, reconnectAttempts: this.reconnectAttempts, at: new Date().toISOString() });
    };

    socket.onclose = () => {
      if (token !== this.subscriptionToken || this.stopped) return;
      this.handlers?.onStatus?.({ type: "close", connected: false, symbol, timeframe, reconnectAttempts: this.reconnectAttempts, at: new Date().toISOString() });
      this.#scheduleReconnect({ symbol, timeframe, token });
    };
  }

  #ensureStaleGuard(token) {
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = setInterval(() => {
      if (token !== this.subscriptionToken || this.stopped) return;
      if (!this.lastMessageAt) return;
      if ((Date.now() - this.lastMessageAt) <= this.config.staleAfterMs) return;
      this.handlers?.onStatus?.({
        type: "stale",
        connected: false,
        reconnectAttempts: this.reconnectAttempts,
        at: new Date().toISOString(),
      });
      try { this.socket?.close(); } catch {}
    }, Math.max(5000, Math.floor(this.config.staleAfterMs / 3)));
  }

  #scheduleReconnect({ symbol, timeframe, token }) {
    if (this.pendingReconnect || this.stopped || token !== this.subscriptionToken) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(this.config.maxReconnectDelayMs, this.config.reconnectDelayMs * this.reconnectAttempts);
    this.pendingReconnect = setTimeout(() => {
      this.pendingReconnect = null;
      this.#openSocket({ symbol, timeframe, token });
    }, delay);
    this.handlers?.onStatus?.({
      type: "reconnect-scheduled",
      connected: false,
      symbol,
      timeframe,
      reconnectAttempts: this.reconnectAttempts,
      reconnectInMs: delay,
      at: new Date().toISOString(),
    });
  }
}
