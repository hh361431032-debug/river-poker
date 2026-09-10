const API = '/api/db';

function encode(value) { return encodeURIComponent(String(value)); }

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.params = new URLSearchParams();
    this.method = 'GET';
    this.body = null;
    this.single = false;
  }
  select(fields = '*') { this.params.set('select', fields); this.method = 'GET'; return this; }
  eq(column, value) { this.params.append('eq', `${column}:${value}`); return this; }
  neq(column, value) { this.params.append('neq', `${column}:${value}`); return this; }
  order(column, options = {}) { this.params.set('order', `${column}.${options.ascending === false ? 'desc' : 'asc'}`); return this; }
  limit(count) { this.params.set('limit', String(count)); return this; }
  maybeSingle() { this.single = true; return this; }
  insert(values) { this.method = 'POST'; this.body = values; return this; }
  upsert(values, options = {}) { this.method = 'POST'; this.body = Array.isArray(values) ? values : values; this.upsertMode = true; return this; }
  update(values) { this.method = 'PATCH'; this.body = values; return this; }
  delete() { this.method = 'DELETE'; return this; }
  async then(resolve, reject) {
    try {
      const params = new URLSearchParams(this.params);
      if (this.single) params.set('single', '1');
      if (this.upsertMode) {
        if (Array.isArray(this.body)) {
          this.body = this.body.map(row => ({ ...row, __upsert: true }));
        } else {
          this.body = { ...this.body, __upsert: true };
        }
      }
      const response = await fetch(`${API}/${encode(this.table)}${params.toString() ? `?${params}` : ''}`, {
        method: this.method,
        headers: { 'Content-Type': 'application/json' },
        body: this.method === 'GET' || this.method === 'DELETE' ? undefined : JSON.stringify(this.body),
      });
      const json = await response.json();
      const result = { data: json.data ?? null, error: json.error ? new Error(json.error.message || 'Local database error') : (response.ok ? null : new Error(`HTTP ${response.status}`)) };
      return resolve ? resolve(result) : result;
    } catch (error) {
      const result = { data: null, error };
      return reject ? reject(error) : result;
    }
  }
}

class Channel {
  constructor(name) { this.name = name; this.handlers = []; this.source = null; }
  on(type, config, callback) {
    this.handlers.push({ type, config, callback });
    return this;
  }
  subscribe() {
    if (typeof EventSource === 'undefined') return this;
    this.source = new EventSource('/api/events');
    this.source.addEventListener('change', event => {
      try {
        const payload = JSON.parse(event.data);
        for (const h of this.handlers) {
          if (h.config?.table && h.config.table !== payload.table) continue;
          const filter = h.config?.filter;
          if (filter) {
            const match = filter.match(/^([^=]+)=eq\\.(.*)$/);
            if (match && String(payload.new?.[match[1]]) !== String(match[2]) && String(payload.old?.[match[1]]) !== String(match[2])) continue;
          }
          h.callback(payload);
        }
      } catch {}
    });
    return this;
  }
}

export const supabase = {
  from(table) { return new QueryBuilder(table); },
  channel(name) { return new Channel(name); },
  removeChannel(channel) { try { channel?.source?.close(); } catch {} return Promise.resolve(); },
};
