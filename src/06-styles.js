// --- Styles ---
function injectStyles() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Work+Sans:wght@500;700&family=Newsreader:wght@700&display=swap";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent = `
      #tom-overlay {
        position: fixed;
        left: 8px;
        top: 110px;
        width: 480px;
        min-width: 200px;
        max-height: 90vh;
        background: rgba(0, 0, 0, 0.88);
        color: #e0e0e0;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        border-radius: 8px;
        z-index: 99999;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        user-select: none;
        resize: both;
      }
      #tom-overlay-header {
        background: rgba(255,255,255,0.08);
        padding: 8px 12px;
        cursor: grab;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        font-size: 13px;
      }
      #tom-overlay-header:active { cursor: grabbing; }
      #tom-overlay-body {
        padding: 8px 12px;
        overflow-y: auto;
        max-height: calc(90vh - 40px);
      }
      #tom-overlay-body.collapsed { display: none; }
      .tom-section { margin-bottom: 10px; }
      .tom-section-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #888;
        margin-bottom: 4px;
      }
      .tom-idle-alert {
        background: rgba(245, 158, 11, 0.15);
        border-left: 3px solid #f59e0b;
        padding: 6px 8px;
        border-radius: 0 4px 4px 0;
        margin-bottom: 8px;
      }
      .tom-idle-alert .tom-count {
        color: #fbbf24;
        font-weight: 700;
      }
      .tom-row {
        display: flex;
        justify-content: space-between;
        padding: 3px 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }
      .tom-row-label { color: #ccc; }
      .tom-row-value { color: #fff; font-weight: 600; }
      .tom-row-coord { color: #666; font-size: 12px; margin-left: 4px; }
      .tom-construction {
        background: rgba(249, 115, 22, 0.12);
        border-left: 3px solid #f97316;
        padding: 6px 8px;
        border-radius: 0 4px 4px 0;
      }
      .tom-version {
        font-size: 9px;
        opacity: 0.35;
        margin-right: 6px;
        letter-spacing: 0.03em;
      }
      .tom-toggle {
        font-size: 14px;
        cursor: pointer;
        opacity: 0.6;
      }
      .tom-toggle:hover { opacity: 1; }
      .tom-stat {
        display: inline-block;
        margin-right: 12px;
      }
      .tom-stat-value { font-weight: 700; color: #fff; }
      .tom-res-row {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
      }
      .tom-res-label { color: #999; }
      .tom-res-value { color: #fff; font-weight: 600; }
      .tom-res-rate { color: #4ade80; font-size: 12px; }
      .tom-res-food .tom-res-label { color: #fbbf24; }
      .tom-res-wood .tom-res-label { color: #a3e635; }
      .tom-res-mineral .tom-res-label { color: #60a5fa; }
      .tom-row-cat {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 4px;
        vertical-align: middle;
      }
      .tom-cat-resource { background: #22c55e; }
      .tom-cat-military { background: #ef4444; }
      .tom-cat-crafting { background: #a855f7; }
      .tom-cat-infrastructure { background: #3b82f6; }
      .tom-timer-badge {
        position: absolute;
        background: none;
        pointer-events: none;
        z-index: 20001;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .tom-badge-time {
        font-family: 'Work Sans', system-ui, sans-serif;
        color: #fff;
        font-size: 7px;
        font-weight: 700;
        white-space: nowrap;
        text-align: center;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5);
        margin-bottom: 1px;
      }
      .tom-pop-card {
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 5px 8px;
        margin-bottom: 4px;
      }
      .tom-pop-name {
        color: #fbbf24;
        font-weight: 700;
        font-size: 13px;
        display: flex;
        justify-content: space-between;
      }
      .tom-pop-total { color: #fff; }
      .tom-pop-stats {
        display: flex;
        gap: 10px;
        font-size: 11px;
        color: #888;
        margin-top: 3px;
      }
      .tom-pop-val { color: #e0e0e0; font-weight: 600; }
      .tom-pop-idle-alert .tom-pop-val { color: #fbbf24; }
      .tom-tabs {
        display: flex;
        gap: 0;
        flex: 1;
      }
      .tom-tab {
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border-radius: 4px 4px 0 0;
        color: #888;
        transition: color 0.15s, background 0.15s;
      }
      .tom-tab:hover { color: #ccc; }
      .tom-tab.active { color: #fff; background: rgba(255,255,255,0.1); }
      .tom-tab-content { display: none; }
      .tom-tab-content.active { display: block; }
      .tom-craft-card {
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 6px 8px;
        margin-bottom: 6px;
        border-left: 3px solid #a855f7;
      }
      .tom-craft-card.tom-craft-locked {
        opacity: 0.55;
        border-left-color: #6b7280;
      }
      .tom-tribe-lock-badge {
        font-size: 9px;
        color: #f59e0b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }
      .tom-craft-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .tom-craft-name { font-weight: 700; font-size: 12px; color: #e0e0e0; }
      .tom-craft-yield { color: #a855f7; font-size: 11px; font-weight: 600; }
      .tom-craft-time { color: #888; font-size: 11px; }
      .tom-craft-step {
        font-size: 11px;
        color: #aaa;
        padding: 2px 0 2px 8px;
        border-left: 2px solid rgba(168,85,247,0.3);
        margin: 2px 0;
      }
      .tom-craft-step-label { color: #a855f7; font-weight: 600; }
      .tom-craft-step-external { border-left-color: #fb923c; }
      .tom-craft-step-acquire { color: #fb923c; font-weight: 600; }
      .tom-craft-search {
        width: 100%;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #e0e0e0;
        font-size: 12px;
        border-radius: 4px;
        padding: 4px 8px;
        box-sizing: border-box;
        outline: none;
      }
      .tom-craft-search:focus { border-color: #a855f7; }
      .tom-craft-base {
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid rgba(255,255,255,0.08);
        font-size: 11px;
      }
      .tom-craft-base-label { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
      .tom-craft-mat { font-weight: 600; }
      .tom-craft-mat-food { color: #fbbf24; }
      .tom-craft-mat-wood { color: #a3e635; }
      .tom-craft-mat-mineral { color: #60a5fa; }
      .tom-craft-mat-gold_dust { color: #fbbf24; }
      .tom-craft-can {
        display: inline-block;
        font-size: 11px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 3px;
        margin-top: 3px;
      }
      .tom-craft-can-yes { color: #4ade80; background: rgba(74,222,128,0.1); }
      .tom-craft-can-no { color: #ef4444; background: rgba(239,68,68,0.1); }
      .tom-craft-reqby { margin-top: 4px; }
      .tom-craft-reqby summary {
        font-size: 11px;
        color: #888;
        cursor: pointer;
        user-select: none;
        list-style: none;
      }
      .tom-craft-reqby summary::before { content: "\\25B8  "; }
      .tom-craft-reqby[open] summary::before { content: "\\25BE  "; }
      .tom-craft-reqby-item {
        font-size: 11px;
        color: #aaa;
        padding: 1px 0 1px 12px;
      }
      .tom-trade-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      }
      .tom-trade-side {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 3px;
        min-width: 36px;
        text-align: center;
      }
      .tom-trade-get { background: rgba(74,222,128,0.15); color: #4ade80; }
      .tom-trade-give { background: rgba(239,68,68,0.15); color: #ef4444; }
      .tom-trade-select {
        flex: 1;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #e0e0e0;
        font-size: 11px;
        border-radius: 4px;
        padding: 3px 4px;
      }
      .tom-trade-input {
        width: 64px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #fff;
        font-size: 11px;
        border-radius: 4px;
        padding: 3px 4px;
        text-align: right;
      }
      .tom-trade-btn {
        width: 100%;
        background: rgba(168,85,247,0.2);
        border: 1px solid #a855f7;
        color: #e0d0ff;
        font-size: 12px;
        font-weight: 700;
        border-radius: 4px;
        padding: 5px;
        cursor: pointer;
        margin-bottom: 8px;
      }
      .tom-trade-btn:hover { background: rgba(168,85,247,0.35); }
      .tom-trade-result-inner {
        background: rgba(255,255,255,0.04);
        border-radius: 4px;
        padding: 8px;
      }
      .tom-trade-result-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #e0e0e0;
      }
      .tom-trade-breakdown { font-size: 10px; color: #888; padding-left: 48px; margin: 1px 0; }
      .tom-trade-wm { font-size: 11px; color: #aaa; padding-left: 48px; margin-bottom: 2px; }
      .tom-trade-verdict {
        margin-top: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
      }
      .tom-trade-great { background: rgba(74,222,128,0.15); color: #4ade80; }
      .tom-trade-fair { background: rgba(74,222,128,0.10); color: #86efac; }
      .tom-trade-risky { background: rgba(251,191,36,0.15); color: #fbbf24; }
      .tom-trade-bad { background: rgba(239,68,68,0.15); color: #ef4444; }
      .tom-trade-unknown { color: #fb923c; font-size: 11px; padding: 6px 0; }
      .tom-trade-fair-suggest {
        margin-top: 8px;
        padding: 6px 8px;
        background: rgba(251,191,36,0.08);
        border-left: 2px solid #fbbf24;
        color: #e9c176;
        font-size: 11px;
      }
      .tom-trade-gold-row {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 3px;
      }
      .tom-trade-gold-label { font-size: 11px; color: #888; }
      .tom-trade-gold-btn {
        background: rgba(251,191,36,0.15);
        border: 1px solid #fbbf24;
        color: #fbbf24;
        font-size: 10px;
        font-weight: 700;
        border-radius: 3px;
        padding: 2px 6px;
        cursor: pointer;
      }
      .tom-trade-gold-btn:hover { background: rgba(251,191,36,0.3); }
      .tom-trade-gold-ref { font-size: 10px; color: #555; margin-bottom: 8px; }
      .tom-aq-section { margin-bottom: 6px; }
      .tom-aq-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        font-weight: 700;
        color: #a855f7;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        cursor: pointer;
        padding: 3px 0;
        user-select: none;
      }
      .tom-aq-header:hover { color: #c084fc; }
      .tom-aq-body { margin-top: 2px; }
      .tom-aq-body.collapsed { display: none; }
      .tom-aq-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2px 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        font-size: 11px;
      }
      .tom-aq-label { color: #ccc; flex: 1; margin-right: 8px; }
      .tom-aq-time { color: #fbbf24; font-weight: 700; font-variant-numeric: tabular-nums; }
      .tom-market-empty { color: #555; font-size: 11px; padding: 8px 0; }
      .tom-market-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }
      .tom-market-badge {
        min-width: 44px;
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 4px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .tom-market-badge-good  { background: rgba(74,222,128,0.15);  color: #4ade80; }
      .tom-market-badge-fair  { background: rgba(251,191,36,0.15);  color: #fbbf24; }
      .tom-market-badge-bad   { background: rgba(239,68,68,0.15);   color: #ef4444; }
      .tom-market-badge-unknown { background: rgba(255,255,255,0.08); color: #888; }
      .tom-market-badge-sub { display: block; font-size: 8px; font-weight: 400; opacity: 0.7; }
      .tom-market-sides { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .tom-market-sides > div { display: flex; align-items: center; gap: 4px; }
      .tom-market-item { font-size: 11px; color: #e0e0e0; flex: 1; }
      .tom-market-wm   { font-size: 10px; color: #666; flex-shrink: 0; }

      /* Inventory sort bar */
      .tom-inv-sort-bar {
        display: flex; gap: 4px; padding: 4px 8px 8px; flex-wrap: wrap;
      }
      .tom-inv-sort-btn {
        background: rgba(255,255,255,0.1); color: #ccc; border: none;
        padding: 3px 10px; border-radius: 12px; font-size: 11px;
        cursor: pointer; font-family: 'Work Sans', system-ui, sans-serif;
        transition: background 0.15s, color 0.15s;
      }
      .tom-inv-sort-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
      .tom-inv-sort-btn.active { background: #fbbf24; color: #1a1a1a; font-weight: 600; }
      .tom-inv-cat-divider {
        grid-column: 1 / -1; font-size: 10px; color: #fbbf24; opacity: 0.8;
        padding: 6px 4px 2px; font-family: 'Work Sans', system-ui, sans-serif;
        font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
        border-bottom: 1px solid rgba(251,191,36,0.15);
      }

      /* Building sort toolbar */
      .tom-bld-toolbar {
        display: flex; flex-direction: column; gap: 6px; padding: 4px 20px 8px;
      }
      .tom-bld-tab-row {
        display: flex; gap: 0; border-bottom: 2px solid rgba(251,191,36,0.3); margin-bottom: 2px;
      }
      .tom-bld-tab-btn {
        background: rgba(255,255,255,0.06); color: #999; border: none;
        padding: 5px 14px; font-size: 12px; font-weight: 600;
        cursor: pointer; font-family: 'Work Sans', system-ui, sans-serif;
        transition: background 0.15s, color 0.15s;
        border-radius: 4px 4px 0 0; letter-spacing: 0.3px;
      }
      .tom-bld-tab-btn:hover { background: rgba(255,255,255,0.12); color: #ddd; }
      .tom-bld-tab-btn.active { background: #fbbf24; color: #1a1a1a; }
      .tom-bld-search {
        width: 100%;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #e0e0e0;
        font-size: 12px;
        border-radius: 4px;
        padding: 5px 8px;
        box-sizing: border-box;
        outline: none;
        font-family: 'Work Sans', system-ui, sans-serif;
      }
      .tom-bld-search:focus { border-color: #fbbf24; }
      .tom-bld-search::placeholder { color: #777; }
      .tom-bld-hidden { display: none !important; }
      .tom-bld-no-results {
        grid-column: 1 / -1; text-align: center; color: #888;
        padding: 20px; font-size: 13px;
        font-family: 'Work Sans', system-ui, sans-serif;
      }

      /* Crafter sort toolbar */
      .tom-cft-toolbar {
        display: flex; flex-direction: column; gap: 6px; padding: 6px 10px 8px;
        background: rgba(0,0,0,0.4); border-radius: 6px; margin: 4px 0 8px;
      }
      .tom-cft-search {
        width: 100%;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #e0e0e0;
        font-size: 12px;
        border-radius: 4px;
        padding: 5px 8px;
        box-sizing: border-box;
        outline: none;
        font-family: 'Work Sans', system-ui, sans-serif;
      }
      .tom-cft-search:focus { border-color: #fbbf24; }
      .tom-cft-search::placeholder { color: #777; }
      .tom-cft-sort-row {
        display: flex; gap: 4px; flex-wrap: wrap;
      }
      .tom-cft-sort-btn {
        background: rgba(255,255,255,0.1); color: #ccc; border: none;
        padding: 3px 10px; border-radius: 12px; font-size: 11px;
        cursor: pointer; font-family: 'Work Sans', system-ui, sans-serif;
        transition: background 0.15s, color 0.15s;
      }
      .tom-cft-sort-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
      .tom-cft-sort-btn.active { background: #fbbf24; color: #1a1a1a; font-weight: 600; }
      .tom-cft-hidden { display: none !important; }
      .tom-cft-cat-divider {
        font-size: 11px; color: #fbbf24; opacity: 0.8;
        padding: 8px 4px 2px; font-family: 'Work Sans', system-ui, sans-serif;
        font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
        border-bottom: 1px solid rgba(251,191,36,0.15);
      }
      .tom-cft-no-results {
        text-align: center; color: #888;
        padding: 20px; font-size: 13px;
        font-family: 'Work Sans', system-ui, sans-serif;
      }
    `;
  document.head.appendChild(style);
}

