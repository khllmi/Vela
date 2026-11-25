// A TradingView-style watchlist — framework-free DOM + live Binance 24h tickers.
// Kept free of Vela imports so the panel (watchlist.ts) and any standalone preview
// mount the exact same code. Styling uses the kit's `--vela-*` theme tokens, with
// dark fallbacks for use outside a Vela shell.

export interface WatchlistOptions {
    /** A row was picked — switch the chart to this symbol. */
    onSelect: (symbol: string) => void;
    /** Surface a short message (invalid symbol, …). */
    toast?: (message: string, kind?: 'info' | 'success' | 'error') => void;
    /** localStorage key for the list + sort (default 'vela-play:watchlist'). */
    storageKey?: string;
    /** Symbols shown on first run. */
    defaults?: string[];
}

interface Ticker {
    last: number;
    open: number;
    high: number;
    low: number;
    change: number;
    pct: number;
    quoteVol: number;
}

type SortKey = 'manual' | 'symbol' | 'last' | 'change' | 'pct';

const REST = 'https://api.binance.com/api/v3';
const WS = 'wss://stream.binance.com:9443/stream?streams=';
const QUOTES = /(USDT|USDC|FDUSD|BUSD|BTC|ETH|BNB|EUR|TRY)$/;
const DEFAULTS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'TONUSDT'];

const CSS = `
.vwl { display:flex; flex-direction:column; height:100%; min-height:0; font:var(--vela-font-size-md,12px)/1.3 var(--vela-font,-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,Ubuntu,sans-serif); color:var(--vela-fg,#d1d4dc); user-select:none; }
.vwl-add { display:flex; gap:6px; padding:8px 10px; border-bottom:1px solid var(--vela-border-faint,rgba(255,255,255,.08)); }
.vwl-add[hidden] { display:none; }
.vwl-add input { flex:1; min-width:0; height:28px; padding:0 8px; border-radius:var(--vela-radius-sm,4px); border:1px solid var(--vela-border-strong,#34353b); background:var(--vela-surface-sunken,#131722); color:inherit; font:inherit; text-transform:uppercase; outline:none; }
.vwl-add input:focus { border-color:var(--vela-accent,#2962ff); }
.vwl-head, .vwl-row { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,.85fr) minmax(0,.85fr); align-items:center; column-gap:6px; padding:0 10px; }
.vwl-head { height:26px; color:var(--vela-fg-muted,#868a96); font-size:var(--vela-font-size-sm,11px); border-bottom:1px solid var(--vela-border-faint,rgba(255,255,255,.08)); }
.vwl-head button { all:unset; cursor:pointer; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vwl-head button:first-child { text-align:left; }
.vwl-head button:hover, .vwl-head button[data-on] { color:var(--vela-fg,#d1d4dc); }
.vwl-list { flex:1; min-height:0; overflow-y:auto; outline:none; }
.vwl-row { position:relative; height:32px; cursor:pointer; }
.vwl-row:hover { background:var(--vela-hover,rgba(255,255,255,.06)); }
.vwl-row[data-active] { background:var(--vela-active,rgba(255,255,255,.1)); }
.vwl-row[data-active]::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background:var(--vela-accent,#2962ff); }
.vwl-sym { display:flex; align-items:center; gap:7px; min-width:0; }
.vwl-ico { flex:none; width:18px; height:18px; border-radius:50%; overflow:hidden; display:grid; place-items:center; font-size:8px; font-weight:700; color:#fff; }
.vwl-ico img { width:100%; height:100%; display:block; }
.vwl-name { font-weight:600; color:var(--vela-fg-bright,#f0f3fa); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vwl-num { text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; border-radius:2px; transition:background-color .6s; }
.vwl-up { color:var(--vela-up,#089981); } .vwl-down { color:var(--vela-down,#f23645); }
.vwl-flash-up { background:color-mix(in srgb, var(--vela-up,#089981) 28%, transparent); transition:none; }
.vwl-flash-down { background:color-mix(in srgb, var(--vela-down,#f23645) 28%, transparent); transition:none; }
.vwl-del { all:unset; position:absolute; right:4px; top:50%; transform:translateY(-50%); width:20px; height:20px; display:none; place-items:center; border-radius:4px; color:var(--vela-fg-muted,#868a96); background:var(--vela-surface-elev,#1e222d); cursor:pointer; font-size:14px; }
.vwl-row:hover .vwl-del { display:grid; }
.vwl-del:hover { color:var(--vela-fg-bright,#f0f3fa); background:var(--vela-hover-strong,rgba(255,255,255,.16)); }
.vwl-empty { padding:24px 12px; text-align:center; color:var(--vela-fg-muted,#868a96); }
.vwl-det { flex:none; border-top:1px solid var(--vela-border,#2a2e39); padding:12px; }
.vwl-det-top { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.vwl-det-top .vwl-ico { width:24px; height:24px; font-size:10px; }
.vwl-det-name { font-size:var(--vela-font-size-lg,14px); font-weight:600; color:var(--vela-fg-bright,#f0f3fa); }
.vwl-det-ex { color:var(--vela-fg-muted,#868a96); font-size:var(--vela-font-size-sm,11px); }
.vwl-det-px { font-size:24px; font-weight:600; color:var(--vela-fg-bright,#f0f3fa); font-variant-numeric:tabular-nums; }
.vwl-det-chg { font-size:13px; margin-top:2px; font-variant-numeric:tabular-nums; }
.vwl-range { margin-top:12px; }
.vwl-range-lbl { display:flex; justify-content:space-between; color:var(--vela-fg-muted,#868a96); font-size:var(--vela-font-size-sm,11px); margin-bottom:4px; font-variant-numeric:tabular-nums; }
.vwl-range-bar { position:relative; height:4px; border-radius:2px; background:var(--vela-border-strong,#34353b); }
.vwl-range-dot { position:absolute; top:50%; width:8px; height:8px; margin:-4px 0 0 -4px; border-radius:50%; background:var(--vela-fg-bright,#f0f3fa); }
.vwl-stats { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; margin-top:12px; font-size:var(--vela-font-size-sm,11px); }
.vwl-stats span { color:var(--vela-fg-muted,#868a96); } .vwl-stats b { font-weight:500; float:right; font-variant-numeric:tabular-nums; }
`;

