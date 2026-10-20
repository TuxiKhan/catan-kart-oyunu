import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptTradeOffer,
  checkAndHandleTurnTimeout,
  clearMemoryRoomStore,
  createAuthoritativeRoom,
  createOrUpdateGuestSession,
  getRemainingTurnSeconds,
  initiateTrade,
  joinAuthoritativeRoom,
  MultiplayerSyncManager,
  setPlayerConnectionState,
  startAuthoritativeGame,
  submitCounterOffer,
  toClientGameView,
} from '../src/lib/multiplayer/syncManager';
import { RoomSettings } from '../src/types/game';

describe('Multiplayer Sync, Lobby, Reconnection & Live Trade System', () => {
  const defaultSettings: RoomSettings = {
    maxPlayers: 3,
    useFirstGamePreset: true,
    metropolisFaceMode: 'A',
    turnTimeoutSeconds: 60,
  };

  beforeEach(() => {
    clearMemoryRoomStore();
  });

  it('1. 3 ve 4 kişilik oda kurulum sınırlarını, başlangıç 2 kaynak kartı dağıtımını, production fazını ve İlk Oyun / 5 Aynı Kart Market kurallarını doğrular', () => {
    const host = createOrUpdateGuestSession('Barbaros', 'p1');
    const createRes = createAuthoritativeRoom(host, defaultSettings, 'CAT300');
    expect(createRes.ok).toBe(true);
    expect(createRes.state?.roomCode).toBe('CAT300');
    expect(createRes.state?.players).toHaveLength(1);

    // 2. ve 3. oyuncular katılır
    const join2 = joinAuthoritativeRoom(createRes.state!, {
      playerId: 'p2',
      nickname: 'Turgut',
    });
    expect(join2.ok).toBe(true);

    const join3 = joinAuthoritativeRoom(join2.state!, {
      playerId: 'p3',
      nickname: 'Piri',
    });
    expect(join3.ok).toBe(true);
    expect(join3.state?.players).toHaveLength(3);

    // 3 kişilik odaya 4. oyuncu girmeye çalışırsa reddedilmeli
    const join4 = joinAuthoritativeRoom(join3.state!, {
      playerId: 'p4',
      nickname: 'FazlaOyuncu',
    });
    expect(join4.ok).toBe(false);
    expect(join4.error).toContain('Oda dolu');

    // Oyunu başlat:
    // - İlk Oyun Dizilimi (2 Köy, 1 Şövalye, 1 Yol, 1 Şehir)
    // - Her oyuncuya kapalı 2'şer Kaynak kartı (61 - 3*2 = 55 kalan deste)
    // - İlk tur 'production' fazında başlamalı!
    const startRes = startAuthoritativeGame(join3.state!, 'p1');
    expect(startRes.ok).toBe(true);
    const startedState = startRes.state!;
    expect(startedState.turnPhase).toBe('production');
    expect(startedState.hands['p1']).toHaveLength(2);
    expect(startedState.hands['p2']).toHaveLength(2);
    expect(startedState.hands['p3']).toHaveLength(2);
    expect(startedState.resourceDeck).toHaveLength(55);

    const market = startedState.cardMarket;
    expect(market).toHaveLength(5);
    expect(market.filter((c) => c === 'settlement')).toHaveLength(2);
    expect(market.filter((c) => c === 'knight')).toHaveLength(1);
    expect(market.filter((c) => c === 'road')).toHaveLength(1);
    expect(market.filter((c) => c === 'city')).toHaveLength(1);

    // useFirstGamePreset = false olduğunda 5 Aynı Kart Kuralı (refillCardMarket) kontrolü
    let randomRoom = createAuthoritativeRoom(
      host,
      { ...defaultSettings, useFirstGamePreset: false },
      'RND500'
    ).state!;
    randomRoom = joinAuthoritativeRoom(randomRoom, { playerId: 'p2', nickname: 'Turgut' }).state!;
    randomRoom = joinAuthoritativeRoom(randomRoom, { playerId: 'p3', nickname: 'Piri' }).state!;
    // Destenin ilk 5 kartını bilerek aynı tür ('road') yapalım
    randomRoom.buildingDeck = [
      'road',
      'road',
      'road',
      'road',
      'road',
      'settlement',
      'city',
      'knight',
    ];
    const startedRandom = startAuthoritativeGame(randomRoom, 'p1').state!;
    expect(startedRandom.cardMarket).toHaveLength(5);
    const allSame = startedRandom.cardMarket.every(
      (c) => c === startedRandom.cardMarket[0]
    );
    expect(allSame).toBe(false);
  });

  it('2. Misafir oyuncunun bağlantısı koptuğunda (disconnect) ve yeniden bağlandığında (reconnection) elindeki 2 kartı ve koltuğunu korur', () => {
    const createRes = createAuthoritativeRoom(
      { playerId: 'p1', nickname: 'Kaptan' },
      { ...defaultSettings, maxPlayers: 4 },
      'REC400'
    );
    let state = createRes.state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p2', nickname: 'Denizci' }).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p3', nickname: 'Tüccar' }).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p4', nickname: 'Kaşif' }).state!;
    state = startAuthoritativeGame(state, 'p1').state!;

    const p2OriginalHand = [...state.hands['p2']];
    expect(p2OriginalHand).toHaveLength(2);
    expect(state.resourceDeck).toHaveLength(53); // 61 - 4*2 = 53

    // p2 bağlantısı kopar
    const discRes = setPlayerConnectionState(state, 'p2', false);
    expect(discRes.ok).toBe(true);
    expect(discRes.state!.players.find((p) => p.playerId === 'p2')?.isConnected).toBe(false);

    // p2 devam eden oyuna yeniden bağlanır (reconnection)
    const reconRes = joinAuthoritativeRoom(discRes.state!, {
      playerId: 'p2',
      nickname: 'Denizci',
    });
    expect(reconRes.ok).toBe(true);
    const p2After = reconRes.state!.players.find((p) => p.playerId === 'p2')!;
    expect(p2After.isConnected).toBe(true);
    expect(p2After.seatIndex).toBe(1);
    expect(reconRes.state!.hands['p2']).toEqual(p2OriginalHand);

    // Maskelenmiş ClientGameView kontrolü: p2 kendi elini görür, rakiplerin sadece kart sayısını (2) görür
    const clientView = toClientGameView(reconRes.state!, 'p2');
    expect(clientView.myPlayerId).toBe('p2');
    expect(clientView.myHand).toEqual(p2OriginalHand);
    expect(clientView.players[0].handCount).toBe(2);
  });

  it('3. Sadece aktif oyuncu ticaret başlatabilir; aktif olmayan oyuncular kendi aralarında ticaret yapamaz', () => {
    let state = createAuthoritativeRoom(
      { playerId: 'p1', nickname: 'AktifOyuncu' },
      defaultSettings,
      'TRD100'
    ).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p2', nickname: 'Oyuncu2' }).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p3', nickname: 'Oyuncu3' }).state!;
    state = startAuthoritativeGame(state, 'p1').state!;
    expect(state.turnPhase).toBe('production');

    // Üretim tamamlanıp aksiyon fazına geçildiğinde ticaret yapılır
    state.turnPhase = 'action';

    // Sıra p1'de (activePlayerIndex = 0). p2 ticaret başlatmaya çalışırsa reddedilir!
    const invalidInit = initiateTrade(state, 'p2', ['wheat'], ['wood']);
    expect(invalidInit.ok).toBe(false);
    expect(invalidInit.error).toContain('Sadece sırası gelen aktif oyuncu');

    // p1 ticaret başlatır
    state.hands['p1'] = ['wood', 'brick', 'wool'];
    state.hands['p2'] = ['ore', 'ore', 'wheat'];
    state.hands['p3'] = ['wheat', 'wool', 'brick'];

    const validInit = initiateTrade(state, 'p1', ['ore'], ['wood']);
    expect(validInit.ok).toBe(true);
    state = validInit.state!;

    // p2, aktif olmayan p3 ile ticaret yapmaya çalışırsa reddedilir!
    const nonActiveBetweenEachOther = submitCounterOffer(
      state,
      'p2',
      ['ore'],
      ['wheat'],
      'p3'
    );
    expect(nonActiveBetweenEachOther.ok).toBe(false);
    expect(nonActiveBetweenEachOther.error).toContain(
      'Aktif olmayan oyuncular kendi aralarında ticaret yapamazlar'
    );
  });

  it('4. Serbest oranlı (1:1 zorunluluğu olmayan) takası gerçekleştirir ve takas yapılan diğer oyuncuya desteden otomatik +1 kapalı Kaynak kartı ödülü verir', () => {
    let state = createAuthoritativeRoom(
      { playerId: 'p1', nickname: 'AktifOyuncu' },
      defaultSettings,
      'TRD200'
    ).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p2', nickname: 'TeklifVeren' }).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p3', nickname: 'Izleyici' }).state!;
    state = startAuthoritativeGame(state, 'p1').state!;
    state.turnPhase = 'action';

    // Elleri bilinen kaynaklarla ayarla
    state.hands['p1'] = ['brick', 'wood', 'wool']; // 3 kart
    state.hands['p2'] = ['ore', 'wheat', 'wheat']; // 3 kart
    state.resourceDeck = ['wool', 'brick', 'ore']; // Destenin en üstündeki kapalı kart: 'wool'

    // 1. Aktif oyuncu (p1) ticaret başlatır
    const initRes = initiateTrade(state, 'p1');
    expect(initRes.ok).toBe(true);
    state = initRes.state!;

    // 2. Aktif olmayan oyuncu (p2) 1:1 OLMAYAN serbest oranlı teklif sunar:
    // p2, 2 Buğday + 1 Demir (3 kart) verip karşılığında p1'den sadece 1 Tuğla (1 kart) istiyor!
    const offerRes = submitCounterOffer(
      state,
      'p2',
      ['wheat', 'wheat', 'ore'],
      ['brick']
    );
    expect(offerRes.ok).toBe(true);
    state = offerRes.state!;
    const offerId = state.activeTrade!.counterOffers[0].id;

    const deckLengthBefore = state.resourceDeck.length;

    // 3. Aktif oyuncu (p1) teklifi kabul eder
    const acceptRes = acceptTradeOffer(state, 'p1', offerId);
    expect(acceptRes.ok).toBe(true);
    expect(acceptRes.bonusCardDrawn).toBe('wool');
    state = acceptRes.state!;

    // p1: 1 brick verdi, 2 wheat + 1 ore aldı -> ['wood', 'wool', 'wheat', 'wheat', 'ore'] (5 kart)
    expect(state.hands['p1']).toEqual(['wood', 'wool', 'wheat', 'wheat', 'ore']);

    // p2: 3 kartının tamamını verdi, p1'den 1 'brick' aldı VE desteden otomatik +1 kapalı 'wool' ödülü çekti! -> ['brick', 'wool'] (2 kart)
    expect(state.hands['p2']).toEqual(['brick', 'wool']);
    expect(state.resourceDeck).toHaveLength(deckLengthBefore - 1);
    expect(state.hasTradedThisTurn).toBe(true);
    expect(state.activeTrade).toBeNull();

    // Aynı turda p1 ikinci kez ticaret başlatmaya çalışırsa reddedilir
    const secondTradeAttempt = initiateTrade(state, 'p1');
    expect(secondTradeAttempt.ok).toBe(false);
    expect(secondTradeAttempt.error).toContain('Tur başına en fazla 1 kez');
  });

  it('5. Tur süresi sayacı (Süresiz / 60sn / 90sn) dolduğunda sırayı otomatik olarak bir sonraki oyuncuya (production fazında) geçirir ve MultiplayerSyncManager üzerinden senkronize eder', () => {
    const manager = new MultiplayerSyncManager('TMR600', 'p1');
    let state = createAuthoritativeRoom(
      { playerId: 'p1', nickname: 'Oyuncu1' },
      { ...defaultSettings, turnTimeoutSeconds: 60 },
      'TMR600'
    ).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p2', nickname: 'Oyuncu2' }).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p3', nickname: 'Oyuncu3' }).state!;
    state = startAuthoritativeGame(state, 'p1').state!;
    state.turnPhase = 'action';

    const startMs = new Date(state.turnStartedAt).getTime();
    expect(getRemainingTurnSeconds(state, startMs + 20_000)).toBe(40);

    // 61 saniye geçtiğinde tur süresi dolar ve sıra p2'ye (index 1) ve 'production' fazına geçer!
    const timeoutRes = checkAndHandleTurnTimeout(state, startMs + 61_000);
    expect(timeoutRes.ok).toBe(true);
    expect(timeoutRes.state!.activePlayerIndex).toBe(1);
    expect(timeoutRes.state!.turnNumber).toBe(2);
    expect(timeoutRes.state!.turnPhase).toBe('production');

    manager.broadcastState(timeoutRes.state!);
    expect(manager.getClientView()?.activePlayerIndex).toBe(1);
    expect(manager.getClientView()?.turnPhase).toBe('production');
    manager.disconnect();
  });
});
