import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CUSTOM_CARD_IMAGE_MAP,
  resolveCardImageUrl,
} from '../src/components/cards/CardVisual';
import {
  createInitialGameState,
  endTurn,
  executeBuildStructure,
  executeProductionPhase,
} from '../src/lib/engine/gameEngine';
import {
  createMetropolisDeck,
  getMetropolisBDefinition,
  playerHasMetropolisB,
} from '../src/lib/engine/metropolisRegistry';
import { RoomSettings } from '../src/types/game';

const EXPECTED_31_PNG_PATHS = [
  '/cards/bonus/bonus_largest_army.png',
  '/cards/bonus/bonus_longest_route.png',
  '/cards/building/building_back.png',
  '/cards/building/building_city.png',
  '/cards/building/building_knight.png',
  '/cards/building/building_road.png',
  '/cards/building/building_settlement.png',
  '/cards/event/event_abundance.png',
  '/cards/event/event_back.png',
  '/cards/event/event_charity.png',
  '/cards/event/event_robber.png',
  '/cards/event/event_solstice.png',
  '/cards/event/event_subsidy.png',
  '/cards/metropolis/metropolis_A.png',
  '/cards/metropolis/metropolis_B_knights.png',
  '/cards/metropolis/metropolis_B_largest_army.png',
  '/cards/metropolis/metropolis_B_longest_route.png',
  '/cards/metropolis/metropolis_B_roads.png',
  '/cards/player_aid/player_aid_back_turn_overview.png',
  '/cards/player_aid/player_aid_front_build_costs.png',
  '/cards/resource/resource_back.png',
  '/cards/resource/resource_brick.png',
  '/cards/resource/resource_ore.png',
  '/cards/resource/resource_wheat.png',
  '/cards/resource/resource_wood.png',
  '/cards/resource/resource_wool.png',
  '/cards/starting/starting_road_back.png',
  '/cards/starting/starting_road_front.png',
  '/cards/starting/starting_settlement_back.png',
  '/cards/starting/starting_settlement_front.png',
  '/cards/starting/starting_settlement_front_starting_player.png',
];

const THREE_PLAYERS = [
  { playerId: 'p1', nickname: 'Oyuncu 1' },
  { playerId: 'p2', nickname: 'Oyuncu 2' },
  { playerId: 'p3', nickname: 'Oyuncu 3' },
];

const B_MODE_SETTINGS: RoomSettings = {
  maxPlayers: 3,
  useFirstGamePreset: true,
  metropolisFaceMode: 'B',
  turnTimeoutSeconds: 60,
};