function decimals(p: number): number {
    if (p >= 100) return 2;
    if (p >= 1) return 3;
    if (p >= 0.1) return 4;
    if (p >= 0.001) return 6;
    return 8;
}
const fmt = (n: number, d: number): string => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
/** Signed: '+1.23' / '-1.23', and no sign at all when the value rounds to zero. */
const signed = (n: number, d: number): string => {
    const r = Number(n.toFixed(d));
    return (r > 0 ? '+' : '') + fmt(r === 0 ? 0 : n, d);
};
function compact(n: number): string {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
}
const baseOf = (s: string): string => s.replace(QUOTES, '') || s;
const quoteOf = (s: string): string => s.slice(baseOf(s).length);
function color(name: string): string {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `hsl(${h % 360} 55% 45%)`;
}
function iconEl(sym: string): HTMLElement {
    const base = baseOf(sym);
    const wrap = document.createElement('span');
    wrap.className = 'vwl-ico';
    const fallback = (): void => {
        wrap.replaceChildren();
        wrap.style.background = color(base);
        wrap.textContent = base.slice(0, 2);
    };
    const img = document.createElement('img');
    img.alt = '';
    img.onerror = fallback;
    img.src = `https://crypto-icons.ledger.com/${encodeURIComponent(base)}.png`;
    wrap.appendChild(img);
    return wrap;
}
const normalize = (s: string): string => s.trim().toUpperCase().replace(/^[A-Z]+:/, '').replace(/[^A-Z0-9]/g, '');
type RawTicker = Partial<Record<string, string>>;
/** REST (`lastPrice`, …) and stream (`c`, …) payloads name the same fields differently. */
const parse = (t: RawTicker): Ticker => {
    const n = (a: string, b: string): number => Number(t[a] ?? t[b] ?? NaN);
    return {
        last: n('lastPrice', 'c'),
        open: n('openPrice', 'o'),
        high: n('highPrice', 'h'),
        low: n('lowPrice', 'l'),
        change: n('priceChange', 'p'),
        pct: n('priceChangePercent', 'P'),
        quoteVol: n('quoteVolume', 'q'),
    };
};

