import { describe, expect, it, beforeEach } from 'vitest';
import {
  createAuthoritativeRoom,
  createOrUpdatePlayerSession,
  getOrCreatePlayerId,
  getSavedPlayerName,
  getSavedPlayerSession,
  joinAuthoritativeRoom,
  savePlayerName,
  savePlayerSession,
  startAuthoritativeGame,
  PLAYER_NAME_STORAGE_KEY,
  PLAYER_ID_STORAGE_KEY,
} from '@/lib/multiplayer/syncManager';
import { RoomSettings } from '@/types/game';

// Simulated localStorage for node test environment
const mockStorage: Record<string, string> = {};

if (typeof window === 'undefined') {
  (global as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) delete mockStorage[k];
      },
    },
    sessionStorage: {
      getItem: (key: string) => mockStorage[`session_${key}`] || null,
      setItem: (key: string, val: string) => {
        mockStorage[`session_${key}`] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[`session_${key}`];
      },
    },
  };
}

describe('Lobby and Profile Identity Tests', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  });

  it('generates and persists a valid UUID in catan_player_id', () => {
    const id1 = getOrCreatePlayerId();
    expect(id1).toBeDefined();
    expect(id1.length).toBeGreaterThan(10);

    // Should match UUID pattern or length
    const storedId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
    expect(storedId).toBe(id1);

    // Calling again returns the same persistent id
    const id2 = getOrCreatePlayerId();
    expect(id2).toBe(id1);
  });

  it('stores and retrieves player name in catan_player_name without misafir reference', () => {
    savePlayerName('Barbaros Hayrettin');
    expect(window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY)).toBe('Barbaros Hayrettin');
    expect(getSavedPlayerName()).toBe('Barbaros Hayrettin');

    const session = createOrUpdatePlayerSession('Barbaros Hayrettin');
    expect(session.nickname).toBe('Barbaros Hayrettin');
    expect(session.nickname.toLowerCase()).not.toContain('misafir');
    expect(session.playerId).toBeDefined();
  });

  it('uses Oyuncu as clean fallback when nickname is empty (never Misafir)', () => {
    const session = createOrUpdatePlayerSession('');
    expect(session.nickname).toBe('Oyuncu');
    expect(session.nickname.toLowerCase()).not.toContain('misafir');
  });

  it('creates room with "Yeni Başladım / İlk Kez Oynuyorum" preset (useFirstGamePreset=true, metropolisFaceMode=A)', () => {
    const player = createOrUpdatePlayerSession('Kaptan');
    const settingsFirstGame: RoomSettings = {
      maxPlayers: 3,
      useFirstGamePreset: true,
      metropolisFaceMode: 'A',
      turnTimeoutSeconds: 60,
    };

    const res = createAuthoritativeRoom(player, settingsFirstGame);
    expect(res.ok).toBe(true);
    expect(res.state).toBeDefined();
    expect(res.state!.settings.useFirstGamePreset).toBe(true);
    expect(res.state!.settings.metropolisFaceMode).toBe('A');

    // Add 2 more players to reach 3 players and start
    const roomWithP2 = joinAuthoritativeRoom(res.state!, { playerId: 'p2', nickname: 'Oyuncu 2' }).state!;
    const roomWithP3 = joinAuthoritativeRoom(roomWithP2, { playerId: 'p3', nickname: 'Oyuncu 3' }).state!;

    const started = startAuthoritativeGame(roomWithP3, player.playerId);
    expect(started.ok).toBe(true);
    expect(started.state!.cardMarket.length).toBe(5);

    // In first game preset, initial row contains 2 settlements, 1 knight, 1 road, 1 city
    const settlements = started.state!.cardMarket.filter((c) => c === 'settlement');
    const knights = started.state!.cardMarket.filter((c) => c === 'knight');
    const roads = started.state!.cardMarket.filter((c) => c === 'road');
    const cities = started.state!.cardMarket.filter((c) => c === 'city');

    expect(settlements.length).toBe(2);
    expect(knights.length).toBe(1);
    expect(roads.length).toBe(1);
    expect(cities.length).toBe(1);
  });

  it('creates room with "Daha Önce Oynadım / Deneyimliyim" preset (useFirstGamePreset=false, metropolisFaceMode=B)', () => {
    const player = createOrUpdatePlayerSession('Deneyimli Reis');
    const settingsExperienced: RoomSettings = {
      maxPlayers: 4,
      useFirstGamePreset: false,
      metropolisFaceMode: 'B',
      turnTimeoutSeconds: 90,
    };

    const res = createAuthoritativeRoom(player, settingsExperienced);
    expect(res.ok).toBe(true);
    expect(res.state).toBeDefined();
    expect(res.state!.settings.useFirstGamePreset).toBe(false);
    expect(res.state!.settings.metropolisFaceMode).toBe('B');

    // Add 2 more players and start
    const roomWithP2 = joinAuthoritativeRoom(res.state!, { playerId: 'p2', nickname: 'Oyuncu 2' }).state!;
    const roomWithP3 = joinAuthoritativeRoom(roomWithP2, { playerId: 'p3', nickname: 'Oyuncu 3' }).state!;

    const started = startAuthoritativeGame(roomWithP3, player.playerId);
    expect(started.ok).toBe(true);
    expect(started.state!.cardMarket.length).toBe(5);
  });

  it('allows adding players up to maxPlayers and cleans player naming', () => {
    const host = createOrUpdatePlayerSession('Host Player');
    const room = createAuthoritativeRoom(host, {
      maxPlayers: 3,
      useFirstGamePreset: true,
      metropolisFaceMode: 'A',
      turnTimeoutSeconds: 60,
    }).state!;

    const p2Res = joinAuthoritativeRoom(room, { playerId: 'p2_uuid', nickname: 'İkinci Oyuncu' });
    expect(p2Res.ok).toBe(true);
    expect(p2Res.state!.players.length).toBe(2);
    expect(p2Res.state!.players[1].nickname).toBe('İkinci Oyuncu');

    const p3Res = joinAuthoritativeRoom(p2Res.state!, { playerId: 'p3_uuid', nickname: 'Üçüncü Oyuncu' });
    expect(p3Res.ok).toBe(true);
    expect(p3Res.state!.players.length).toBe(3);

    // 4th player should be rejected since maxPlayers is 3
    const p4Res = joinAuthoritativeRoom(p3Res.state!, { playerId: 'p4_uuid', nickname: 'Dördüncü Oyuncu' });
    expect(p4Res.ok).toBe(false);
    expect(p4Res.error).toContain('dolu');
  });
});