describe('Türkçe Kart Görselleri (31 PNG) ve 4 Büyükşehir B Yüzü Kuralları', () => {
  describe('1. 31 Türkçe Kart Görselinin Dosya ve CardVisual Eşleşme Doğrulaması', () => {
    it('public/cards altında tüm 31 PNG görseli mevcut ve dolu olmalıdır', () => {
      expect(EXPECTED_31_PNG_PATHS).toHaveLength(31);

      for (const relUrl of EXPECTED_31_PNG_PATHS) {
        const diskPath = path.join(process.cwd(), 'public', relUrl);
        expect(fs.existsSync(diskPath), `Eksik görsel: ${relUrl}`).toBe(true);
        const stat = fs.statSync(diskPath);
        expect(stat.size).toBeGreaterThan(1000);
      }

      // CUSTOM_CARD_IMAGE_MAP içindeki tüm görsellerin 31 PNG kümesinde yer aldığını doğrula
      const mappedValues = new Set(Object.values(CUSTOM_CARD_IMAGE_MAP));
      for (const expectedPath of EXPECTED_31_PNG_PATHS) {
        expect(
          mappedValues.has(expectedPath),
          `CUSTOM_CARD_IMAGE_MAP içinde eşleşmeyen PNG: ${expectedPath}`
        ).toBe(true);
      }
    });

    it('resolveCardImageUrl tüm kaynak, deste arkası, yapı, başlangıç, Büyükşehir A/B, olay ve özel kartları doğru PNG ile eşleştirmelidir', () => {
      // Kaynaklar
      expect(resolveCardImageUrl({ category: 'resource', type: 'brick' })).toBe(
        '/cards/resource/resource_brick.png'
      );
      expect(resolveCardImageUrl({ category: 'resource', type: 'wood' })).toBe(
        '/cards/resource/resource_wood.png'
      );
      expect(resolveCardImageUrl({ category: 'resource', type: 'wool' })).toBe(
        '/cards/resource/resource_wool.png'
      );
      expect(resolveCardImageUrl({ category: 'resource', type: 'wheat' })).toBe(
        '/cards/resource/resource_wheat.png'
      );
      expect(resolveCardImageUrl({ category: 'resource', type: 'ore' })).toBe(
        '/cards/resource/resource_ore.png'
      );

      // Deste Arkaları
      expect(resolveCardImageUrl({ category: 'back', deckType: 'resource' })).toBe(
        '/cards/resource/resource_back.png'
      );
      expect(resolveCardImageUrl({ category: 'back', deckType: 'building' })).toBe(
        '/cards/building/building_back.png'
      );
      expect(resolveCardImageUrl({ category: 'back', deckType: 'event' })).toBe(
        '/cards/event/event_back.png'
      );

      // İnşaat ve Başlangıç Yapıları
      expect(resolveCardImageUrl({ category: 'structure', type: 'road' })).toBe(
        '/cards/building/building_road.png'
      );
      expect(
        resolveCardImageUrl({ category: 'structure', type: 'road', isInitial: true })
      ).toBe('/cards/starting/starting_road_front.png');
      expect(resolveCardImageUrl({ category: 'structure', type: 'settlement' })).toBe(
        '/cards/building/building_settlement.png'
      );
      expect(
        resolveCardImageUrl({
          category: 'structure',
          type: 'settlement',
          isInitial: true,
          hasFirstPlayerMarker: false,
        })
      ).toBe('/cards/starting/starting_settlement_front.png');
      expect(
        resolveCardImageUrl({
          category: 'structure',
          type: 'settlement',
          isInitial: true,
          hasFirstPlayerMarker: true,
        })
      ).toBe('/cards/starting/starting_settlement_front_starting_player.png');
      expect(resolveCardImageUrl({ category: 'structure', type: 'city' })).toBe(
        '/cards/building/building_city.png'
      );
      expect(resolveCardImageUrl({ category: 'structure', type: 'knight' })).toBe(
        '/cards/building/building_knight.png'
      );

      // Büyükşehir A ve 4 B Yüzü
      expect(
        resolveCardImageUrl({ category: 'structure', type: 'metropolis', face: 'A' })
      ).toBe('/cards/metropolis/metropolis_A.png');
      expect(
        resolveCardImageUrl({
          category: 'structure',
          type: 'metropolis',
          face: 'B',
          bVariantId: 'metropolis_b_1',
        })
      ).toBe('/cards/metropolis/metropolis_B_knights.png');
      expect(
        resolveCardImageUrl({
          category: 'structure',
          type: 'metropolis',
          face: 'B',
          bVariantId: 'metropolis_b_2',
        })
      ).toBe('/cards/metropolis/metropolis_B_largest_army.png');
      expect(
        resolveCardImageUrl({
          category: 'structure',
          type: 'metropolis',
          face: 'B',
          bVariantId: 'metropolis_b_3',
        })
      ).toBe('/cards/metropolis/metropolis_B_longest_route.png');
      expect(
        resolveCardImageUrl({
          category: 'structure',
          type: 'metropolis',
          face: 'B',
          bVariantId: 'metropolis_b_4',
        })
      ).toBe('/cards/metropolis/metropolis_B_roads.png');

      // Olay Kartları
      expect(resolveCardImageUrl({ category: 'event', type: 'robber' })).toBe(
        '/cards/event/event_robber.png'
      );
      expect(resolveCardImageUrl({ category: 'event', type: 'charity' })).toBe(
        '/cards/event/event_charity.png'
      );
      expect(
        resolveCardImageUrl({ category: 'event', type: 'harvest_festival' })
      ).toBe('/cards/event/event_abundance.png');
      expect(resolveCardImageUrl({ category: 'event', type: 'incentive' })).toBe(
        '/cards/event/event_subsidy.png'
      );
      expect(resolveCardImageUrl({ category: 'event', type: 'new_year' })).toBe(
        '/cards/event/event_solstice.png'
      );

      // Özel Puan & Kural Özeti
      expect(resolveCardImageUrl({ category: 'special', type: 'longest_road' })).toBe(
        '/cards/bonus/bonus_longest_route.png'
      );
      expect(resolveCardImageUrl({ category: 'special', type: 'largest_army' })).toBe(
        '/cards/bonus/bonus_largest_army.png'
      );
      expect(resolveCardImageUrl({ category: 'special', type: 'rule_summary' })).toBe(
        '/cards/player_aid/player_aid_front_build_costs.png'
      );
      expect(
        resolveCardImageUrl({ category: 'special', type: 'rule_summary_back' })
      ).toBe('/cards/player_aid/player_aid_back_turn_overview.png');
    });
  });

  describe('2. 4 Büyükşehir B Yüzü Kartlarının İnşa Anı ve Eşitlik Bozma (Tie-Breaker) Kuralları', () => {
    it('metropolis_b_1 (Şövalyeler): Üretimde +1 kaynak vermeli ve inşa edildiği anda oyuncunun her Şövalyesi için desteden 1 Kaynak çekmelidir', () => {
      let state = createInitialGameState({
        roomId: 'r_mb1',
        roomCode: 'MB01',
        players: THREE_PLAYERS,
        settings: B_MODE_SETTINGS,
      });

      state.turnPhase = 'action';
      const activePlayer = state.players[state.activePlayerIndex];

      // Aktif oyuncunun önünde 1 Şehir ve 3 Şövalye bulunsun
      activePlayer.villageSlots[0].upgradedTo = 'city';
      activePlayer.knightsCount = 3;
      // Elinde tam olarak Büyükşehir maliyeti (3 Yün + 1 Demir) olsun
      state.hands[activePlayer.playerId] = ['wool', 'wool', 'wool', 'ore'];
      state.resourceDeck = ['brick', 'wood', 'wheat', 'ore', 'wool'];

      // En üstteki Büyükşehir kartı metropolis_b_1 (Şövalyeler)
      expect(state.metropolisDeck[0].bVariantId).toBe('metropolis_b_1');
      expect(getMetropolisBDefinition('metropolis_b_1').titleTr).toContain('Şövalyeler');

      state = executeBuildStructure(state, activePlayer.playerId, 'metropolis');

      // 4 kart maliyet ödendi (0 kaldı), ardından 3 Şövalye için desteden 3 kaynak çekildi!
      expect(state.hands[activePlayer.playerId]).toEqual(['brick', 'wood', 'wheat']);
      expect(
        playerHasMetropolisB(
          state.players[state.activePlayerIndex],
          'metropolis_b_1'
        )
      ).toBe(true);

      // Üretim aşamasında +1 bonus (1 temel + 1 Büyükşehir B = +2 kart) vermeli
      state.turnPhase = 'production';
      state = executeProductionPhase(state, activePlayer.playerId);
      expect(state.hands[activePlayer.playerId]).toHaveLength(5);
    });

    it('metropolis_b_2 (En Güçlü Ordu): İnşa anında veya sonradan Şövalye alındığında eşitlikte En Güçlü Ordu kartını almalı, rakip eşitlikte geri alamamalıdır', () => {
      let state = createInitialGameState({
        roomId: 'r_mb2',
        roomCode: 'MB02',
        players: THREE_PLAYERS,
        settings: B_MODE_SETTINGS,
      });

      state.turnPhase = 'action';
      const pActive = state.players[state.activePlayerIndex];
      const pOpponent = state.players[(state.activePlayerIndex + 1) % 3];

      // pOpponent 2 Şövalye ile En Güçlü Ordu sahibi olsun
      pOpponent.knightsCount = 2;
      pOpponent.hasLargestArmy = true;

      // Senaryo A: pActive'in de 2 Şövalyesi var (berabere ama kart pOpponent'ta). pActive metropolis_b_2 inşa ettiği anda kartı kapmalı!
      pActive.knightsCount = 2;
      pActive.villageSlots[0].upgradedTo = 'city';
      state.metropolisDeck = createMetropolisDeck('B').filter(
        (c) => c.bVariantId === 'metropolis_b_2'
      );
      state.hands[pActive.playerId] = ['wool', 'wool', 'wool', 'ore'];

      state = executeBuildStructure(state, pActive.playerId, 'metropolis');

      const updatedActive = state.players.find((p) => p.playerId === pActive.playerId)!;
      const updatedOpponent = state.players.find((p) => p.playerId === pOpponent.playerId)!;
      expect(updatedActive.hasLargestArmy).toBe(true);
      expect(updatedOpponent.hasLargestArmy).toBe(false);

      // Senaryo B: Sıra pOpponent'a geçsin. pOpponent 3. Şövalyeyi yapınca (3 > 2) En Güçlü Ordu'yu geri alır.
      state = endTurn(state, pActive.playerId);
      state = executeProductionPhase(state, pOpponent.playerId);
      state.cardMarket = ['knight', 'road', 'road', 'settlement', 'city'];
      state.hands[pOpponent.playerId] = ['wool', 'wheat', 'ore'];

      state = executeBuildStructure(state, pOpponent.playerId, 'knight');
      expect(
        state.players.find((p) => p.playerId === pOpponent.playerId)!.hasLargestArmy
      ).toBe(true);
      expect(
        state.players.find((p) => p.playerId === pActive.playerId)!.hasLargestArmy
      ).toBe(false);

      // Senaryo C: Sıra tekrar pActive'e gelsin. pActive (metropolis_b_2 sahibi) 3. Şövalyeyi yapınca (3 == 3 beraberlik) En Güçlü Ordu'yu tekrar alır!
      state = endTurn(state, pOpponent.playerId);
      const pThird = state.players[state.activePlayerIndex];
      state = executeProductionPhase(state, pThird.playerId);
      state = endTurn(state, pThird.playerId);

      state = executeProductionPhase(state, pActive.playerId);
      // Oyun 7 ZP ile bitmesin diye Büyükşehir'i başka slota değil mevcut slotta tutalım (3 ZP Büyükşehir + 2 ZP En Güçlü Ordu = 5 ZP)
      state.cardMarket = ['knight', 'road', 'road', 'settlement', 'city'];
      state.hands[pActive.playerId] = ['wool', 'wheat', 'ore'];

      state = executeBuildStructure(state, pActive.playerId, 'knight');
      expect(
        state.players.find((p) => p.playerId === pActive.playerId)!.knightsCount
      ).toBe(3);
      expect(
        state.players.find((p) => p.playerId === pActive.playerId)!.hasLargestArmy
      ).toBe(true);
      expect(
        state.players.find((p) => p.playerId === pOpponent.playerId)!.hasLargestArmy
      ).toBe(false);
    });

    it('metropolis_b_3 (En Uzun Yol): İnşa anında veya sonradan Yol alındığında eşitlikte En Uzun Yol kartını almalı, rakip eşitlikte geri alamamalıdır', () => {
      let state = createInitialGameState({
        roomId: 'r_mb3',
        roomCode: 'MB03',
        players: THREE_PLAYERS,
        settings: B_MODE_SETTINGS,
      });

      state.turnPhase = 'action';
      const pActive = state.players[state.activePlayerIndex];
      const pOpponent = state.players[(state.activePlayerIndex + 1) % 3];

      // pOpponent 3 Yol ile En Uzun Yol sahibi olsun
      pOpponent.roadsCount = 3;
      pOpponent.hasLongestRoad = true;

      // Senaryo A: pActive'in de 3 Yolu var. pActive metropolis_b_3 inşa ettiği anda eşitlik bozma ile En Uzun Yol'u alır!
      pActive.roadsCount = 3;
      pActive.villageSlots[0].upgradedTo = 'city';
      state.metropolisDeck = createMetropolisDeck('B').filter(
        (c) => c.bVariantId === 'metropolis_b_3'
      );
      state.hands[pActive.playerId] = ['wool', 'wool', 'wool', 'ore'];

      state = executeBuildStructure(state, pActive.playerId, 'metropolis');

      expect(
        state.players.find((p) => p.playerId === pActive.playerId)!.hasLongestRoad
      ).toBe(true);
      expect(
        state.players.find((p) => p.playerId === pOpponent.playerId)!.hasLongestRoad
      ).toBe(false);

      // Senaryo B: pOpponent 4. Yolu inşa edince (4 > 3) En Uzun Yol'u alır
      state = endTurn(state, pActive.playerId);
      state = executeProductionPhase(state, pOpponent.playerId);
      state.cardMarket = ['road', 'knight', 'settlement', 'city', 'road'];
      state.hands[pOpponent.playerId] = ['brick', 'wood'];

      state = executeBuildStructure(state, pOpponent.playerId, 'road');
      expect(
        state.players.find((p) => p.playerId === pOpponent.playerId)!.hasLongestRoad
      ).toBe(true);

      // Senaryo C: Sıra pActive'e döndüğünde pActive 4. Yolu inşa edince (4 == 4 beraberlik) metropolis_b_3 sayesinde En Uzun Yol'u geri alır!
      state = endTurn(state, pOpponent.playerId);
      const pThird = state.players[state.activePlayerIndex];
      state = executeProductionPhase(state, pThird.playerId);
      state = endTurn(state, pThird.playerId);

      state = executeProductionPhase(state, pActive.playerId);
      state.cardMarket = ['road', 'knight', 'settlement', 'city', 'road'];
      state.hands[pActive.playerId] = ['brick', 'wood'];

      state = executeBuildStructure(state, pActive.playerId, 'road');
      expect(
        state.players.find((p) => p.playerId === pActive.playerId)!.roadsCount
      ).toBe(4);
      expect(
        state.players.find((p) => p.playerId === pActive.playerId)!.hasLongestRoad
      ).toBe(true);
      expect(
        state.players.find((p) => p.playerId === pOpponent.playerId)!.hasLongestRoad
      ).toBe(false);
    });

    it('metropolis_b_4 (Yollar): Üretimde +1 kaynak vermeli ve inşa edildiği anda oyuncunun her Yolu (İlk Yol dahil) için desteden 1 Kaynak çekmelidir', () => {
      let state = createInitialGameState({
        roomId: 'r_mb4',
        roomCode: 'MB04',
        players: THREE_PLAYERS,
        settings: B_MODE_SETTINGS,
      });

      state.turnPhase = 'action';
      const activePlayer = state.players[state.activePlayerIndex];

      // Aktif oyuncunun önünde 1 Şehir ve 4 Yol bulunsun
      activePlayer.villageSlots[0].upgradedTo = 'city';
      activePlayer.roadsCount = 4;
      state.metropolisDeck = createMetropolisDeck('B').filter(
        (c) => c.bVariantId === 'metropolis_b_4'
      );
      state.hands[activePlayer.playerId] = ['wool', 'wool', 'wool', 'ore'];
      state.resourceDeck = ['brick', 'wood', 'wool', 'wheat', 'ore'];

      state = executeBuildStructure(state, activePlayer.playerId, 'metropolis');

      // 4 kart maliyet ödendi (0 kaldı), ardından 4 Yol için desteden 4 kaynak çekildi!
      expect(state.hands[activePlayer.playerId]).toEqual([
        'brick',
        'wood',
        'wool',
        'wheat',
      ]);
      expect(
        playerHasMetropolisB(
          state.players[state.activePlayerIndex],
          'metropolis_b_4'
        )
      ).toBe(true);
    });
  });
});