export class WatchlistView {
    readonly el: HTMLElement;
    private symbols: string[];
    private sort: { key: SortKey; dir: 1 | -1 } = { key: 'manual', dir: 1 };
    private data = new Map<string, Ticker>();
    private rows = new Map<string, { row: HTMLElement; last: HTMLElement; chg: HTMLElement; pct: HTMLElement }>();
    private active = '';
    private ws: WebSocket | null = null;
    private retry = 0;
    private retryTimer = 0;
    private pollTimer = 0;
    private destroyed = false;
    private list: HTMLElement;
    private head: HTMLElement;
    private addBar: HTMLElement;
    private addInput: HTMLInputElement;
    private det: HTMLElement;
    private key: string;

    constructor(private opts: WatchlistOptions) {
        this.key = opts.storageKey ?? 'vela-play:watchlist';
        const saved = this.load();
        this.symbols = saved?.symbols ?? opts.defaults ?? DEFAULTS;
        if (saved?.sort) this.sort = saved.sort;

        if (!document.getElementById('vwl-style')) {
            const style = document.createElement('style');
            style.id = 'vwl-style';
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        this.el = document.createElement('div');
        this.el.className = 'vwl';
        this.el.innerHTML = `
            <form class="vwl-add" hidden><input placeholder="Add symbol, e.g. PEPEUSDT" spellcheck="false" autocomplete="off" /></form>
            <div class="vwl-head"></div>
            <div class="vwl-list" tabindex="0"></div>
            <div class="vwl-det"></div>`;
        this.addBar = this.el.querySelector('.vwl-add')!;
        this.addInput = this.addBar.querySelector('input')!;
        this.head = this.el.querySelector('.vwl-head')!;
        this.list = this.el.querySelector('.vwl-list')!;
        this.det = this.el.querySelector('.vwl-det')!;

        this.addBar.addEventListener('submit', (e) => {
            e.preventDefault();
            void this.add(this.addInput.value);
        });
        this.addInput.addEventListener('keydown', (e) => {
            e.stopPropagation(); // keep the shell's keymap from eating typed letters
            if (e.key === 'Escape') this.toggleAdd(false);
        });
        this.list.addEventListener('keydown', (e) => this.onKey(e));

        this.renderHead();
        this.renderRows();
        this.connect();
    }

    // ── public ──────────────────────────────────────────────────────────

    /** Highlight the symbol the chart shows (no selection callback). */
    setActive(symbol: string): void {
        const s = normalize(symbol);
        if (s === this.active) return;
        this.rows.get(this.active)?.row.removeAttribute('data-active');
        this.active = s;
        const r = this.rows.get(s);
        r?.row.setAttribute('data-active', '');
        r?.row.scrollIntoView({ block: 'nearest' });
        this.renderDetails();
    }

    /** Show/hide the add-symbol field. */
    toggleAdd(open = this.addBar.hidden): void {
        this.addBar.hidden = !open;
        if (open) {
            this.addInput.value = '';
            this.addInput.focus();
        }
    }

    destroy(): void {
        this.destroyed = true;
        clearTimeout(this.retryTimer);
        clearInterval(this.pollTimer);
        this.ws?.close();
        this.el.remove();
    }

    // ── list editing ────────────────────────────────────────────────────

    private async add(input: string): Promise<void> {
        const raw = normalize(input);
        if (!raw) return;
        const candidates = QUOTES.test(raw) ? [raw] : [raw + 'USDT', raw];
        for (const sym of candidates) {
            if (this.symbols.includes(sym)) {
                this.opts.toast?.(`${sym} is already in the watchlist`);
                this.toggleAdd(false);
                return;
            }
            try {
                const res = await fetch(`${REST}/ticker/24hr?symbol=${sym}`);
                if (!res.ok) continue;
                this.data.set(sym, parse(await res.json()));
                this.symbols = [...this.symbols, sym];
                this.save();
                this.renderRows();
                this.connect();
                this.toggleAdd(false);
                this.opts.toast?.(`${sym} added`, 'success');
                return;
            } catch {
                break;
            }
        }
        this.opts.toast?.(`Symbol "${raw}" not found on Binance`, 'error');
    }

    private remove(sym: string): void {
        this.symbols = this.symbols.filter((s) => s !== sym);
        this.data.delete(sym);
        this.save();
        this.renderRows();
        this.connect();
    }

    private select(sym: string): void {
        this.setActive(sym);
        this.opts.onSelect(sym);
    }

    private onKey(e: KeyboardEvent): void {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Delete') return;
        e.preventDefault();
        e.stopPropagation();
        const order = this.ordered();
        if (!order.length) return;
        const i = order.indexOf(this.active);
        if (e.key === 'Delete') {
            if (i >= 0) this.remove(this.active);
            return;
        }
        const next = order[e.key === 'ArrowDown' ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1)];
        if (next) this.select(next);
    }

