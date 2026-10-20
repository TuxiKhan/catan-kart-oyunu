import { describe, expect, it } from 'vitest';
import {
  AuthoritativeGameState,
  BUILDING_COSTS,
  BuildingCardType,
  EventCardType,
  INITIAL_BUILDING_DECK_COUNTS,
  INITIAL_EVENT_DECK_COUNTS,
  INITIAL_RESOURCE_COUNTS,
  ResourceType,
  RoomSettings,
} from '../src/types/game';
import {
  createBuildingDeck,
  createEventDeck,
  createResourceDeck,
  drawSpecificResourceFromSupply,
  isAllSameBuildingType,
  refillCardMarket,
  setupInitialCardMarket,
} from '../src/lib/engine/deck';
import {
  createMetropolisDeck,
  registerMetropolisBEffect,
  clearMetropolisBEffect,
} from '../src/lib/engine/metropolisRegistry';
import {
  calculateVictoryPoints,
  createInitialGameState,
  endTurn,
  executeBuildStructure,
  executeHarborTrade,
  executePlayerTrade,
  executeProductionPhase,
  getHarborTradeRate,
  resolveSpecificEventCard,
  submitCharityGive,
  submitRobberDiscard,
  toClientGameView,
} from '../src/lib/engine/gameEngine';
import {
  acceptTradeOffer,
  checkAndHandleTurnTimeout,
  clearMemoryRoomStore,
  createAuthoritativeRoom,
  initiateTrade,
  joinAuthoritativeRoom,
  startAuthoritativeGame,
  submitCounterOffer,
} from '../src/lib/multiplayer/syncManager';

const DEFAULT_SETTINGS_3P: RoomSettings = {
  maxPlayers: 3,
  useFirstGamePreset: true,
  metropolisFaceMode: 'A',
  turnTimeoutSeconds: 60,
};

const DEFAULT_SETTINGS_4P: RoomSettings = {
  maxPlayers: 4,
  useFirstGamePreset: false,
  metropolisFaceMode: 'A',
  turnTimeoutSeconds: 0,
};

const PLAYERS_3 = [
  { playerId: 'p1', nickname: 'Oyuncu 1' },
  { playerId: 'p2', nickname: 'Oyuncu 2' },
  { playerId: 'p3', nickname: 'Oyuncu 3' },
];

const PLAYERS_4 = [
  { playerId: 'p1', nickname: 'Oyuncu 1' },
  { playerId: 'p2', nickname: 'Oyuncu 2' },
  { playerId: 'p3', nickname: 'Oyuncu 3' },
  { playerId: 'p4', nickname: 'Oyuncu 4' },
];

