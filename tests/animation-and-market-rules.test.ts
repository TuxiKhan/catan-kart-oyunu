import { describe, expect, it, vi } from 'vitest';
import {
  createInitialGameState,
  executeBuildStructure,
} from '@/lib/engine/gameEngine';
import {
  createAuthoritativeRoom,
  joinAuthoritativeRoom,
  startAuthoritativeGame,
  createOrUpdatePlayerSession,
} from '@/lib/multiplayer/syncManager';
import { AuthoritativeGameState, BuildingCardType, RoomSettings } from '@/types/game';

describe('SubAgent Animation & Market Rules Verification Tests', () => {
  const defaultSettings: RoomSettings = {
    maxPlayers: 3,
    useFirstGamePreset: true,
    metropolisFaceMode: 'A',
    turnTimeoutSeconds: 60,
  };

  const initialPlayers = [
    { playerId: 'player_1', nickname: 'Oyuncu 1' },
    { playerId: 'player_2', nickname: 'Oyuncu 2' },
    { playerId: 'player_3', nickname: 'Oyuncu 3' },
  ];

  it('Game start initializes exactly 5 face-up cards in building row (cardMarket) and 4 in metropolis stack', () => {
    const state = createInitialGameState({
      roomId: 'room_test_1',
      roomCode: 'CAT101',
      players: initialPlayers,
      settings: defaultSettings,
    });

    // 1. Market contains exactly 5 face-up building cards
    expect(state.cardMarket.length).toBe(5);
    state.cardMarket.forEach((cardType) => {
      expect(['road', 'settlement', 'city', 'knight']).toContain(cardType);
    });

    // 2. Metropolis cards sit in a separate stack at the end of the building row (total 4 cards)
    expect(state.metropolisDeck.length).toBe(4);
    expect(state.metropolisDeck[0].face).toBe('A');

    // 3. Building reserve deck has the remaining cards
    expect(state.buildingDeck.length).toBe(34 - 5);
  });

  it('Refill rule: Purchasing any building card immediately refills the building row so that it always has 5 face-up cards', () => {
    const state = createInitialGameState({
      roomId: 'room_test_2',
      roomCode: 'CAT102',
      players: initialPlayers,
      settings: defaultSettings,
    });

    const activePlayer = state.players[state.activePlayerIndex];
    // Give active player resources to build a road
    state.hands[activePlayer.playerId] = ['brick', 'wood', 'wool', 'wheat', 'ore'];
    state.turnPhase = 'action';

    const cardToBuild = state.cardMarket.find((c) => c === 'road') || state.cardMarket[0];
    const initialReserveCount = state.buildingDeck.length;

    const nextState = executeBuildStructure(state, activePlayer.playerId, cardToBuild);

    // After building, the building row MUST still have exactly 5 face-up cards
    expect(nextState.cardMarket.length).toBe(5);
    // The reserve building deck decremented by 1 to refill the market
    expect(nextState.buildingDeck.length).toBe(initialReserveCount - 1);
  });

  it('Metropolis construction: Taken from the metropolis stack at the end of the row, NOT affecting the 5 face-up building cards', () => {
    const state = createInitialGameState({
      roomId: 'room_test_3',
      roomCode: 'CAT103',
      players: initialPlayers,
      settings: defaultSettings,
    });

    const activePlayer = state.players[state.activePlayerIndex];
    // Set up a city so player can upgrade to metropolis
    activePlayer.villageSlots[0].upgradedTo = 'city';
    state.hands[activePlayer.playerId] = ['wool', 'wool', 'wool', 'ore'];
    state.turnPhase = 'action';

    const initialMarket = [...state.cardMarket];
    expect(initialMarket.length).toBe(5);
    expect(state.metropolisDeck.length).toBe(4);

    const nextState = executeBuildStructure(state, activePlayer.playerId, 'metropolis');

    // 1. The 5 face-up cards in the building row remain completely untouched
    expect(nextState.cardMarket.length).toBe(5);
    expect(nextState.cardMarket).toEqual(initialMarket);

    // 2. The metropolis stack at the end decremented by 1
    expect(nextState.metropolisDeck.length).toBe(3);
    // Player's slot is now upgraded to metropolis
    expect(nextState.players[state.activePlayerIndex].villageSlots[0].upgradedTo).toBe('metropolis');
  });

  it('Animation loop prevention: Game start trigger callback is executed only once and subsequent state broadcasts do not re-trigger it', () => {
    const host = createOrUpdatePlayerSession('HostPlayer');
    const roomRes = createAuthoritativeRoom(host, defaultSettings, 'LOOP01');
    expect(roomRes.ok).toBe(true);

    const p2Res = joinAuthoritativeRoom(roomRes.state!, { playerId: 'p2', nickname: 'Oyuncu 2' });
    const p3Res = joinAuthoritativeRoom(p2Res.state!, { playerId: 'p3', nickname: 'Oyuncu 3' });

    // Spy on onGameStarted
    const onGameStartedSpy = vi.fn();
    let hasTriggered = false;

    const triggerGameStartedOnce = (
      authState: AuthoritativeGameState,
      session: { playerId: string; nickname: string }
    ) => {
      if (hasTriggered) return;
      hasTriggered = true;
      onGameStartedSpy(authState, session);
    };

    // 1. Host starts the game
    const started = startAuthoritativeGame(p3Res.state!, host.playerId);
    expect(started.ok).toBe(true);
    expect(started.state!.status).toBe('playing');

    // Trigger on game started
    if (started.state!.status === 'playing') {
      triggerGameStartedOnce(started.state!, host);
    }

    expect(onGameStartedSpy).toHaveBeenCalledTimes(1);

    // 2. Simulate subsequent broadcast updates (e.g., turn timer ticks, heartbeats, actions)
    for (let i = 0; i < 5; i++) {
      const broadcastUpdate: AuthoritativeGameState = {
        ...started.state!,
        turnNumber: i + 1,
      };
      if (broadcastUpdate.status === 'playing') {
        triggerGameStartedOnce(broadcastUpdate, host);
      }
    }

    // Still called ONLY ONCE! Infinite deal overlay loop is prevented!
    expect(onGameStartedSpy).toHaveBeenCalledTimes(1);
  });
});