    // ── rendering ───────────────────────────────────────────────────────

    private ordered(): string[] {
        const { key, dir } = this.sort;
        if (key === 'manual') return [...this.symbols];
        const val = (s: string): number | string => {
            const t = this.data.get(s);
            if (key === 'symbol') return s;
            if (!t) return -Infinity;
            return key === 'last' ? t.last : key === 'change' ? t.change : t.pct;
        };
        return [...this.symbols].sort((a, b) => {
            const va = val(a);
            const vb = val(b);
            return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
        });
    }

    private renderHead(): void {
        const cols: [SortKey, string][] = [
            ['symbol', 'Symbol'],
            ['last', 'Last'],
            ['change', 'Chg'],
            ['pct', 'Chg%'],
        ];
        this.head.replaceChildren(
            ...cols.map(([key, label]) => {
                const b = document.createElement('button');
                const on = this.sort.key === key;
                b.textContent = label + (on ? (this.sort.dir === 1 ? ' ↑' : ' ↓') : '');
                if (on) b.setAttribute('data-on', '');
                b.title = 'Sort';
                // Click cycles: ascending → descending → manual order.
                b.onclick = () => {
                    if (!on) this.sort = { key, dir: key === 'symbol' ? 1 : -1 };
                    else if (this.sort.dir === (key === 'symbol' ? 1 : -1)) this.sort = { key, dir: (this.sort.dir * -1) as 1 | -1 };
                    else this.sort = { key: 'manual', dir: 1 };
                    this.save();
                    this.renderHead();
                    this.renderRows();
                };
                return b;
            }),
        );
    }

