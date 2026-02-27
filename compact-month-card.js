/* eslint-disable no-console */

const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnlyKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d, n) {
  return new Date(d.getTime() + n * DAY_MS);
}

function isoWithOffset(d) {
  const pad = (x) => String(x).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? "+" : "-";
  const abs = Math.abs(tzMin);
  const tzh = pad(Math.floor(abs / 60));
  const tzm = pad(abs % 60);

  return `${y}-${m}-${da}T${hh}:${mm}:${ss}${sign}${tzh}:${tzm}`;
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function clampNumber(n, min, max, fallback) {
  const x = Number(n);
  if (Number.isFinite(x)) return Math.min(max, Math.max(min, x));
  return fallback;
}

function formatDurationShort(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

class CompactMonthCard extends LitElement {
  static properties = {
    hass: {},
    _config: { state: true },
    _viewDate: { state: true },
    _selectedDate: { state: true },
    _enabled: { state: true },
    _eventsCache: { state: true },
    _loading: { state: true },
    _lastError: { state: true },
    _nowTick: { state: true }, 
  };

  constructor() {
    super();
    this._nowTimer = null;
    this._nowTick = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this._syncNowTimer();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._nowTimer) {
      clearInterval(this._nowTimer);
      this._nowTimer = null;
    }
  }

  setConfig(config) {
    if (!config || !config.calendars?.length) {
      throw new Error("`calendars` is required.");
    }

    const legacyCardBg = config.background ?? null;

    this._config = {
      mode: "merged",
      start_weekday: "monday",
      navigation: true,
      dots: { max: 2, style: "dots" },
      event_indicator: { type: "icon", position: "right", size: 14 },
      locale: "cs-CZ",

      selector: { button_size: 44, radius: 10, border: true, divider: true },
      day_tiles: { background: true, today_only: false },

      backgrounds: {
        card: legacyCardBg,
        selector: "transparent",
        month: "transparent",
        events: "transparent",
      },

      events: {
        gap_reduction: 16,
        show_count: true,       // NEW
        max_items: null,        // NEW: null = no limit
        show_more: true,        // NEW
      },

      // OPTIONAL: ongoing highlight/progress
      now: {
        enabled: false,
        update_seconds: 30,
        show_progress: true,
        show_text: true,
        text_mode: "remaining", // remaining | elapsed | both
      },

      ...config,

      selector: { button_size: 44, radius: 10, border: true, divider: true, ...(config.selector || {}) },
      dots: { max: 2, style: "dots", ...(config.dots || {}) },
      event_indicator: { type: "icon", position: "right", size: 14, ...(config.event_indicator || {}) },
      day_tiles: { background: true, today_only: false, ...(config.day_tiles || {}) },

      backgrounds: {
        card: legacyCardBg,
        selector: "transparent",
        month: "transparent",
        events: "transparent",
        ...(config.backgrounds || {}),
      },

      events: {
        gap_reduction: 16,
        show_count: true,
        max_items: null,
        show_more: true,
        ...(config.events || {}),
      },

      now: {
        enabled: false,
        update_seconds: 30,
        show_progress: true,
        show_text: true,
        text_mode: "remaining",
        ...(config.now || {}),
      },
    };

    const now = new Date();
    this._viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this._selectedDate = startOfDay(now);

    this._enabled = new Set(this._config.calendars.map((c) => c.entity));
    this._eventsCache = new Map();
    this._loading = false;
    this._lastError = null;

    this._syncNowTimer();
  }

  _syncNowTimer() {
    const on = !!this._config?.now?.enabled;
    const sec = clampNumber(this._config?.now?.update_seconds, 5, 300, 30);

    if (this._nowTimer) {
      clearInterval(this._nowTimer);
      this._nowTimer = null;
    }
    if (on) {
      this._nowTimer = setInterval(() => {
        this._nowTick = (this._nowTick + 1) % 1_000_000;
      }, sec * 1000);
    }
  }

  getCardSize() {
    return 4;
  }

  updated(changedProps) {
    if (changedProps.has("_viewDate") || changedProps.has("_enabled")) {
      this._loadVisibleRange();
    }
    if (changedProps.has("_config")) {
      this._syncNowTimer();
    }
  }

  _monthCacheKey(rangeStart, rangeEnd) {
    const enabled = [...this._enabled].sort().join(",");
    return `${toDateOnlyKey(rangeStart)}_${toDateOnlyKey(rangeEnd)}|${enabled}`;
  }

  _getGridRange() {
    const firstOfMonth = new Date(this._viewDate.getFullYear(), this._viewDate.getMonth(), 1);
    const lastOfMonth = new Date(this._viewDate.getFullYear(), this._viewDate.getMonth() + 1, 0);

    const weekStartsOnMonday = this._config.start_weekday === "monday";

    const firstDow = firstOfMonth.getDay();
    const offsetLeading = weekStartsOnMonday ? (firstDow === 0 ? 6 : firstDow - 1) : firstDow;

    const gridStart = addDays(startOfDay(firstOfMonth), -offsetLeading);

    const lastDow = lastOfMonth.getDay();
    const lastIndex = weekStartsOnMonday ? (lastDow === 0 ? 6 : lastDow - 1) : lastDow;

    const trailingDays = 6 - lastIndex;
    const gridEnd = addDays(startOfDay(lastOfMonth), trailingDays + 1);

    const cellCount = Math.round((gridEnd.getTime() - gridStart.getTime()) / DAY_MS);

    return { gridStart, gridEnd, firstOfMonth, lastOfMonth, cellCount };
  }

  async _callCalendarGetEvents(entityIds, start, end) {
    if (!this.hass?.callWS) throw new Error("hass.callWS is not available.");

    const res = await this.hass.callWS({
      type: "call_service",
      domain: "calendar",
      service: "get_events",
      service_data: {
        start_date_time: isoWithOffset(start),
        end_date_time: isoWithOffset(end),
      },
      target: { entity_id: entityIds },
      return_response: true,
    });

    return res?.response ?? {};
  }

  async _loadVisibleRange() {
    if (!this.hass || !this._config) return;

    const { gridStart, gridEnd } = this._getGridRange();
    const key = this._monthCacheKey(gridStart, gridEnd);
    if (this._eventsCache.has(key)) return;

    this._loading = true;
    this._lastError = null;

    try {
      const entity_id = [...this._enabled];
      const byEntity = await this._callCalendarGetEvents(entity_id, gridStart, gridEnd);
      this._eventsCache.set(key, { gridStart, gridEnd, byEntity });
    } catch (e) {
      this._lastError = e?.message ?? String(e);
      console.error("compact-month-card: failed to load events", e);
    } finally {
      this._loading = false;
      this.requestUpdate();
    }
  }

  _toggleCalendar(entity) {
    const next = new Set(this._enabled);
    if (next.has(entity)) next.delete(entity);
    else next.add(entity);
    this._enabled = next;
  }

  _navMonth(delta) {
    const y = this._viewDate.getFullYear();
    const m = this._viewDate.getMonth();
    this._viewDate = new Date(y, m + delta, 1);
  }

  _goToday() {
    const now = new Date();
    this._viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this._selectedDate = startOfDay(now);
  }

  _selectDay(d) {
    this._selectedDate = startOfDay(d);
  }

  _getActiveCache() {
    const { gridStart, gridEnd } = this._getGridRange();
    const key = this._monthCacheKey(gridStart, gridEnd);
    return this._eventsCache.get(key);
  }

  _computeDayMarkersAndSelectedEvents() {
    const cache = this._getActiveCache();
    const dayToCalendars = new Map();
    const selectedEvents = [];

    if (!cache?.byEntity) return { dayToCalendars, selectedEvents };

    const selectedStart = startOfDay(this._selectedDate);
    const selectedEnd = addDays(selectedStart, 1);

    for (const cal of this._config.calendars) {
      if (!this._enabled.has(cal.entity)) continue;
      const events = cache.byEntity?.[cal.entity]?.events || [];

      for (const ev of events) {
        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end);

        const gridStart = cache.gridStart;
        const gridEnd = cache.gridEnd;
        const clampStart = evStart < gridStart ? gridStart : evStart;
        const clampEnd = evEnd > gridEnd ? gridEnd : evEnd;

        let cur = startOfDay(clampStart);
        while (cur < clampEnd) {
          const dayStart = cur;
          const dayEnd = addDays(dayStart, 1);
          if (intervalsOverlap(evStart, evEnd, dayStart, dayEnd)) {
            const k = toDateOnlyKey(dayStart);
            if (!dayToCalendars.has(k)) dayToCalendars.set(k, new Set());
            dayToCalendars.get(k).add(cal.entity);
          }
          cur = addDays(cur, 1);
        }

        if (intervalsOverlap(evStart, evEnd, selectedStart, selectedEnd)) {
          selectedEvents.push({
            ...ev,
            _calendar: cal,
            _start: evStart,
            _end: evEnd,
          });
        }
      }
    }

    selectedEvents.sort((a, b) => a._start - b._start);
    return { dayToCalendars, selectedEvents };
  }

  _topCalendarsForDay(dayKey, dayToCalendars) {
    const set = dayToCalendars.get(dayKey);
    if (!set) return [];
    const max = this._config.dots?.max ?? 2;

    return this._config.calendars
      .filter((c) => this._enabled.has(c.entity) && set.has(c.entity))
      .slice()
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
      .slice(0, max);
  }

  _weekdayLabels() {
    const mon = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
    const sun = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
    return this._config.start_weekday === "monday" ? mon : sun;
  }

  _renderCalendarSelector() {
    const sel = this._config.selector || {};
    const size = Number(sel.button_size ?? 44);
    const radius = Number(sel.radius ?? 10);
    const borderOn = !!sel.border;
    const bg = this._config.backgrounds?.selector ?? "transparent";

    return html`
      <div class="selector ${sel.divider ? "with-divider" : ""}" style=${`background:${bg};`}>
        ${this._config.calendars.map((c) => {
          const on = this._enabled.has(c.entity);
          const title = c.label ?? this.hass?.states?.[c.entity]?.attributes?.friendly_name ?? c.entity;
          const border = borderOn && on ? `2px solid ${c.color}` : "2px solid transparent";

          return html`
            <button
              class="cal-btn ${on ? "on" : "off"}"
              style=${`width:${size}px;height:${size}px;border-radius:${radius}px;border:${border};`}
              title=${title}
              @click=${() => this._toggleCalendar(c.entity)}
            >
              <ha-icon
                icon=${c.icon ?? "mdi:calendar"}
                style=${`color:${on ? c.color : "var(--secondary-text-color)"}`}
              ></ha-icon>
            </button>
          `;
        })}
      </div>
    `;
  }

  _renderMonthGrid(dayToCalendars) {
    const { gridStart, firstOfMonth, cellCount } = this._getGridRange();
    const month = this._viewDate.getMonth();

    const todayKey = toDateOnlyKey(new Date());
    const selectedKey = toDateOnlyKey(this._selectedDate);

    const tilesEnabled = !!this._config.day_tiles?.background;
    const tilesTodayOnly = !!this._config.day_tiles?.today_only;

    const locale = this._config.locale || "cs-CZ";
    const monthLabel = firstOfMonth.toLocaleString(locale, { month: "long", year: "numeric" });

    const monthBg = this._config.backgrounds?.month ?? "transparent";

    const cells = [];
    for (let i = 0; i < cellCount; i++) {
      const d = addDays(gridStart, i);
      const key = toDateOnlyKey(d);
      const inMonth = d.getMonth() === month;
      const top = this._topCalendarsForDay(key, dayToCalendars);

      const isToday = key === todayKey;
      const isSelected = key === selectedKey;

      const tileBgOn = tilesEnabled && (!tilesTodayOnly || isToday);
      const tileClass = tileBgOn ? "tilebg" : "notilebg";

      cells.push(html`
        <button
          class="day ${tileClass} ${inMonth ? "" : "dim"} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}"
          @click=${() => this._selectDay(d)}
        >
          <div class="num">${d.getDate()}</div>
          <div class="dots">
            ${top.map((c) => html`<span class="dot" style=${`background:${c.color}`}></span>`)}
          </div>
        </button>
      `);
    }

    return html`
      <div class="month" style=${`background:${monthBg};`}>
        <div class="month-header">
          ${this._config.navigation
            ? html`<button class="nav" @click=${() => this._navMonth(-1)} aria-label="Předchozí měsíc">‹</button>`
            : html`<span></span>`}

          <div class="title">${monthLabel}</div>

          <div class="month-actions">
            <button class="nav today" @click=${this._goToday} aria-label="Dnes">
              <ha-icon icon="mdi:calendar-today"></ha-icon>
            </button>
            ${this._config.navigation
              ? html`<button class="nav" @click=${() => this._navMonth(1)} aria-label="Další měsíc">›</button>`
              : html`<span></span>`}
          </div>
        </div>

        <div class="dow">
          ${this._weekdayLabels().map((x) => html`<div class="dow-item">${x}</div>`)}
        </div>

        <div class="grid">${cells}</div>
      </div>
    `;
  }

  _renderEventList(selectedEvents) {
    // touch _nowTick to refresh when timer runs
    void this._nowTick;

    const locale = this._config.locale || "cs-CZ";
    const eventsBg = this._config.backgrounds?.events ?? "transparent";

    const dayLabel = this._selectedDate.toLocaleDateString(locale, {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const allDay = selectedEvents.filter((e) => !!e.all_day);
    const timed = selectedEvents.filter((e) => !e.all_day);

    const gapReduction = clampNumber(this._config.events?.gap_reduction, 0, 40, 16);
    const baseTimeCol = 56;
    const baseGap = 8;
    const timeCol = Math.max(44, baseTimeCol - gapReduction);
    const gap = Math.max(0, baseGap - Math.round(gapReduction / 8));

    const maxItems = this._config.events?.max_items;
    const limit = maxItems === null || maxItems === undefined ? null : clampNumber(maxItems, 1, 50, null);

    const merged = [...allDay, ...timed];
    const shown = limit ? merged.slice(0, limit) : merged;
    const hiddenCount = limit ? Math.max(0, merged.length - shown.length) : 0;

    const nowCfg = this._config.now || {};
    const nowEnabled = !!nowCfg.enabled;
    const showProgress = !!nowCfg.show_progress;
    const showText = !!nowCfg.show_text;
    const textMode = nowCfg.text_mode || "remaining";

    const now = new Date();

    const renderEv = (ev) => {
      const cal = ev._calendar;
      const title = ev.summary ?? ev.message ?? "(bez názvu)";

      const isAllDay = !!ev.all_day;
      const start = ev._start;
      const end = ev._end;

      const isOngoing =
        nowEnabled &&
        !isAllDay &&
        start instanceof Date &&
        end instanceof Date &&
        now >= start &&
        now <= end;

      let progressPct = 0;
      let subText = "";

      if (isOngoing) {
        const total = end.getTime() - start.getTime();
        const elapsed = now.getTime() - start.getTime();
        progressPct = total > 0 ? Math.max(0, Math.min(1, elapsed / total)) : 0;

        if (showText) {
          const elapsedTxt = `+${formatDurationShort(elapsed)}`;
          const remainingTxt = `-${formatDurationShort(end.getTime() - now.getTime())}`;
          if (textMode === "elapsed") subText = elapsedTxt;
          else if (textMode === "both") subText = `${elapsedTxt} / ${remainingTxt}`;
          else subText = remainingTxt; // remaining
        }
      }

      const time = isAllDay
        ? "Celý den"
        : `${start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;

      const ongoingStyle =
        isOngoing && showProgress ? `--cmc-ongoing:${Math.round(progressPct * 100)}%; --cmc-ongoing-color:${cal.color};` : "";

      return html`
        <div
          class="event ${isOngoing ? "ongoing" : ""}"
          style=${`grid-template-columns:${timeCol}px 1fr auto; gap:${gap}px; ${ongoingStyle}`}
        >
          <div class="time">
            <div class="t1">${time}</div>
            ${isOngoing && showText ? html`<div class="t2">${subText}</div>` : ""}
          </div>

          <div class="msg" title=${title}>${title}</div>

          ${this._config.event_indicator?.type === "icon"
            ? html`<ha-icon
                class="ev-icon"
                icon=${cal.icon ?? "mdi:calendar"}
                style=${`color:${cal.color}; font-size:${this._config.event_indicator?.size ?? 14}px;`}
                title=${cal.label ?? cal.entity}
              ></ha-icon>`
            : html`<span class="ev-dot" style=${`background:${cal.color}`}></span>`}
        </div>
      `;
    };

    const countText =
      this._config.events?.show_count ? html`<span class="count">${merged.length}</span>` : "";

    return html`
      <div class="events" style=${`background:${eventsBg};`}>
        <div class="events-header">
          <div class="h-left">${dayLabel}</div>
          ${countText}
        </div>

        <div class="events-list">
          ${merged.length === 0
            ? html`<div class="empty">Žádné události</div>`
            : html`${shown.map(renderEv)}`}

          ${hiddenCount > 0 && this._config.events?.show_more
            ? html`<div class="more">+${hiddenCount} dalších</div>`
            : ""}
        </div>
      </div>
    `;
  }

  render() {
    if (!this._config) return html``;

    const { dayToCalendars, selectedEvents } = this._computeDayMarkersAndSelectedEvents();

    const cardBg = this._config.backgrounds?.card ?? null;
    const cardStyle = cardBg ? `--cmc-card-bg:${cardBg};` : "";

    return html`
      <ha-card class="wrap" style=${cardStyle}>
        <div class="layout">
          ${this._renderCalendarSelector()}
          ${this._renderMonthGrid(dayToCalendars)}
          ${this._renderEventList(selectedEvents)}
        </div>

        ${this._loading ? html`<div class="loading">Načítání…</div>` : ""}
        ${this._lastError ? html`<div class="error">Chyba: ${this._lastError}</div>` : ""}
      </ha-card>
    `;
  }

  static styles = css`
    .wrap {
      border-radius: 16px;
      overflow: hidden;
      background: var(--cmc-card-bg, var(--ha-card-background, var(--card-background-color)));
    }

    .layout {
      display: grid;
      grid-template-columns: 1fr 4fr 4fr;
      gap: 12px;
      padding: 12px;
      box-sizing: border-box;
      align-items: start;
    }

    /* selector */
    .selector {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      justify-content: flex-start;

      padding: 8px 8px 8px 0;
      border-radius: 12px;
      box-sizing: border-box;
    }
    .selector.with-divider {
      border-right: 1px solid rgba(255, 255, 255, 0.08);
    }

    .cal-btn {
      border: 2px solid transparent;
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      display: grid;
      place-items: center;
      box-sizing: border-box;
    }
    .cal-btn.off {
      opacity: 0.65;
      filter: grayscale(0.2);
    }

    /* month */
    .month {
      display: flex;
      flex-direction: column;
      min-width: 0;
      border-radius: 12px;
      padding: 8px 8px 10px;
      box-sizing: border-box;
    }

    .month-header {
      display: grid;
      grid-template-columns: 32px 1fr auto;
      align-items: center;
      margin-bottom: 8px;
      gap: 6px;
    }

    .month-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      align-items: center;
    }

    .title {
      text-align: center;
      font-weight: 600;
    }

    .nav {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      border: 0;
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      display: grid;
      place-items: center;
    }
    .nav.today ha-icon {
      opacity: 0.9;
    }

    .dow {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 8px;
      margin-bottom: 8px;
      opacity: 0.85;
      font-size: 12px;
    }
    .dow-item {
      text-align: center;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 8px;
      align-items: stretch;
    }

    .day {
      aspect-ratio: 1 / 1;
      width: 100%;
      border-radius: 10px;
      border: 0;
      cursor: pointer;

      display: grid;
      grid-template-rows: 1fr auto;
      align-items: center;
      justify-items: center;

      padding: 6px 0 4px;
      box-sizing: border-box;
    }

    .day.tilebg {
      background: rgba(255, 255, 255, 0.03);
    }
    .day.notilebg {
      background: transparent;
    }

    .day.dim {
      opacity: 0.45;
    }

    .day.today {
      outline: 1px solid rgba(255, 255, 255, 0.25);
    }

    .day.selected {
      background: rgba(255, 255, 255, 0.10);
      outline: 1px solid rgba(255, 255, 255, 0.25);
    }

    .num {
      font-size: 13px;
      line-height: 1;
    }

    .dots {
      display: flex;
      gap: 4px;
      height: 8px;
      align-items: center;
      justify-content: center;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      display: inline-block;
    }

    /* events panel */
    .events {
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      border-radius: 12px;
      padding: 8px 8px 10px;
      box-sizing: border-box;
    }

    .events-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .events-header .count {
      font-weight: 600;
      opacity: 0.75;
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
    }

    .events-list {
      overflow: auto;
      padding-right: 4px;
      max-height: 100%;
    }

    .event {
      display: grid;
      align-items: center;
      padding: 10px 10px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      margin-bottom: 8px;
      position: relative;
      overflow: hidden;
    }

    /* OPTIONAL ongoing progress overlay */
    .event.ongoing::after {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: var(--cmc-ongoing, 0%);
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--cmc-ongoing-color, rgba(255,255,255,0.2)) 25%, transparent),
        transparent
      );
      pointer-events: none;
    }

    .time {
      font-size: 12px;
      opacity: 0.85;
      white-space: nowrap;
      line-height: 1.1;
    }
    .time .t2 {
      margin-top: 3px;
      font-size: 11px;
      opacity: 0.75;
    }

    .msg {
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      position: relative;
      z-index: 1; /* above overlay */
    }

    .ev-icon, .ev-dot {
      position: relative;
      z-index: 1; /* above overlay */
    }

    .more {
      opacity: 0.75;
      font-size: 12px;
      padding: 6px 8px;
    }

    .loading {
      padding: 0 12px 10px;
      opacity: 0.7;
      font-size: 12px;
    }

    .error {
      padding: 0 12px 12px;
      color: var(--error-color);
      font-size: 12px;
    }

    .empty {
      opacity: 0.7;
      padding: 8px;
    }
  `;
}

customElements.define("compact-month-card", CompactMonthCard);
console.info("compact-month-card loaded");
