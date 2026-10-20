import { describe, expect, it } from 'vitest';
import {
  createBuildingDeck,
  createEventDeck,
  createResourceDeck,
  isAllSameBuildingType,
  refillCardMarket,
} from '../src/lib/engine/deck';
import {
  calculateVictoryPoints,
  createInitialGameState,
  endTurn,
  executeBuildStructure,
  executeHarborTrade,
  executePlayerTrade,
  executeProductionPhase,
  getHarborTradeRate,
  submitCharityGive,
  submitRobberDiscard,
  toClientGameView,
} from '../src/lib/engine/gameEngine';
import {
  clearMetropolisBEffect,
  createMetropolisDeck,
  registerMetropolisBEffect,
} from '../src/lib/engine/metropolisRegistry';
import {
  BuildingCardType,
  RoomSettings,
} from '../src/types/game';

const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 4,
  useFirstGamePreset: true,
  metropolisFaceMode: 'A',
  turnTimeoutSeconds: 60,
};

const FOUR_PLAYERS = [
  { playerId: 'p1', nickname: 'Oyuncu 1' },
  { playerId: 'p2', nickname: 'Oyuncu 2' },
  { playerId: 'p3', nickname: 'Oyuncu 3' },
  { playerId: 'p4', nickname: 'Oyuncu 4' },
];

const THREE_PLAYERS = [
  { playerId: 'p1', nickname: 'Oyuncu 1' },
  { playerId: 'p2', nickname: 'Oyuncu 2' },
  { playerId: 'p3', nickname: 'Oyuncu 3' },
];