    private renderRows(): void {
        this.rows.clear();
        const order = this.ordered();
        if (!order.length) {
            const empty = document.createElement('div');
            empty.className = 'vwl-empty';
            empty.textContent = 'Your watchlist is empty. Press + to add a symbol.';
            this.list.replaceChildren(empty);
            this.renderDetails();
            return;
        }
        this.list.replaceChildren(
            ...order.map((sym) => {
                const row = document.createElement('div');
                row.className = 'vwl-row';
                const symCell = document.createElement('div');
                symCell.className = 'vwl-sym';
                const name = document.createElement('span');
                name.className = 'vwl-name';
                name.textContent = sym;
                name.title = sym;
                symCell.append(iconEl(sym), name);
                const num = (): HTMLElement => {
                    const d = document.createElement('div');
                    d.className = 'vwl-num';
                    return d;
                };
                const last = num();
                const chg = num();
                const pct = num();
                const del = document.createElement('button');
                del.className = 'vwl-del';
                del.title = 'Remove from watchlist';
                del.textContent = '×';
                del.onclick = (e) => {
                    e.stopPropagation();
                    this.remove(sym);
                };
                row.append(symCell, last, chg, pct, del);
                row.onclick = () => {
                    this.select(sym);
                    this.list.focus({ preventScroll: true });
                };
                if (sym === this.active) row.setAttribute('data-active', '');
                this.rows.set(sym, { row, last, chg, pct });
                this.paintRow(sym, false);
                return row;
            }),
        );
        this.renderDetails();
    }

    private paintRow(sym: string, flash: boolean, prevLast?: number): void {
        const r = this.rows.get(sym);
        const t = this.data.get(sym);
        if (!r) return;
        if (!t) {
            r.last.textContent = r.chg.textContent = r.pct.textContent = '—';
            return;
        }
        const d = decimals(t.last);
        const cls = t.change > 0 ? 'vwl-up' : t.change < 0 ? 'vwl-down' : '';
        r.last.textContent = fmt(t.last, d);
        r.chg.textContent = signed(t.change, d);
        r.pct.textContent = signed(t.pct, 2) + '%';
        r.chg.className = r.pct.className = 'vwl-num ' + cls;
        if (flash && prevLast !== undefined && prevLast !== t.last) {
            const f = t.last > prevLast ? 'vwl-flash-up' : 'vwl-flash-down';
            r.last.classList.remove('vwl-flash-up', 'vwl-flash-down');
            void r.last.offsetWidth; // restart the fade
            r.last.classList.add(f);
            setTimeout(() => r.last.classList.remove(f), 250);
        }
    }

    private renderDetails(): void {
        const sym = this.rows.has(this.active) ? this.active : '';
        const t = sym ? this.data.get(sym) : undefined;
        if (!sym) {
            this.det.hidden = true;
            return;
        }
        this.det.hidden = false;
        const top = document.createElement('div');
        top.className = 'vwl-det-top';
        const titles = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.className = 'vwl-det-name';
        nameEl.textContent = sym;
        const exEl = document.createElement('div');
        exEl.className = 'vwl-det-ex';
        exEl.textContent = `${baseOf(sym)} / ${quoteOf(sym)} · Binance · Spot`;
        titles.append(nameEl, exEl);
        top.append(iconEl(sym), titles);
        if (!t) {
            this.det.replaceChildren(top);
            return;
        }
        const d = decimals(t.last);
        const cls = t.change > 0 ? 'vwl-up' : t.change < 0 ? 'vwl-down' : '';
        const pos = t.high > t.low ? ((t.last - t.low) / (t.high - t.low)) * 100 : 50;
        const body = document.createElement('div');
        body.innerHTML = `
            <div class="vwl-det-px">${fmt(t.last, d)} <span class="vwl-det-ex">${quoteOf(sym)}</span></div>
            <div class="vwl-det-chg ${cls}">${signed(t.change, d)} (${signed(t.pct, 2)}%) <span class="vwl-det-ex">24h</span></div>
            <div class="vwl-range">
                <div class="vwl-range-lbl"><span>${fmt(t.low, d)}</span><span>24h range</span><span>${fmt(t.high, d)}</span></div>
                <div class="vwl-range-bar"><div class="vwl-range-dot" style="left:${Math.max(0, Math.min(100, pos))}%"></div></div>
            </div>
            <div class="vwl-stats">
                <div><span>Open</span><b>${fmt(t.open, d)}</b></div>
                <div><span>Volume</span><b>${compact(t.quoteVol)} ${quoteOf(sym)}</b></div>
            </div>`;
        this.det.replaceChildren(top, body);
    }

