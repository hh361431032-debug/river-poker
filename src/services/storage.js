import { supabase } from './supabase';

const LOCAL_PREFIX = 'river-poker:';
const notify = () => window.dispatchEvent(new Event('river-poker-storage'));

function localKey(key) { return LOCAL_PREFIX + key; }

function roomMetaFromState(state) {
  return {
    code: state.code,
    name: state.name,
    host_name: state.hostName,
    player_count: Array.isArray(state.players) ? state.players.length : 0,
    status: state.status || 'waiting',
  };
}

export const storage = {
  async get(key) {
    if (key === 'poker:session') {
      const value = localStorage.getItem(localKey(key));
      return value === null ? null : { value };
    }

    if (key === 'poker:users') {
      const { data, error } = await supabase
        .from('poker_users')
        .select('username,password_hash,chips,avatar_url');
      if (error) throw error;
      const users = Object.fromEntries((data || []).map(u => [u.username, {
        passwordHash: u.password_hash,
        chips: u.chips,
        avatarUrl: u.avatar_url,
      }]));
      return { value: JSON.stringify(users) };
    }

    if (key === 'poker:rooms-index') {
      const { data, error } = await supabase
        .from('poker_rooms')
        .select('code,name,host_name,player_count,status,updated_at')
        .neq('status', 'closed')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return { value: JSON.stringify((data || []).map(r => ({
        code: r.code,
        name: r.name,
        hostName: r.host_name,
        playerCount: r.player_count,
        status: r.status,
      }))) };
    }

    if (key.startsWith('poker:room:')) {
      const code = key.slice('poker:room:'.length);
      const { data, error } = await supabase
        .from('poker_rooms')
        .select('state')
        .eq('code', code)
        .maybeSingle();
      if (error) throw error;
      return data ? { value: JSON.stringify(data.state) } : null;
    }

    return null;
  },


  async getUserProfile(username) {
    const { data, error } = await supabase
      .from('poker_users')
      .select('username,avatar_url')
      .eq('username', username)
      .maybeSingle();
    if (error) throw error;
    return data ? { username: data.username, avatarUrl: data.avatar_url || null } : null;
  },

  async setUserAvatar(username, avatarUrl) {
    const { error } = await supabase
      .from('poker_users')
      .update({ avatar_url: avatarUrl || null })
      .eq('username', username);
    if (error) throw error;
    notify();
    return { success: true };
  },

  async set(key, value) {
    if (key === 'poker:session') {
      localStorage.setItem(localKey(key), value);
      notify();
      return { success: true };
    }

    if (key === 'poker:users') {
      const users = JSON.parse(value || '{}');
      const rows = Object.entries(users).map(([username, u]) => ({
        username,
        password_hash: u.passwordHash,
        chips: Number(u.chips ?? 1000),
        avatar_url: u.avatarUrl || null,
      }));
      if (rows.length) {
        const { error } = await supabase.from('poker_users').upsert(rows, { onConflict: 'username' });
        if (error) throw error;
      }
      notify();
      return { success: true };
    }

    if (key.startsWith('poker:room:')) {
      const state = JSON.parse(value);
      const meta = roomMetaFromState(state);
      const { error } = await supabase.from('poker_rooms').upsert({
        ...meta,
        state,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'code' });
      if (error) throw error;
      notify();
      return { success: true };
    }

    if (key === 'poker:rooms-index') {
      // 房间索引由 poker_rooms 自动生成；这里保留接口兼容旧代码。
      notify();
      return { success: true };
    }

    return { success: true };
  },

  async delete(key) {
    if (key === 'poker:session') {
      localStorage.removeItem(localKey(key));
      notify();
      return { success: true };
    }

    if (key.startsWith('poker:room:')) {
      const code = key.slice('poker:room:'.length);
      const { error } = await supabase.from('poker_rooms').delete().eq('code', code);
      if (error) throw error;
      notify();
      return { success: true };
    }

    return { success: true };
  },
};
