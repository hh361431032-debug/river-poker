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

// Keep the logical current player by name instead of relying only on an array index.
// This makes turn state survive a player being removed from the middle of the array.
function repairTurnState(state) {
  if (!state || !Array.isArray(state.players) || state.stage === 'waiting' || state.stage === 'handover') return state;

  const players = state.players;
  const eligible = p => p && p.inHand && !p.folded && !p.allIn && !p.kicked;

  // Persist the identity of the player whose turn is active. Older rooms may not have it.
  if (!state.turnPlayerName && Number.isInteger(state.turnIndex) && players[state.turnIndex]) {
    state.turnPlayerName = players[state.turnIndex].name;
  }

  let currentIndex = state.turnPlayerName
    ? players.findIndex(p => p.name === state.turnPlayerName)
    : -1;

  // The current player left, was kicked, folded, or went all-in before the next state was saved.
  // Move directly to the next eligible seat instead of leaving a dead turn index behind.
  if (currentIndex < 0 || !eligible(players[currentIndex])) {
    const start = currentIndex >= 0 ? currentIndex : (Number.isInteger(state.turnIndex) ? state.turnIndex - 1 : -1);
    let next = -1;
    for (let step = 1; step <= players.length; step++) {
      const i = (start + step + players.length) % players.length;
      if (eligible(players[i])) { next = i; break; }
    }

    const remaining = players.filter(p => p.inHand && !p.folded && !p.kicked);
    if (remaining.length <= 1) {
      if (remaining.length === 1 && Number(state.pot) > 0) {
        remaining[0].chips = Number(remaining[0].chips || 0) + Number(state.pot || 0);
        state.log = Array.isArray(state.log) ? state.log.slice(-29) : [];
        state.log.push(`${remaining[0].name} 获得彩池 ${state.pot} 筹码（其他玩家退出或被踢出）`);
        state.pot = 0;
      }
      state.stage = 'handover';
      state.turnIndex = null;
      state.turnPlayerName = null;
      state.turnStartedAt = null;
      return state;
    }

    if (next >= 0) {
      state.turnIndex = next;
      state.turnPlayerName = players[next].name;
      state.turnStartedAt = Date.now();
    } else {
      state.turnIndex = null;
      state.turnPlayerName = null;
      state.turnStartedAt = null;
    }
    return state;
  }

  // A player before the active player left. Re-map the index to the same player.
  if (currentIndex !== state.turnIndex) {
    state.turnIndex = currentIndex;
  }
  state.turnPlayerName = players[currentIndex].name;
  return state;
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
      return data ? { value: JSON.stringify(repairTurnState(data.state)) } : null;
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
      const state = repairTurnState(JSON.parse(value));
      if (state.stage !== 'waiting' && state.stage !== 'handover' && !state.turnPlayerName && Number.isInteger(state.turnIndex) && state.players?.[state.turnIndex]) {
        state.turnPlayerName = state.players[state.turnIndex].name;
      }
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