    // ── data ────────────────────────────────────────────────────────────

    /** Snapshot every symbol over REST, then stream 24h tickers over one socket. */
    private connect(): void {
        if (this.destroyed) return;
        clearTimeout(this.retryTimer);
        clearInterval(this.pollTimer);
        this.ws?.close();
        this.ws = null;
        const syms = [...this.symbols];
        if (!syms.length) return;
        void this.snapshot(syms);
        if (typeof WebSocket === 'undefined') return this.poll();
        const sock = new WebSocket(WS + syms.map((s) => s.toLowerCase() + '@ticker').join('/'));
        this.ws = sock;
        sock.onopen = () => (this.retry = 0);
        sock.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data as string) as { data?: RawTicker };
                const sym = msg.data?.s;
                if (sym && msg.data) this.update(sym, parse(msg.data));
            } catch {
                /* ignore malformed frames */
            }
        };
        sock.onclose = () => {
            if (this.ws !== sock || this.destroyed) return;
            this.ws = null;
            // Reconnect with backoff; after a few failures, fall back to REST polling.
            if (++this.retry > 3) return this.poll();
            this.retryTimer = window.setTimeout(() => this.connect(), 1000 * 2 ** this.retry);
        };
    }

    private poll(): void {
        clearInterval(this.pollTimer);
        this.pollTimer = window.setInterval(() => void this.snapshot([...this.symbols]), 5000);
    }

    private async snapshot(syms: string[]): Promise<void> {
        try {
            const res = await fetch(`${REST}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms))}`);
            if (!res.ok) throw new Error(String(res.status));
            const arr = (await res.json()) as RawTicker[];
            for (const t of arr) if (t.symbol) this.update(t.symbol, parse(t), false);
        } catch {
            // One bad symbol fails the batch request — fetch them one by one instead.
            await Promise.all(
                syms.map(async (s) => {
                    try {
                        const r = await fetch(`${REST}/ticker/24hr?symbol=${s}`);
                        if (r.ok) this.update(s, parse(await r.json()), false);
                    } catch {
                        /* offline — rows keep their dashes */
                    }
                }),
            );
        }
    }

    private update(sym: string, t: Ticker, flash = true): void {
        if (this.destroyed || !this.symbols.includes(sym)) return;
        const prev = this.data.get(sym)?.last;
        this.data.set(sym, t);
        this.paintRow(sym, flash, prev);
        if (sym === this.active) this.renderDetails();
        if (this.sort.key !== 'manual' && this.sort.key !== 'symbol' && flash) this.scheduleResort();
    }

    private resortTimer = 0;
    private scheduleResort(): void {
        if (this.resortTimer) return;
        this.resortTimer = window.setTimeout(() => {
            this.resortTimer = 0;
            const want = this.ordered();
            const have = [...this.list.children].map((c) => (c.querySelector('.vwl-name') as HTMLElement | null)?.textContent);
            if (want.join() !== have.join()) this.renderRows();
        }, 2000);
    }

    // ── persistence ─────────────────────────────────────────────────────

    private load(): { symbols?: string[]; sort?: { key: SortKey; dir: 1 | -1 } } | null {
        try {
            const raw = localStorage.getItem(this.key);
            const v = raw ? JSON.parse(raw) : null;
            if (v && Array.isArray(v.symbols)) v.symbols = v.symbols.filter((s: unknown) => typeof s === 'string').map(normalize);
            return v;
        } catch {
            return null;
        }
    }

    private save(): void {
        try {
            localStorage.setItem(this.key, JSON.stringify({ symbols: this.symbols, sort: this.sort }));
        } catch {
            /* storage unavailable — the list lives for this visit */
        }
    }
}
