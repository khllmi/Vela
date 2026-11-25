// The Watchlist side panel — a TradingView-style symbol list docked beside the chart(s).
// Click a row (or ↑/↓ with the list focused) to switch the ACTIVE chart's symbol; the
// highlighted row follows whatever the active chart shows. `+` in the header adds a
// symbol, hover × (or Delete) removes one, column headers sort. The list persists in
// localStorage. Import this module before creating the shell; it registers at import.
import { registerSidePanel, registerWidgetAction, registerIcon, type WidgetContext } from '../src/plugin';
import type { Vela } from '../src';
import { WatchlistView } from './watchlist-view';

export const WATCHLIST_PANEL_ID = 'playground.watchlist';
export const WATCHLIST_TOGGLE_ID = 'playground.watchlist.toggle';

/** The topbar's right side with the watchlist toggle pinned LAST (the far right): the
 *  default right-hand items, in their default order, then ours. Pass as `topbar.right`. */
export const WATCHLIST_TOPBAR_RIGHT = ['actions', 'alerts', 'panels', 'screenshot', 'fullscreen', WATCHLIST_TOGGLE_ID];

registerIcon(
    'watchlist',
    '<svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h7M2.5 8h7M2.5 12h5"/><path d="m12.5 9.3.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z"/></svg>',
);
registerIcon(
    'watchlist-add',
    '<svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
);

registerSidePanel({
    id: WATCHLIST_PANEL_ID,
    title: 'Watchlist',
    icon: 'watchlist',
    order: 5, // first in the panel group, ahead of the data window and object tree
    width: 320,
    resizable: true,
    minWidth: 260,
    maxWidth: 520,
    mount(ctx: WidgetContext, body: HTMLElement, header) {
        const view = new WatchlistView({
            onSelect: (symbol) => ctx.setSymbol(symbol),
            toast: (msg, kind) => ctx.toast(msg, kind),
        });
        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.appendChild(view.el);

        const add = document.createElement('button');
        add.type = 'button';
        add.title = 'Add symbol';
        add.setAttribute('aria-label', 'Add symbol');
        add.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>';
        add.style.cssText = 'all:unset;display:grid;place-items:center;width:24px;height:24px;border-radius:4px;cursor:pointer;color:var(--vela-fg-muted);margin-left:auto';
        add.onmouseenter = () => (add.style.background = 'var(--vela-hover)');
        add.onmouseleave = () => (add.style.background = '');
        add.onclick = () => view.toggleAdd();
        header.slot.appendChild(add);

        let off: (() => void) | null = null;
        const follow = (chart: Vela): void => {
            off?.();
            view.setActive(chart.market.symbol ?? '');
            off = chart.on('market:changed', ({ symbol }) => view.setActive(symbol));
        };
        return {
            onChart: follow,
            destroy: () => {
                off?.();
                view.destroy();
            },
        };
    },
});

// The topbar toggle — an icon button that opens/closes the panel. Pinned at the far right
// by the host's `topbar.right` (WATCHLIST_TOPBAR_RIGHT); on phones it is a bottom-bar stop.
registerWidgetAction({
    id: WATCHLIST_TOGGLE_ID,
    target: 'topbar',
    label: 'Watchlist',
    icon: 'watchlist',
    iconOnly: true,
    align: 'right',
    mobile: 'bar',
    run: (ctx) => ctx.togglePanel(WATCHLIST_PANEL_ID),
});

/**
 * Wire the watchlist into a shell: open it on first load (a restored layout with another
 * panel open wins), and keep the topbar toggle's pressed look in step with the panel —
 * topbar actions have no built-in pressed state, so the button is marked here.
 */
export function installWatchlist(shell: { context(): WidgetContext }): void {
    const ctx = shell.context();
    if (ctx.panels.openId() === null) ctx.togglePanel(WATCHLIST_PANEL_ID, true);

    const root = ctx.host.closest('.vela-workspace') ?? document.body;
    const sync = (): void => {
        const on = ctx.panels.openId() === WATCHLIST_PANEL_ID;
        for (const b of root.querySelectorAll<HTMLElement>(`[data-action-id="${WATCHLIST_TOGGLE_ID}"]`)) {
            if (b.getAttribute('aria-pressed') === String(on)) continue;
            b.setAttribute('aria-pressed', String(on));
            b.style.color = on ? 'var(--vela-accent-bright, #2962ff)' : '';
        }
    };
    ctx.panels.onDidChange(sync);
    // The topbar rebuilds its buttons on layout changes (desktop ↔ mobile, locale…):
    // re-mark whatever button is current.
    let queued = false;
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            sync();
        });
    }).observe(root, { childList: true, subtree: true });
    sync();
}