describe('CATAN KART OYUNU (120 Kart) - Kapsamlı Kural Kitapçığı Denetimi ve E2E Testleri', () => {
  describe('1. 120 Kart Sayımı ve Deste Bütünlüğü Denetimi', () => {
    it('Kaynak destesi tam olarak 61 karttan oluşmalı (11 Tuğla, 11 Odun, 14 Yün, 12 Buğday, 13 Demir)', () => {
      const resourceDeck = createResourceDeck();
      expect(resourceDeck).toHaveLength(61);

      const counts: Record<ResourceType, number> = {
        brick: 0,
        wood: 0,
        wool: 0,
        wheat: 0,
        ore: 0,
      };
      for (const card of resourceDeck) {
        counts[card]++;
      }

      expect(counts.brick).toBe(11);
      expect(counts.wood).toBe(11);
      expect(counts.wool).toBe(14);
      expect(counts.wheat).toBe(12);
      expect(counts.ore).toBe(13);
      expect(counts).toEqual(INITIAL_RESOURCE_COUNTS);
    });

    it('İnşaat destesi tam olarak 34 karttan oluşmalı (10 Yol, 11 Köy, 5 Şehir, 8 Şövalye)', () => {
      const buildingDeck = createBuildingDeck();
      expect(buildingDeck).toHaveLength(34);

      const counts: Record<BuildingCardType, number> = {
        road: 0,
        settlement: 0,
        city: 0,
        knight: 0,
      };
      for (const card of buildingDeck) {
        counts[card]++;
      }

      expect(counts.road).toBe(10);
      expect(counts.settlement).toBe(11);
      expect(counts.city).toBe(5);
      expect(counts.knight).toBe(8);
      expect(counts).toEqual(INITIAL_BUILDING_DECK_COUNTS);
    });

    it('Büyükşehir destesi 4 adet karttan oluşmalı (A ve B yüzü modlarını desteklemeli)', () => {
      const metroA = createMetropolisDeck('A');
      expect(metroA).toHaveLength(4);
      expect(metroA.every((c) => c.face === 'A' && c.productionBonus === 2)).toBe(true);

      const metroB = createMetropolisDeck('B');
      expect(metroB).toHaveLength(4);
      expect(metroB.every((c) => c.face === 'B' && c.productionBonus === 1 && Boolean(c.bVariantId))).toBe(true);
    });

    it('Olay destesi tam olarak 7 karttan oluşmalı (3 Hırsız, 1 Sadaka, 1 Hasat Kutlamaları, 1 Teşvik, 1 Yeni Yıl)', () => {
      const eventDeck = createEventDeck();
      expect(eventDeck).toHaveLength(7);

      const counts: Record<EventCardType, number> = {
        robber: 0,
        charity: 0,
        harvest_festival: 0,
        incentive: 0,
        new_year: 0,
      };
      for (const card of eventDeck) {
        counts[card]++;
      }

      expect(counts.robber).toBe(3);
      expect(counts.charity).toBe(1);
      expect(counts.harvest_festival).toBe(1);
      expect(counts.incentive).toBe(1);
      expect(counts.new_year).toBe(1);
      expect(counts).toEqual(INITIAL_EVENT_DECK_COUNTS);
    });

    it('Kutu içeriğindeki tüm kartların genel toplamı tam olarak 120 olmalı', () => {
      const resourceCardsCount = createResourceDeck().length; // 61
      const initialCardsCount = 4 + 4; // 4 İlk Yol + 4 İlk Köy = 8
      const buildingCardsCount = createBuildingDeck().length; // 34
      const metropolisCardsCount = createMetropolisDeck('A').length; // 4
      const eventCardsCount = createEventDeck().length; // 7
      const ruleSummaryAndSpecialCardsCount = 4 + 2; // 4 Kural Özeti (Maliyet) + 2 Özel Puan (En Uzun Yol, En Güçlü Ordu) = 6

      const totalBoxCards =
        resourceCardsCount +
        initialCardsCount +
        buildingCardsCount +
        metropolisCardsCount +
        eventCardsCount +
        ruleSummaryAndSpecialCardsCount;

      expect(totalBoxCards).toBe(120);
    });
  });

  describe('2. Kurulum (3 ve 4 Kişilik Farklar, İlk Oyun Modu, 5 Aynı Kart Kuralı)', () => {
    it('Sadece 3 veya 4 oyuncu ile kurulabilmeli; 2 veya 5 oyuncu hata fırlatmalı', () => {
      expect(() =>
        createInitialGameState({
          roomId: 'r1',
          roomCode: 'CATAN1',
          players: PLAYERS_3.slice(0, 2),
          settings: DEFAULT_SETTINGS_3P,
        })
      ).toThrow();

      expect(() =>
        createInitialGameState({
          roomId: 'r1',
          roomCode: 'CATAN1',
          players: [...PLAYERS_4, { playerId: 'p5', nickname: 'Oyuncu 5' }],
          settings: DEFAULT_SETTINGS_4P,
        })
      ).toThrow();
    });

    it('3 kişilik kurulumda: yazısız İlk Köy kartlarından 1 tanesi çıkarılmalı, 1 oyuncu İlk Oyuncu işaretini almalı, herkes 2 kaynak + 1 İlk Köy (1 ZP) + 1 İlk Yol ile başlamalı', () => {
      const state = createInitialGameState({
        roomId: 'room_3p',
        roomCode: 'CAT3P',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });

      expect(state.players).toHaveLength(3);
      expect(state.resourceDeck).toHaveLength(61 - 3 * 2); // 55

      let markerCount = 0;
      state.players.forEach((p, idx) => {
        expect(state.hands[p.playerId]).toHaveLength(2);
        expect(p.handCount).toBe(2);
        expect(p.roadsCount).toBe(1);
        expect(p.knightsCount).toBe(0);
        expect(p.victoryPoints).toBe(1);
        expect(p.villageSlots).toHaveLength(1);
        expect(p.villageSlots[0].isInitialSettlement).toBe(true);
        expect(p.villageSlots[0].upgradedTo).toBe('none');
        if (p.villageSlots[0].hasFirstPlayerMarker) {
          markerCount++;
          expect(state.activePlayerIndex).toBe(idx);
        }
      });

      // 3 kişide 1 işaretli, 2 yazısız İlk Köy dağıtılır (1 yazısız kutuda kalır)
      expect(markerCount).toBe(1);
    });

    it('4 kişilik kurulumda: 4 İlk Köy de dağıtılmalı, herkes 2 kaynak + 1 İlk Köy + 1 İlk Yol ile başlamalı', () => {
      const state = createInitialGameState({
        roomId: 'room_4p',
        roomCode: 'CAT4P',
        players: PLAYERS_4,
        settings: DEFAULT_SETTINGS_4P,
      });

      expect(state.players).toHaveLength(4);
      expect(state.resourceDeck).toHaveLength(61 - 4 * 2); // 53

      const markers = state.players.filter(
        (p) => p.villageSlots[0].hasFirstPlayerMarker
      );
      expect(markers).toHaveLength(1);
      expect(state.players[state.activePlayerIndex].playerId).toBe(
        markers[0].playerId
      );
    });

    it('İlk Oyun Modu (useFirstGamePreset = true) seçildiğinde markette tam olarak 2 Köy, 1 Şövalye, 1 Yol, 1 Şehir yer almalı', () => {
      const rawDeck = createBuildingDeck();
      const setup = setupInitialCardMarket(rawDeck, true);

      expect(setup.cardMarket).toHaveLength(5);
      expect(setup.buildingDeck).toHaveLength(29);

      const marketCounts: Record<BuildingCardType, number> = {
        road: 0,
        settlement: 0,
        city: 0,
        knight: 0,
      };
      for (const c of setup.cardMarket) {
        marketCounts[c]++;
      }

      expect(marketCounts.settlement).toBe(2);
      expect(marketCounts.knight).toBe(1);
      expect(marketCounts.road).toBe(1);
      expect(marketCounts.city).toBe(1);
    });

    it('5 Aynı Kart Kuralı: Marketteki 5 inşaat kartı aynı tür geldiğinde market sıfırlanıp desteyle karıştırılmalı ve yeniden 5 kart açılmalı', () => {
      // İlk 5 kartın 5'i de 'road' olan bir deste hazırlayalım
      const riggedDeck: BuildingCardType[] = [
        'road',
        'road',
        'road',
        'road',
        'road',
        'settlement',
        'city',
        'knight',
        'settlement',
        'city',
      ];

      expect(isAllSameBuildingType(riggedDeck.slice(0, 5))).toBe(true);

      const refilled = refillCardMarket([], riggedDeck);
      expect(refilled.reshuffledFiveOfAKind).toBe(true);
      expect(refilled.cardMarket).toHaveLength(5);
      expect(isAllSameBuildingType(refilled.cardMarket)).toBe(false);
      expect(refilled.cardMarket.length + refilled.buildingDeck.length).toBe(
        riggedDeck.length
      );
    });
  });

  describe('3. Kaynak Üretimi, Liman Etkisi (Yol) ve Ticaret (+1 Kart Ödülü)', () => {
    it('Üretim Aşaması: Herkes saat yönünde 1 kaynak çekmeli; aktif oyuncu her görünür Şehir için +1, her Büyükşehir (A yüzü) için +2 ek kaynak çekmeli (kapanmış Köyler ekstra üretmemeli)', () => {
      let state = createInitialGameState({
        roomId: 'prod_room',
        roomCode: 'PROD1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });

      const activeIdx = state.activePlayerIndex;
      const activePlayer = state.players[activeIdx];
      const otherPlayer = state.players[(activeIdx + 1) % 3];

      // Aktif oyuncuya 1 görünür Köy (bonus 0), 1 görünür Şehir (bonus +1) ve 1 Büyükşehir A yüzü (bonus +2) verelim
      // Diğer oyuncuya da 1 Şehir verelim (aktif olmadığı için diğer oyuncuya Şehir bonusu verilmemeli!)
      activePlayer.villageSlots = [
        { id: 'v1', isInitialSettlement: true, upgradedTo: 'none' },
        { id: 'v2', isInitialSettlement: false, upgradedTo: 'city' },
        {
          id: 'v3',
          isInitialSettlement: false,
          upgradedTo: 'metropolis',
          metropolisCard: {
            id: 'metro_1',
            face: 'A',
            titleTr: 'Büyükşehir (A)',
            descriptionTr: '+2 Kaynak',
            productionBonus: 2,
          },
        },
      ];
      otherPlayer.villageSlots = [
        { id: 'ov1', isInitialSettlement: true, upgradedTo: 'city' },
      ];

      const beforeActiveHand = state.hands[activePlayer.playerId].length;
      const beforeOtherHand = state.hands[otherPlayer.playerId].length;

      state = executeProductionPhase(state, activePlayer.playerId);

      expect(state.turnPhase).toBe('action');
      // Aktif oyuncu: 1 (temel) + 1 (Şehir) + 2 (Büyükşehir A) = +4 kaynak
      expect(state.hands[activePlayer.playerId]).toHaveLength(
        beforeActiveHand + 4
      );
      // Aktif olmayan oyuncu: sadece +1 temel kaynak alır (kendi Şehri diğer oyuncunun turunda üretmez!)
      expect(state.hands[otherPlayer.playerId]).toHaveLength(
        beforeOtherHand + 1
      );
    });

    it('Büyükşehir B yüzü plug-and-play kancası üretimde +1 kaynak ve kayıtlı özel yeteneği tetiklemeli', () => {
      let state = createInitialGameState({
        roomId: 'metro_b_room',
        roomCode: 'METROB',
        players: PLAYERS_3,
        settings: { ...DEFAULT_SETTINGS_3P, metropolisFaceMode: 'B' },
      });

      let hookCalled = false;
      registerMetropolisBEffect('metropolis_b_1', (st, ownerId) => {
        hookCalled = true;
        return {
          ...st,
          hands: {
            ...st.hands,
            [ownerId]: [...st.hands[ownerId], 'ore'],
          },
        };
      });

      const activePlayer = state.players[state.activePlayerIndex];
      activePlayer.villageSlots = [
        {
          id: 'v1',
          isInitialSettlement: true,
          upgradedTo: 'metropolis',
          metropolisCard: state.metropolisDeck[0], // metropolis_b_1 (productionBonus: 1)
        },
      ];

      const beforeHand = state.hands[activePlayer.playerId].length;
      state = executeProductionPhase(state, activePlayer.playerId);

      expect(hookCalled).toBe(true);
      // 1 (temel) + 1 (B yüzü üretim bonusu) + 1 (özel hook 'ore') = +3
      expect(state.hands[activePlayer.playerId]).toHaveLength(beforeHand + 3);

      clearMetropolisBEffect('metropolis_b_1');
    });

    it('Liman Etkisi (Yol): İlk Yol dahil oranlar (1->4:1, 2->3:1, 3->2:1, 4+->1:1) doğru çalışmalı, oyuncu istediği kaynak TÜRÜNÜ seçebilmeli ve turda max 1 kez kullanabilmeli', () => {
      expect(getHarborTradeRate(1)).toBe(4);
      expect(getHarborTradeRate(2)).toBe(3);
      expect(getHarborTradeRate(3)).toBe(2);
      expect(getHarborTradeRate(4)).toBe(1);
      expect(getHarborTradeRate(5)).toBe(1);

      let state = createInitialGameState({
        roomId: 'harbor_room',
        roomCode: 'HARB1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const activePlayer = state.players[state.activePlayerIndex];
      // Oyuncunun 2 Yolu olsun (3:1 oran) ve elinde 3 Tuğla olsun
      activePlayer.roadsCount = 2;
      state.hands[activePlayer.playerId] = ['brick', 'brick', 'brick'];
      state.resourceDeck = ['wood', 'wool', 'ore', 'wheat'];

      // 3 Tuğla verip özellikle 'ore' (Demir) istesin (destenin en üstünde 'wood' olmasına rağmen 'ore' alabilmeli!)
      state = executeHarborTrade(
        state,
        activePlayer.playerId,
        'brick',
        'ore'
      );

      expect(state.hands[activePlayer.playerId]).toEqual(['ore']);
      expect(state.hasUsedHarborThisTurn).toBe(true);
      expect(state.resourceDiscard).toContain('brick');

      // Aynı turda ikinci kez Liman etkisi kullanmaya çalışırsa hata vermeli
      state.hands[activePlayer.playerId] = ['wool', 'wool', 'wool'];
      expect(() =>
        executeHarborTrade(state, activePlayer.playerId, 'wool', 'wheat')
      ).toThrow(/zaten kullandınız/);
    });

    it('Liman Etkisi: İstenen kaynak destede kalmamışsa ıskarta yığını karıştırılıp oradan bulunmalı', () => {
      const res = drawSpecificResourceFromSupply(
        ['brick', 'wood'],
        ['ore', 'wheat'],
        'ore'
      );
      expect(res.drawn).toBe('ore');
      expect(res.resourceDiscard).toHaveLength(0);
      expect(res.resourceDeck).toContain('wheat');
    });

    it('Oyuncu Takası: Aktif oyuncu turda 1 kez serbest oranda takas yapabilmeli ve takas yapılan diğer oyuncuya desteden +1 kapalı kaynak kartı ödül verilmeli', () => {
      let state = createInitialGameState({
        roomId: 'trade_room',
        roomCode: 'TRAD1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const activePlayer = state.players[state.activePlayerIndex];
      const partnerPlayer = state.players[(state.activePlayerIndex + 1) % 3];

      state.hands[activePlayer.playerId] = ['brick', 'wood'];
      state.hands[partnerPlayer.playerId] = ['ore'];
      state.resourceDeck = ['wheat', 'wool']; // Ödül olarak en üstteki 'wheat' çekilecek

      // Serbest oran: Aktif oyuncu 2 kaynak ('brick', 'wood') verip partnerden 1 kaynak ('ore') alıyor
      state = executePlayerTrade(state, {
        activePlayerId: activePlayer.playerId,
        partnerPlayerId: partnerPlayer.playerId,
        giveToPartner: ['brick', 'wood'],
        receiveFromPartner: ['ore'],
      });

      expect(state.hasTradedThisTurn).toBe(true);
      expect(state.hands[activePlayer.playerId]).toEqual(['ore']);
      // Partner oyuncu: 'ore' verdi, 'brick' + 'wood' aldı VE desteden +1 ödül ('wheat') kazandı = 3 kart!
      expect(state.hands[partnerPlayer.playerId]).toEqual([
        'brick',
        'wood',
        'wheat',
      ]);

      // Aynı turda 2. kez takas denemesi engellenmeli
      expect(() =>
        executePlayerTrade(state, {
          activePlayerId: activePlayer.playerId,
          partnerPlayerId: partnerPlayer.playerId,
          giveToPartner: ['ore'],
          receiveFromPartner: ['brick'],
        })
      ).toThrow(/zaten kullandınız/);
    });
  });

  describe('4. İnşaat Kuralları, Özel Puan Kartları ve Olay Kartları Sıralaması', () => {
    it('Yol ve Şövalye inşası: En Uzun Yol (ilk 3 Yol, İlk Yol dahil) ve En Güçlü Ordu (ilk 2 Şövalye) +2 ZP vermeli, rekor kırılınca el değiştirmeli (eşitlikte el değiştirmemeli)', () => {
      let state = createInitialGameState({
        roomId: 'special_vp_room',
        roomCode: 'SPVP1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const pActive = state.players[state.activePlayerIndex];
      const pOther = state.players[(state.activePlayerIndex + 1) % 3];

      // pOther'da halihazırda 3 Yol (En Uzun Yol sahibi) ve 2 Şövalye (En Güçlü Ordu sahibi) olsun
      pOther.roadsCount = 3;
      pOther.hasLongestRoad = true;
      pOther.knightsCount = 2;
      pOther.hasLargestArmy = true;

      // pActive 2 Yola sahip olsun ve 1 Yol daha inşa ederek 3 Yola ulaşsın -> Eşitlikte En Uzun Yol pOther'da kalmalı!
      pActive.roadsCount = 2;
      state.cardMarket = ['road', 'road', 'knight', 'knight', 'city'];
      state.buildingDeck = ['settlement', 'settlement', 'road', 'knight'];
      state.hands[pActive.playerId] = [
        'brick',
        'wood',
        'brick',
        'wood',
        'wool',
        'wheat',
        'ore',
      ];

      state = executeBuildStructure(state, pActive.playerId, 'road');
      expect(state.players[state.activePlayerIndex].roadsCount).toBe(3);
      expect(state.players[state.activePlayerIndex].hasLongestRoad).toBe(false);
      expect(
        state.players[(state.activePlayerIndex + 1) % 3].hasLongestRoad
      ).toBe(true);

      // pActive 1 Yol daha inşa edip 4 Yola ulaşınca En Uzun Yol pActive'e geçmeli!
      state = executeBuildStructure(state, pActive.playerId, 'road');
      expect(state.players[state.activePlayerIndex].roadsCount).toBe(4);
      expect(state.players[state.activePlayerIndex].hasLongestRoad).toBe(true);
      expect(
        state.players[(state.activePlayerIndex + 1) % 3].hasLongestRoad
      ).toBe(false);
    });

    it('Şehir ve Büyükşehir inşası: Şehir sadece Köy üzerine, Büyükşehir sadece Şehir üzerine kapatılabilmeli; Büyükşehir marketten değil kendi destesinden alınmalı', () => {
      let state = createInitialGameState({
        roomId: 'upgrade_room',
        roomCode: 'UPGR1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const pActive = state.players[state.activePlayerIndex];

      // Henüz Şehir yokken Büyükşehir inşa etmeye çalışmak hata vermeli
      state.hands[pActive.playerId] = [
        'wool',
        'wool',
        'wool',
        'ore',
        'wheat',
        'wheat',
        'ore',
        'ore',
        'ore',
      ];
      expect(() =>
        executeBuildStructure(state, pActive.playerId, 'metropolis')
      ).toThrow(/görünür bir Şehir/);

      // Önce İlk Köyü Şehre yükseltelim (2 Buğday + 3 Demir) -> 2 ZP
      state = executeBuildStructure(state, pActive.playerId, 'city');
      expect(
        state.players[state.activePlayerIndex].villageSlots[0].upgradedTo
      ).toBe('city');
      expect(state.players[state.activePlayerIndex].victoryPoints).toBe(2);

      // Şimdi Şehri Büyükşehre yükseltelim (3 Yün + 1 Demir) -> 3 ZP
      const marketBeforeMetro = [...state.cardMarket];
      state = executeBuildStructure(state, pActive.playerId, 'metropolis');
      expect(
        state.players[state.activePlayerIndex].villageSlots[0].upgradedTo
      ).toBe('metropolis');
      expect(state.players[state.activePlayerIndex].victoryPoints).toBe(3);
      expect(state.metropolisDeck).toHaveLength(3);
      // Market değişmemiş olmalı
      expect(state.cardMarket).toEqual(marketBeforeMetro);
    });

    it('KRİTİK KURAL: Köy inşa edildiğinde market yenilenmeden ÖNCE 1 Olay kartı çekilmeli; interaktif olay (Hırsız/Sadaka) bitene kadar market 4 kartta kalmalı, olay bitince 5 karta tamamlanmalı!', () => {
      let state = createInitialGameState({
        roomId: 'settlement_event_order',
        roomCode: 'SETEV',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const pActive = state.players[state.activePlayerIndex];
      const pVictim = state.players[(state.activePlayerIndex + 1) % 3];

      // Olay destesinin en üstüne 'robber' (Hırsız) koyalım
      state.eventDeck = ['robber', 'incentive'];
      // pVictim'in 0 şövalyesi ve 8 kaynağı olsun (limit 7 olduğu için 4 kart atması gerekecek)
      pVictim.knightsCount = 0;
      state.hands[pVictim.playerId] = [
        'brick',
        'brick',
        'wood',
        'wood',
        'wool',
        'wool',
        'wheat',
        'ore',
      ];

      // pActive'e Köy maliyeti verelim (1 Tuğla, 1 Odun, 1 Yün, 1 Buğday)
      state.hands[pActive.playerId] = ['brick', 'wood', 'wool', 'wheat'];

      // Köy inşa et!
      state = executeBuildStructure(state, pActive.playerId, 'settlement');

      // 1. Olay ('robber') tetiklendi ve henüz çözülmediği için turnPhase === 'resolving_event' olmalı
      expect(state.turnPhase).toBe('resolving_event');
      expect(state.pendingEvent?.eventType).toBe('robber');
      expect(state.pendingEvent?.pendingMarketRefillAfterEvent).toBe(true);

      // 2. Market henüz yenilenmemiş olmalı (5'ten 1 Köy alındı, 4 kart kaldı!)
      expect(state.cardMarket).toHaveLength(4);

      // 3. pVictim 4 kaynağını ıskartaya atsın
      state = submitRobberDiscard(state, pVictim.playerId, [
        'brick',
        'brick',
        'wood',
        'wood',
      ]);

      // 4. Olay çözümlendiği AN market 5 karta tamamlanmalı ve aşama 'action'a dönmeli!
      expect(state.turnPhase).toBe('action');
      expect(state.pendingEvent).toBeNull();
      expect(state.cardMarket).toHaveLength(5);
      expect(state.hands[pVictim.playerId]).toHaveLength(4);
    });

    it('Olay Kartı - Hırsız (Robber): Güvenli el limiti 7 + Şövalye Sayısı olmalı; aşanlar floor(n/2) kart seçerek atmalı', () => {
      let state = createInitialGameState({
        roomId: 'robber_room',
        roomCode: 'ROBB1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const [p1, p2, p3] = state.players;
      // p1: 2 Şövalye, 9 kart -> Limit 7+2=9 (Güvende! Kart atmaz)
      p1.knightsCount = 2;
      state.hands[p1.playerId] = Array(9).fill('wool');

      // p2: 0 Şövalye, 9 kart -> Limit 7 (Aşıyor! floor(9/2) = 4 kart atmalı)
      p2.knightsCount = 0;
      state.hands[p2.playerId] = Array(9).fill('brick');

      // p3: 1 Şövalye, 8 kart -> Limit 7+1=8 (Güvende! Kart atmaz)
      p3.knightsCount = 1;
      state.hands[p3.playerId] = Array(8).fill('wood');

      state = resolveSpecificEventCard(
        state,
        'robber',
        p1.playerId,
        false
      );

      expect(state.turnPhase).toBe('resolving_event');
      expect(state.pendingEvent?.pendingRobberDiscards).toHaveLength(1);
      expect(state.pendingEvent?.pendingRobberDiscards?.[0]).toEqual({
        playerId: p2.playerId,
        requiredDiscardCount: 4,
        completed: false,
      });
    });

    it('Olay Kartı - Sadaka (Charity): En yüksek ZP sahip oyuncu(lar) daha az ZP olan bir oyuncuya 1 kaynak seçerek vermeli', () => {
      let state = createInitialGameState({
        roomId: 'charity_room',
        roomCode: 'CHAR1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const [p1, p2, p3] = state.players;
      // p1 ve p2: 2 ZP (Liderler), p3: 1 ZP (Daha düşük ZP)
      p1.villageSlots.push({
        id: 'v_extra_1',
        isInitialSettlement: false,
        upgradedTo: 'none',
      });
      p2.villageSlots.push({
        id: 'v_extra_2',
        isInitialSettlement: false,
        upgradedTo: 'none',
      });

      state.hands[p1.playerId] = ['ore'];
      state.hands[p2.playerId] = ['wheat'];
      state.hands[p3.playerId] = [];

      state = resolveSpecificEventCard(state, 'charity', p1.playerId, false);

      expect(state.turnPhase).toBe('resolving_event');
      expect(state.pendingEvent?.pendingCharityGives).toHaveLength(2);

      // p1, p2'ye veremez (ikisi de 2 ZP), sadece p3'e verebilir
      expect(() =>
        submitCharityGive(state, p1.playerId, p2.playerId, 'ore')
      ).toThrow(/daha düşük Zafer Puanına/);

      state = submitCharityGive(state, p1.playerId, p3.playerId, 'ore');
      expect(state.turnPhase).toBe('resolving_event'); // p2 henüz vermedi

      state = submitCharityGive(state, p2.playerId, p3.playerId, 'wheat');
      expect(state.turnPhase).toBe('action');
      expect(state.hands[p3.playerId]).toEqual(['ore', 'wheat']);
    });

    it('Olay Kartı - Teşvik (Incentive): Ne En Uzun Yol ne de En Güçlü Ordu kartına sahip olmayanlar 2 kaynak çekmeli', () => {
      let state = createInitialGameState({
        roomId: 'incentive_room',
        roomCode: 'INCE1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const [p1, p2, p3] = state.players;
      p1.hasLongestRoad = true;
      p2.hasLargestArmy = true;
      p3.hasLongestRoad = false;
      p3.hasLargestArmy = false;

      const h1 = state.hands[p1.playerId].length;
      const h2 = state.hands[p2.playerId].length;
      const h3 = state.hands[p3.playerId].length;

      state = resolveSpecificEventCard(state, 'incentive', p1.playerId, false);

      expect(state.hands[p1.playerId]).toHaveLength(h1);
      expect(state.hands[p2.playerId]).toHaveLength(h2);
      expect(state.hands[p3.playerId]).toHaveLength(h3 + 2);
    });

    it('Olay Kartı - Hasat Kutlamaları (Harvest Festival): Herkes sadece görünür Köy (upgradedTo === "none") sayısı kadar kaynak çekmeli (Şehir/Büyükşehir sayılmaz!)', () => {
      let state = createInitialGameState({
        roomId: 'harvest_room',
        roomCode: 'HARV1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const [p1, p2, p3] = state.players;
      // p1: 2 görünür Köy, 1 Şehir -> +2 kaynak almalı
      p1.villageSlots = [
        { id: 's1', isInitialSettlement: true, upgradedTo: 'none' },
        { id: 's2', isInitialSettlement: false, upgradedTo: 'none' },
        { id: 's3', isInitialSettlement: false, upgradedTo: 'city' },
      ];
      // p2: 1 Büyükşehir (görünür Köyü 0!) -> +0 kaynak almalı
      p2.villageSlots = [
        { id: 's4', isInitialSettlement: true, upgradedTo: 'metropolis' },
      ];
      // p3: 1 görünür Köy -> +1 kaynak almalı
      p3.villageSlots = [
        { id: 's5', isInitialSettlement: true, upgradedTo: 'none' },
      ];

      const h1 = state.hands[p1.playerId].length;
      const h2 = state.hands[p2.playerId].length;
      const h3 = state.hands[p3.playerId].length;

      state = resolveSpecificEventCard(
        state,
        'harvest_festival',
        p1.playerId,
        false
      );

      expect(state.hands[p1.playerId]).toHaveLength(h1 + 2);
      expect(state.hands[p2.playerId]).toHaveLength(h2 + 0);
      expect(state.hands[p3.playerId]).toHaveLength(h3 + 1);
    });

    it('Olay Kartı - Yeni Yıl (New Year): Herkes 1 kaynak çekmeli ve tüm 7 Olay kartı toplanıp yeniden karıştırılmalı', () => {
      let state = createInitialGameState({
        roomId: 'newyear_room',
        roomCode: 'NEWY1',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      // Olay destesinde bazı kartlar ıskartada olsun
      state.eventDiscard = ['robber', 'charity', 'incentive'];
      state.eventDeck = ['robber', 'robber', 'harvest_festival'];

      const beforeCounts = state.players.map(
        (p) => state.hands[p.playerId].length
      );

      state = resolveSpecificEventCard(
        state,
        'new_year',
        state.players[0].playerId,
        false
      );

      state.players.forEach((p, idx) => {
        expect(state.hands[p.playerId]).toHaveLength(beforeCounts[idx] + 1);
      });
      expect(state.eventDiscard).toHaveLength(0);
      expect(state.eventDeck).toHaveLength(7);
    });
  });

  describe('5. 7 Zafer Puanı Kazanma Koşulu ve Hile Koruması (ClientGameView / RLS)', () => {
    it('Aktif oyuncu kendi turunda 7 Zafer Puanına ulaştığı an oyunu kazanmalı (status = "finished", turnPhase = "game_over")', () => {
      let state = createInitialGameState({
        roomId: 'win_room',
        roomCode: 'WIN07',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });
      state = executeProductionPhase(state);

      const activePlayer = state.players[state.activePlayerIndex];
      // Oyuncuda: 1 Büyükşehir (3 ZP) + 1 Köy (1 ZP) + En Uzun Yol (2 ZP) = 6 ZP olsun
      activePlayer.villageSlots = [
        { id: 'v1', isInitialSettlement: true, upgradedTo: 'metropolis' },
        { id: 'v2', isInitialSettlement: false, upgradedTo: 'none' },
      ];
      activePlayer.roadsCount = 3;
      activePlayer.hasLongestRoad = true;
      expect(calculateVictoryPoints(activePlayer)).toBe(6);

      // Elinde Şehir kuracak kaynak (2 Buğday + 3 Demir) olsun ve v2 Köyünü Şehre yükseltsin (+1 ZP -> 7 ZP!)
      state.hands[activePlayer.playerId] = [
        'wheat',
        'wheat',
        'ore',
        'ore',
        'ore',
      ];
      state.cardMarket = ['city', 'road', 'settlement', 'knight', 'settlement'];

      state = executeBuildStructure(state, activePlayer.playerId, 'city', 'v2');

      expect(state.players[state.activePlayerIndex].victoryPoints).toBe(7);
      expect(state.status).toBe('finished');
      expect(state.turnPhase).toBe('game_over');
      expect(state.winnerPlayerId).toBe(activePlayer.playerId);
    });

    it('toClientGameView: Rakiplerin elindeki kaynak kartlarının türlerini gizlemeli, sadece kendi elini (myHand) ve rakiplerin kart sayısını (handCount) göstermeli', () => {
      const state = createInitialGameState({
        roomId: 'rls_room',
        roomCode: 'RLS01',
        players: PLAYERS_3,
        settings: DEFAULT_SETTINGS_3P,
      });

      const viewForP1 = toClientGameView(state, 'p1');

      expect(viewForP1.myPlayerId).toBe('p1');
      expect(viewForP1.myHand).toEqual(state.hands['p1']);
      expect((viewForP1 as unknown as Record<string, unknown>).hands).toBeUndefined();
      expect((viewForP1 as unknown as Record<string, unknown>).resourceDeck).toBeUndefined();

      const p2Public = viewForP1.players.find((p) => p.playerId === 'p2')!;
      expect(p2Public.handCount).toBe(2);
      expect((p2Public as unknown as Record<string, unknown>).resources).toBeUndefined();
    });
  });

  describe('6. Multiplayer SyncManager & Lobi Kuralları Denetimi', () => {
    it('syncManager: Başlangıçta her oyuncuya tam olarak 2 kaynak dağıtılmalı, tur production aşamasından başlamalı, 5 aynı kart kuralı ve İlk Oyuncu işareti çalışmalı', () => {
      clearMemoryRoomStore();
      const createRes = createAuthoritativeRoom(
        { playerId: 'p1', nickname: 'Host' },
        { ...DEFAULT_SETTINGS_3P, useFirstGamePreset: false },
        'QA300'
      );
      expect(createRes.ok).toBe(true);
      let state = createRes.state!;
      state = joinAuthoritativeRoom(state, { playerId: 'p2', nickname: 'Guest2' }).state!;
      state = joinAuthoritativeRoom(state, { playerId: 'p3', nickname: 'Guest3' }).state!;

      // 5 aynı kart kuralını test etmek için destenin ilk 5 kartını aynı yapalım
      state.buildingDeck = [
        'knight',
        'knight',
        'knight',
        'knight',
        'knight',
        'road',
        'settlement',
        'city',
        'road',
        'settlement',
      ];

      // Belirli bir rng ile İlk Oyuncu işaretinin rastgele dağıtıldığını doğrulayalım
      const startRes = startAuthoritativeGame(state, 'p1', () => 0.1);
      expect(startRes.ok).toBe(true);
      const started = startRes.state!;

      // Her oyuncuya 2 kaynak dağıtılmış olmalı
      for (const p of started.players) {
        expect(started.hands[p.playerId]).toHaveLength(2);
        expect(p.handCount).toBe(2);
      }

      // İlk tur production aşamasından başlamalı
      expect(started.turnPhase).toBe('production');

      // 5 aynı kart sıfırlanmış olmalı
      expect(isAllSameBuildingType(started.cardMarket)).toBe(false);

      // İlk Oyuncu işareti sadece 1 oyuncuda olmalı ve activePlayerIndex onunla eşleşmeli
      const markerHolders = started.players.filter(
        (p) => p.villageSlots[0]?.hasFirstPlayerMarker
      );
      expect(markerHolders).toHaveLength(1);
      expect(started.players[started.activePlayerIndex].playerId).toBe(
        markerHolders[0].playerId
      );

      // Tur süresi dolduğunda yeni oyuncunun turu 'production' aşamasından başlamalı
      const startMs = new Date(started.turnStartedAt).getTime();
      const timeoutRes = checkAndHandleTurnTimeout(started, startMs + 65_000);
      expect(timeoutRes.ok).toBe(true);
      expect(timeoutRes.state!.turnPhase).toBe('production');
    });
  });
});