describe('Catan Kart Oyunu - Oyun Motoru (120 Kart Kutu Kuralları)', () => {
  describe('1. 120 Kart Tam Dağılımı ve Kurulum (Setup Phase)', () => {
    it('61 Kaynak, 34 İnşaat, 4 Büyükşehir ve 7 Olay kartı sayılarını eksiksiz oluşturmalıdır', () => {
      const resources = createResourceDeck();
      expect(resources).toHaveLength(61);
      expect(resources.filter((r) => r === 'brick')).toHaveLength(11);
      expect(resources.filter((r) => r === 'wood')).toHaveLength(11);
      expect(resources.filter((r) => r === 'wool')).toHaveLength(14);
      expect(resources.filter((r) => r === 'wheat')).toHaveLength(12);
      expect(resources.filter((r) => r === 'ore')).toHaveLength(13);

      const buildings = createBuildingDeck();
      expect(buildings).toHaveLength(34);
      expect(buildings.filter((b) => b === 'road')).toHaveLength(10);
      expect(buildings.filter((b) => b === 'settlement')).toHaveLength(11);
      expect(buildings.filter((b) => b === 'city')).toHaveLength(5);
      expect(buildings.filter((b) => b === 'knight')).toHaveLength(8);

      const metropolis = createMetropolisDeck('A');
      expect(metropolis).toHaveLength(4);

      const events = createEventDeck();
      expect(events).toHaveLength(7);
      expect(events.filter((e) => e === 'robber')).toHaveLength(3);
      expect(events.filter((e) => e === 'charity')).toHaveLength(1);
      expect(events.filter((e) => e === 'harvest_festival')).toHaveLength(1);
      expect(events.filter((e) => e === 'incentive')).toHaveLength(1);
      expect(events.filter((e) => e === 'new_year')).toHaveLength(1);
    });

    it('3 ve 4 kişilik kurulumu doğru yapmalı, 2 veya 5 kişiyi reddetmelidir', () => {
      expect(() =>
        createInitialGameState({
          roomId: 'r1',
          roomCode: 'CATAN1',
          players: FOUR_PLAYERS.slice(0, 2),
          settings: DEFAULT_SETTINGS,
        })
      ).toThrow();

      const state3 = createInitialGameState({
        roomId: 'r3',
        roomCode: 'CATAN3',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      expect(state3.players).toHaveLength(3);
      // 61 - (3 * 2) = 55 kaynak destede kalmalı
      expect(state3.resourceDeck).toHaveLength(55);
      // Sadece 1 oyuncuda işaretli İlk Köy olmalı ve o oyuncu activePlayerIndex olmalı
      const markedPlayers = state3.players.filter(
        (p) => p.villageSlots[0].hasFirstPlayerMarker
      );
      expect(markedPlayers).toHaveLength(1);
      expect(state3.players[state3.activePlayerIndex].playerId).toBe(
        markedPlayers[0].playerId
      );

      // Her oyuncu 1 İlk Yol (roadsCount = 1), 1 İlk Köy (1 ZP) ve 2 kapalı kaynak ile başlamalı
      for (const p of state3.players) {
        expect(p.roadsCount).toBe(1);
        expect(p.knightsCount).toBe(0);
        expect(p.villageSlots).toHaveLength(1);
        expect(p.victoryPoints).toBe(1);
        expect(state3.hands[p.playerId]).toHaveLength(2);
      }

      // İlk Oyun Modu (useFirstGamePreset: true): 2 Köy, 1 Şövalye, 1 Yol, 1 Şehir
      expect(state3.cardMarket).toEqual([
        'settlement',
        'settlement',
        'knight',
        'road',
        'city',
      ]);
      expect(state3.buildingDeck).toHaveLength(29);
    });

    it('5 Aynı Kart Kuralı: Marketin 5 kartı da aynı türdeyse deste ile birleştirip yeniden 5 kart açmalıdır', () => {
      const currentMarket: BuildingCardType[] = [
        'road',
        'road',
        'road',
        'road',
      ];
      const deck: BuildingCardType[] = [
        'road', // 5. yol markete girdiğinde 5 aynı kart kuralı tetiklenmeli!
        'settlement',
        'city',
        'knight',
        'settlement',
        'city',
      ];

      const result = refillCardMarket(currentMarket, deck);
      expect(result.reshuffledFiveOfAKind).toBe(true);
      expect(result.cardMarket).toHaveLength(5);
      expect(isAllSameBuildingType(result.cardMarket)).toBe(false);
    });
  });

  describe('2. Aşama 1: Kaynak Üretimi (Şehir +1, Büyükşehir A +2, B +1 & Plug-and-Play)', () => {
    it('Saat yönünde herkese 1 kaynak, aktif oyuncuya görünür Şehir başına +1 ve Büyükşehir A başına +2 vermelidir', () => {
      let state = createInitialGameState({
        roomId: 'r1',
        roomCode: 'ABCD',
        players: FOUR_PLAYERS,
        settings: DEFAULT_SETTINGS,
      });

      const activeIdx = state.activePlayerIndex;
      const activePlayer = state.players[activeIdx];

      // Aktif oyuncuya 1 görünür Şehir ve 1 Büyükşehir (A yüzü) ekleyelim
      activePlayer.villageSlots = [
        {
          id: 'v1',
          isInitialSettlement: true,
          upgradedTo: 'city', // +1 kaynak
        },
        {
          id: 'v2',
          isInitialSettlement: false,
          upgradedTo: 'metropolis', // +2 kaynak (üzerine kapatıldığı Şehir artık görünür değildir!)
          metropolisCard: state.metropolisDeck[0],
        },
      ];

      state = executeProductionPhase(state, activePlayer.playerId);

      // Başlangıçta herkesin 2 kartı vardı:
      // Diğer oyuncular: 2 + 1 = 3 kart
      // Aktif oyuncu: 2 + 1 (temel) + 1 (Şehir) + 2 (Büyükşehir A) = 6 kart
      for (const p of state.players) {
        if (p.playerId === activePlayer.playerId) {
          expect(state.hands[p.playerId]).toHaveLength(6);
        } else {
          expect(state.hands[p.playerId]).toHaveLength(3);
        }
      }
      expect(state.turnPhase).toBe('action');
    });

    it('Büyükşehir B yüzü modunda +1 kaynak vermeli ve kayıtlı plug-and-play özel yeteneği tetiklemelidir', () => {
      let state = createInitialGameState({
        roomId: 'r_b',
        roomCode: 'BFACE',
        players: THREE_PLAYERS,
        settings: {
          ...DEFAULT_SETTINGS,
          maxPlayers: 3,
          metropolisFaceMode: 'B',
        },
      });

      let hookTriggered = false;
      registerMetropolisBEffect('metropolis_b_1', (currState, ownerId) => {
        hookTriggered = true;
        return {
          ...currState,
          hands: {
            ...currState.hands,
            [ownerId]: [...currState.hands[ownerId], 'ore'],
          },
        };
      });

      const activePlayer = state.players[state.activePlayerIndex];
      activePlayer.villageSlots[0] = {
        ...activePlayer.villageSlots[0],
        upgradedTo: 'metropolis',
        metropolisCard: state.metropolisDeck[0], // metropolis_b_1 (productionBonus = 1)
      };

      state = executeProductionPhase(state, activePlayer.playerId);

      expect(hookTriggered).toBe(true);
      // 2 (başlangıç) + 1 (temel) + 1 (B yüzü üretim) + 1 (B yüzü özel hook) = 5
      expect(state.hands[activePlayer.playerId]).toHaveLength(5);

      clearMetropolisBEffect('metropolis_b_1');
    });
  });

  describe('3. Aşama 2: Yol (Liman Etkisi) ve Oyuncu Takası', () => {
    it('Yol (Liman Etkisi): İlk Yol dahil 1 Yolda 4:1, 2 Yolda 3:1, 3 Yolda 2:1, 4+ Yolda 1:1 oranıyla istenen kaynağı seçip almalıdır', () => {
      expect(getHarborTradeRate(1)).toBe(4);
      expect(getHarborTradeRate(2)).toBe(3);
      expect(getHarborTradeRate(3)).toBe(2);
      expect(getHarborTradeRate(4)).toBe(1);
      expect(getHarborTradeRate(5)).toBe(1);

      let state = createInitialGameState({
        roomId: 'r_harbor',
        roomCode: 'HARB',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      const activePlayer = state.players[state.activePlayerIndex];
      state.turnPhase = 'action';
      // Oyuncunun 2 Yolu olsun (3:1 oranı) ve elinde 3 Tuğla olsun
      activePlayer.roadsCount = 2;
      state.hands[activePlayer.playerId] = ['brick', 'brick', 'brick'];
      // İstenen kaynak ('ore') destede değil ıskartada olsun ki ıskartadan karıştırıp çekmeyi de test edelim
      state.resourceDeck = ['wood', 'wool'];
      state.resourceDiscard = ['ore', 'wheat'];

      state = executeHarborTrade(
        state,
        activePlayer.playerId,
        'brick',
        'ore'
      );

      expect(state.hands[activePlayer.playerId]).toEqual(['ore']);
      expect(state.hasUsedHarborThisTurn).toBe(true);
      // Aynı turda ikinci kez liman kullanımını engellemeli
      expect(() =>
        executeHarborTrade(state, activePlayer.playerId, 'ore', 'wood')
      ).toThrow();
    });

    it('Oyuncu Takası: Serbest oranda takas yapmalı, turda 1 kez ile sınırlamalı ve diğer oyuncuya desteden +1 kapalı ödül kartı vermelidir', () => {
      let state = createInitialGameState({
        roomId: 'r_trade',
        roomCode: 'TRAD',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      state.turnPhase = 'action';
      const activePlayer = state.players[state.activePlayerIndex];
      const partnerPlayer =
        state.players[(state.activePlayerIndex + 1) % state.players.length];

      state.hands[activePlayer.playerId] = ['brick', 'wood'];
      state.hands[partnerPlayer.playerId] = ['wheat'];
      state.resourceDeck = ['ore', 'wool'];

      state = executePlayerTrade(state, {
        activePlayerId: activePlayer.playerId,
        partnerPlayerId: partnerPlayer.playerId,
        giveToPartner: ['brick', 'wood'], // 2'ye 1 serbest oran
        receiveFromPartner: ['wheat'],
      });

      // Aktif oyuncu 2 kart verdi, 1 kart aldı -> 1 kart ('wheat')
      expect(state.hands[activePlayer.playerId]).toEqual(['wheat']);
      // Partner oyuncu 1 kart verdi, 2 kart aldı + desteden 1 ödül kartı ('ore') çekildi -> 3 kart!
      expect(state.hands[partnerPlayer.playerId]).toEqual([
        'brick',
        'wood',
        'ore',
      ]);
      expect(state.hasTradedThisTurn).toBe(true);

      // Aynı turda ikinci kez takas yapılamaz
      expect(() =>
        executePlayerTrade(state, {
          activePlayerId: activePlayer.playerId,
          partnerPlayerId: partnerPlayer.playerId,
          giveToPartner: ['wheat'],
          receiveFromPartner: ['brick'],
        })
      ).toThrow();
    });
  });

  describe('4. Aşama 2: İnşaat, En Uzun Yol, En Güçlü Ordu ve Köy -> Olay Sıralaması', () => {
    it('En Uzun Yol (3+ Yol) ve En Güçlü Ordu (2+ Şövalye) kartlarını doğru vermeli ve sadece geçildiğinde el değiştirmelidir', () => {
      let state = createInitialGameState({
        roomId: 'r_build',
        roomCode: 'BULD',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      state.turnPhase = 'action';
      const pA = state.players[state.activePlayerIndex];
      // pA başlangıçta 1 İlk Yola sahip; 2 Yol daha yaparsa 3 Yola ulaşır ve En Uzun Yol'u alır
      pA.roadsCount = 2;
      pA.knightsCount = 1;
      state.cardMarket = ['road', 'knight', 'settlement', 'city', 'road'];
      state.hands[pA.playerId] = [
        'brick',
        'wood',
        'wool',
        'wheat',
        'ore',
      ];

      state = executeBuildStructure(state, pA.playerId, 'road');
      expect(state.players[state.activePlayerIndex].roadsCount).toBe(3);
      expect(state.players[state.activePlayerIndex].hasLongestRoad).toBe(true);

      state = executeBuildStructure(state, pA.playerId, 'knight');
      expect(state.players[state.activePlayerIndex].knightsCount).toBe(2);
      expect(state.players[state.activePlayerIndex].hasLargestArmy).toBe(true);
      // 1 İlk Köy (1) + En Uzun Yol (2) + En Güçlü Ordu (2) = 5 ZP
      expect(state.players[state.activePlayerIndex].victoryPoints).toBe(5);

      // Sıradaki oyuncu da 3 Yola ulaşırsa eşitlikte En Uzun Yol el DEĞİŞTİRMEMELİ, 4 Yola ulaşınca el değiştirmeli
      state = endTurn(state, pA.playerId);
      const pB = state.players[state.activePlayerIndex];
      state = executeProductionPhase(state, pB.playerId);

      state.players[state.activePlayerIndex].roadsCount = 2;
      state.cardMarket = ['road', 'road', 'settlement', 'city', 'knight'];
      state.hands[pB.playerId] = ['brick', 'wood', 'brick', 'wood'];

      // pB 3. yolunu yapar (Eşitlik: 3'e 3 -> el değiştirmez)
      state = executeBuildStructure(state, pB.playerId, 'road');
      expect(
        state.players.find((p) => p.playerId === pA.playerId)?.hasLongestRoad
      ).toBe(true);
      expect(
        state.players.find((p) => p.playerId === pB.playerId)?.hasLongestRoad
      ).toBe(false);

      // pB 4. yolunu yapar (4 > 3 -> En Uzun Yol pB'ye geçer!)
      state = executeBuildStructure(state, pB.playerId, 'road');
      expect(
        state.players.find((p) => p.playerId === pA.playerId)?.hasLongestRoad
      ).toBe(false);
      expect(
        state.players.find((p) => p.playerId === pB.playerId)?.hasLongestRoad
      ).toBe(true);
    });

    it('Şehir Köyün üzerine, Büyükşehir Şehrin üzerine kapatılmalı ve Büyükşehir alındığında market değişmemelidir', () => {
      let state = createInitialGameState({
        roomId: 'r_up',
        roomCode: 'UPGR',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      state.turnPhase = 'action';
      const activePlayer = state.players[state.activePlayerIndex];
      state.cardMarket = ['city', 'settlement', 'road', 'knight', 'road'];
      state.hands[activePlayer.playerId] = [
        'wheat',
        'wheat',
        'ore',
        'ore',
        'ore', // Şehir maliyeti
        'wool',
        'wool',
        'wool',
        'ore', // Büyükşehir maliyeti
      ];

      // Henüz Şehir yokken Büyükşehir yapılamaz
      expect(() =>
        executeBuildStructure(state, activePlayer.playerId, 'metropolis')
      ).toThrow();

      // Önce İlk Köyü Şehre yükselt (+1 ZP -> toplam 2 ZP)
      state = executeBuildStructure(state, activePlayer.playerId, 'city');
      expect(
        state.players[state.activePlayerIndex].villageSlots[0].upgradedTo
      ).toBe('city');
      expect(state.players[state.activePlayerIndex].victoryPoints).toBe(2);

      const marketBeforeMetropolis = [...state.cardMarket];
      // Şimdi Şehri Büyükşehre yükselt (+1 ZP -> toplam 3 ZP)
      state = executeBuildStructure(state, activePlayer.playerId, 'metropolis');
      expect(
        state.players[state.activePlayerIndex].villageSlots[0].upgradedTo
      ).toBe('metropolis');
      expect(state.players[state.activePlayerIndex].victoryPoints).toBe(3);
      expect(state.metropolisDeck).toHaveLength(3);
      // Market kartları değişmemiş olmalı!
      expect(state.cardMarket).toEqual(marketBeforeMetropolis);
    });

    it('KRİTİK KURAL: Köy alındığında market yenilenmeden ÖNCE Olay Kartı çekilmeli, market ANCAK olay tamamen çözümlendikten sonra 5 karta tamamlanmalıdır', () => {
      let state = createInitialGameState({
        roomId: 'r_ev_order',
        roomCode: 'EVNT',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      state.turnPhase = 'action';
      const activePlayer = state.players[state.activePlayerIndex];
      const otherPlayer =
        state.players[(state.activePlayerIndex + 1) % state.players.length];

      state.cardMarket = ['settlement', 'road', 'knight', 'city', 'road'];
      state.eventDeck = ['robber'];
      state.hands[activePlayer.playerId] = ['brick', 'wood', 'wool', 'wheat'];
      // otherPlayer'ın 0 Şövalyesi ve 9 kartı olsun (sınır 7 -> 9 > 7 olduğu için floor(9/2) = 4 kart atmalı)
      state.hands[otherPlayer.playerId] = [
        'brick',
        'brick',
        'wood',
        'wood',
        'wool',
        'wool',
        'wheat',
        'wheat',
        'ore',
      ];

      state = executeBuildStructure(state, activePlayer.playerId, 'settlement');

      // Olay henüz tamamlanmadı! Market 4 kartta kalmalı!
      expect(state.turnPhase).toBe('resolving_event');
      expect(state.cardMarket).toHaveLength(4);
      expect(state.pendingEvent?.eventType).toBe('robber');
      expect(
        state.pendingEvent?.pendingRobberDiscards?.[0].requiredDiscardCount
      ).toBe(4);

      // otherPlayer 4 kartını ıskartaya atınca olay tamamlanır ve market 5 karta tamamlanır!
      state = submitRobberDiscard(state, otherPlayer.playerId, [
        'brick',
        'brick',
        'wood',
        'wood',
      ]);

      expect(state.turnPhase).toBe('action');
      expect(state.pendingEvent).toBeNull();
      expect(state.cardMarket).toHaveLength(5);
      expect(state.hands[otherPlayer.playerId]).toHaveLength(5);
    });
  });

  describe('5. Olay Kartları (Hırsız Şövalye Koruması, Sadaka, Teşvik, Hasat Kutlamaları, Yeni Yıl)', () => {
    it('Hırsız: 7 + Şövalye sayısı sınırını aşmayan oyuncudan kart istememelidir', () => {
      let state = createInitialGameState({
        roomId: 'r_rob',
        roomCode: 'ROBB',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      state.turnPhase = 'action';
      const activePlayer = state.players[state.activePlayerIndex];
      const knightPlayer =
        state.players[(state.activePlayerIndex + 1) % state.players.length];

      // knightPlayer'ın 2 Şövalyesi olsun -> el sınırı 7 + 2 = 9! Elinde 9 kart varken Hırsızdan etkilenmemeli!
      knightPlayer.knightsCount = 2;
      state.hands[knightPlayer.playerId] = Array(9).fill('wool');
      state.hands[activePlayer.playerId] = ['brick', 'wood', 'wool', 'wheat'];
      state.eventDeck = ['robber'];

      state = executeBuildStructure(state, activePlayer.playerId, 'settlement');

      expect(state.turnPhase).toBe('action');
      expect(state.pendingEvent).toBeNull();
      expect(state.hands[knightPlayer.playerId]).toHaveLength(9);
      expect(state.cardMarket).toHaveLength(5);
    });

    it('Sadaka: En yüksek ZP sahibi oyuncu daha düşük ZP sahibi bir oyuncuya 1 kaynak vermelidir', () => {
      let state = createInitialGameState({
        roomId: 'r_char',
        roomCode: 'CHAR',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      state.turnPhase = 'action';
      const activePlayer = state.players[state.activePlayerIndex];
      const lowVpPlayer =
        state.players[(state.activePlayerIndex + 1) % state.players.length];

      // activePlayer Köy inşa ettiğinde 2 ZP olacak, diğerleri 1 ZP'de. Elinde fazladan 1 'ore' kalsın.
      state.hands[activePlayer.playerId] = [
        'brick',
        'wood',
        'wool',
        'wheat',
        'ore',
      ];
      state.hands[lowVpPlayer.playerId] = [];
      state.eventDeck = ['charity'];

      state = executeBuildStructure(state, activePlayer.playerId, 'settlement');

      expect(state.turnPhase).toBe('resolving_event');
      expect(state.cardMarket).toHaveLength(4);
      expect(state.pendingEvent?.eventType).toBe('charity');

      state = submitCharityGive(
        state,
        activePlayer.playerId,
        lowVpPlayer.playerId,
        'ore'
      );

      expect(state.turnPhase).toBe('action');
      expect(state.cardMarket).toHaveLength(5);
      expect(state.hands[activePlayer.playerId]).toHaveLength(0);
      expect(state.hands[lowVpPlayer.playerId]).toEqual(['ore']);
    });

    it('Teşvik, Hasat Kutlamaları ve Yeni Yıl olaylarını kurallara %100 uygun çözümlemelidir', () => {
      let state = createInitialGameState({
        roomId: 'r_events',
        roomCode: 'EVS3',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      state.turnPhase = 'action';
      const p0 = state.players[state.activePlayerIndex];
      const p1 = state.players[(state.activePlayerIndex + 1) % 3];
      const p2 = state.players[(state.activePlayerIndex + 2) % 3];

      // p1 En Uzun Yol'a sahip olsun; p0 ve p2'de hiçbir özel kart yok
      p1.hasLongestRoad = true;
      state.hands[p0.playerId] = ['brick', 'wood', 'wool', 'wheat'];
      state.hands[p1.playerId] = [];
      state.hands[p2.playerId] = [];
      state.eventDeck = ['incentive', 'harvest_festival', 'new_year'];

      // 1) Teşvik: p0 ve p2 2'şer kart almalı, p1 (En Uzun Yol sahibi) 0 kart almalı
      state = executeBuildStructure(state, p0.playerId, 'settlement');
      expect(state.hands[p0.playerId]).toHaveLength(2);
      expect(state.hands[p1.playerId]).toHaveLength(0);
      expect(state.hands[p2.playerId]).toHaveLength(2);

      // 2) Hasat Kutlamaları: p0'ın 2 görünür Köyü var (+2 kart), p1'in Köyünü Şehre çevirelim (0 görünür Köy -> +0 kart), p2'nin 1 görünür Köyü var (+1 kart)
      state.players[(state.activePlayerIndex + 1) % 3].villageSlots[0].upgradedTo =
        'city';
      state.hands[p0.playerId] = ['brick', 'wood', 'wool', 'wheat'];
      state.hands[p1.playerId] = [];
      state.hands[p2.playerId] = [];
      state.cardMarket = ['settlement', 'road', 'road', 'knight', 'city'];

      state = executeBuildStructure(state, p0.playerId, 'settlement');
      // p0 yeni köyüyle birlikte 3 görünür Köye ulaştı -> 3 kart çeker!
      expect(state.hands[p0.playerId]).toHaveLength(3);
      // p1'in sadece Şehri var, görünür Köyü yok -> 0 kart çeker!
      expect(state.hands[p1.playerId]).toHaveLength(0);
      // p2'nin 1 görünür Köyü var -> 1 kart çeker!
      expect(state.hands[p2.playerId]).toHaveLength(1);

      // 3) Yeni Yıl: Herkes 1 kaynak çeker ve tüm olay kartları (ıskarta dahil) yeniden karıştırılır
      state.hands[p0.playerId] = ['brick', 'wood', 'wool', 'wheat'];
      state.cardMarket = ['settlement', 'road', 'road', 'knight', 'city'];

      state = executeBuildStructure(state, p0.playerId, 'settlement');
      expect(state.hands[p0.playerId]).toHaveLength(1);
      expect(state.hands[p1.playerId]).toHaveLength(1);
      expect(state.hands[p2.playerId]).toHaveLength(2);
      expect(state.eventDiscard).toHaveLength(0);
      expect(state.eventDeck).toHaveLength(3);
    });
  });

  describe('6. Zafer Koşulu (7 ZP) ve Hile Koruması (toClientGameView)', () => {
    it('Sıra kendisindeyken 7 Zafer Puanına ulaşan oyuncu derhal oyunu kazanmalıdır', () => {
      let state = createInitialGameState({
        roomId: 'r_win',
        roomCode: 'WIN7',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      state.turnPhase = 'action';
      const activePlayer = state.players[state.activePlayerIndex];

      // Aktif oyuncuya 6 ZP verelim: 1 Büyükşehir (3 ZP) + 1 Şehir (2 ZP) + 1 Köy (1 ZP) = 6 ZP
      activePlayer.villageSlots = [
        { id: 'v1', isInitialSettlement: true, upgradedTo: 'metropolis' },
        { id: 'v2', isInitialSettlement: false, upgradedTo: 'city' },
        { id: 'v3', isInitialSettlement: false, upgradedTo: 'none' },
      ];
      expect(calculateVictoryPoints(activePlayer)).toBe(6);

      // Köyü Şehre yükselttiğinde 7 ZP'ye ulaşır ve oyunu kazanır!
      state.cardMarket = ['city', 'road', 'road', 'knight', 'settlement'];
      state.hands[activePlayer.playerId] = [
        'wheat',
        'wheat',
        'ore',
        'ore',
        'ore',
      ];

      state = executeBuildStructure(state, activePlayer.playerId, 'city');

      expect(state.players[state.activePlayerIndex].victoryPoints).toBe(7);
      expect(state.status).toBe('finished');
      expect(state.turnPhase).toBe('game_over');
      expect(state.winnerPlayerId).toBe(activePlayer.playerId);
    });

    it('toClientGameView rakip ellerindeki kart türlerini gizlemeli, sadece izleyen oyuncunun elini göstermelidir', () => {
      const state = createInitialGameState({
        roomId: 'r_sec',
        roomCode: 'SECR',
        players: THREE_PLAYERS,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 3 },
      });

      const viewForP1 = toClientGameView(state, 'p1');
      expect(viewForP1.myPlayerId).toBe('p1');
      expect(viewForP1.myHand).toEqual(state.hands['p1']);
      expect((viewForP1 as unknown as Record<string, unknown>).hands).toBeUndefined();
      expect(
        viewForP1.players.find((p) => p.playerId === 'p2')?.handCount
      ).toBe(2);
    });
  });
});
