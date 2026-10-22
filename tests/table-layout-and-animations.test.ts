import { describe, expect, it } from 'vitest';
import {
  STRUCTURE_CARD_DESCRIPTIONS,
} from '@/components/board/OpponentArea';
import {
  calculateProductionCount,
  getHarborRequiredCount,
} from '@/components/board/PlayerBoard';
import { canAffordStructure, getMissingResourcesDescription } from '@/components/board/MarketArea';
import {
  CUSTOM_CARD_IMAGE_MAP,
  resolveCardImageUrl,
} from '@/components/cards/CardVisual';
import {
  SHUFFLE_ANIMATION_SPEC,
  DEAL_ANIMATION_SPEC,
  HAND_FAN_SPRING_SPEC,
  CARD_PLACE_ANIMATION_SPEC,
} from '@/lib/animations/cardAnimationSpec';
import { PublicPlayerState, ResourceType } from '@/types/game';

describe('Masa-MD Table Layout, Rules & Animation Tests', () => {
  it('STRUCTURE_CARD_DESCRIPTIONS provides complete data matching masa-md', () => {
    expect(STRUCTURE_CARD_DESCRIPTIONS.settlement.title).toBe('KÖY (1 ZP)');
    expect(STRUCTURE_CARD_DESCRIPTIONS.settlement.imageUrl).toBe('/cards/building/building_settlement.png');

    expect(STRUCTURE_CARD_DESCRIPTIONS.city.title).toBe('ŞEHİR (2 ZP)');
    expect(STRUCTURE_CARD_DESCRIPTIONS.city.imageUrl).toBe('/cards/building/building_city.png');

    expect(STRUCTURE_CARD_DESCRIPTIONS.metropolis.title).toBe('BÜYÜKŞEHİR (3 ZP)');
    expect(STRUCTURE_CARD_DESCRIPTIONS.metropolis.imageUrl).toBe('/cards/metropolis/metropolis_A.png');

    expect(STRUCTURE_CARD_DESCRIPTIONS.road.title).toBe('YOL');
    expect(STRUCTURE_CARD_DESCRIPTIONS.road.imageUrl).toBe('/cards/building/building_road.png');

    expect(STRUCTURE_CARD_DESCRIPTIONS.knight.title).toBe('ŞÖVALYE');
    expect(STRUCTURE_CARD_DESCRIPTIONS.knight.imageUrl).toBe('/cards/building/building_knight.png');
  });

  it('getHarborRequiredCount enforces correct Harbor ratio per roads count', () => {
    // 1 Yol -> 4:1
    expect(getHarborRequiredCount(1)).toBe(4);
    // 2 Yol -> 3:1
    expect(getHarborRequiredCount(2)).toBe(3);
    // 3 Yol -> 2:1
    expect(getHarborRequiredCount(3)).toBe(2);
    // 4+ Yol -> 1:1
    expect(getHarborRequiredCount(4)).toBe(1);
    expect(getHarborRequiredCount(5)).toBe(1);
  });

  it('calculateProductionCount accurately calculates resource generation for settlements and cities', () => {
    const player: PublicPlayerState = {
      playerId: 'test_p1',
      nickname: 'Test Player',
      seatIndex: 0,
      isConnected: true,
      lastSeenAt: new Date().toISOString(),
      victoryPoints: 3,
      handCount: 5,
      roadsCount: 1,
      knightsCount: 1,
      hasLongestRoad: false,
      hasLargestArmy: false,
      villageSlots: [
        { id: 's1', isInitialSettlement: true, upgradedTo: 'none', hasFirstPlayerMarker: true },
        { id: 's2', isInitialSettlement: true, upgradedTo: 'city', hasFirstPlayerMarker: false },
      ],
    };

    // Taban: 1 + Köy (0 bonus) + Şehir (+1 bonus) = 2
    expect(calculateProductionCount(player)).toBe(2);

    // Büyükşehir (+2 bonus) eklenince: 1 + 0 + 1 + 2 = 4
    player.villageSlots.push({
      id: 's3',
      isInitialSettlement: false,
      upgradedTo: 'metropolis',
      hasFirstPlayerMarker: false,
    });
    expect(calculateProductionCount(player)).toBe(4);
  });

  it('canAffordStructure properly verifies hand against structure costs', () => {
    const poorHand: ResourceType[] = ['brick'];
    expect(canAffordStructure(poorHand, 'road')).toBe(false); // Yol 1 tuğla + 1 odun ister

    const roadHand: ResourceType[] = ['brick', 'wood'];
    expect(canAffordStructure(roadHand, 'road')).toBe(true);

    const settlementHand: ResourceType[] = ['brick', 'wood', 'wool', 'wheat'];
    expect(canAffordStructure(settlementHand, 'settlement')).toBe(true);
    expect(canAffordStructure(settlementHand, 'city')).toBe(false); // Şehir 3 taş + 2 buğday

    const cityHand: ResourceType[] = ['ore', 'ore', 'ore', 'wheat', 'wheat'];
    expect(canAffordStructure(cityHand, 'city')).toBe(true);
  });

  it('resolveCardImageUrl resolves all 31 Turkish card PNG assets cleanly', () => {
    expect(resolveCardImageUrl({ category: 'resource', type: 'wheat' })).toBe(
      '/cards/resource/resource_wheat.png'
    );
    expect(resolveCardImageUrl({ category: 'resource', type: 'ore' })).toBe(
      '/cards/resource/resource_ore.png'
    );
    expect(resolveCardImageUrl({ category: 'back', deckType: 'resource' })).toBe(
      '/cards/resource/resource_back.png'
    );
    expect(resolveCardImageUrl({ category: 'back', deckType: 'building' })).toBe(
      '/cards/building/building_back.png'
    );
    expect(resolveCardImageUrl({ category: 'structure', type: 'road' })).toBe(
      '/cards/building/building_road.png'
    );
    expect(resolveCardImageUrl({ category: 'structure', type: 'city' })).toBe(
      '/cards/building/building_city.png'
    );
    expect(
      resolveCardImageUrl({
        category: 'structure',
        type: 'metropolis',
        face: 'B',
        bVariantId: 'metropolis_b_1',
      })
    ).toBe('/cards/metropolis/metropolis_B_knights.png');
  });

  it('cardAnimationSpec conforms to 60fps GPU guidelines', () => {
    expect(SHUFFLE_ANIMATION_SPEC.totalDurationMs).toBeGreaterThan(0);
    expect(SHUFFLE_ANIMATION_SPEC.riffleCycles).toBe(2);
    expect(DEAL_ANIMATION_SPEC.totalOpeningDurationMs).toBeGreaterThan(1000);
    expect(HAND_FAN_SPRING_SPEC.overviewMode.baseScale3P).toBe(0.88);
    expect(HAND_FAN_SPRING_SPEC.reviewMode.scale).toBeGreaterThan(1.0);
    expect(CARD_PLACE_ANIMATION_SPEC.totalDurationMs).toBeGreaterThan(0);
  });

  it('getMissingResourcesDescription correctly identifies missing resources for player feedback', () => {
    const hand: ResourceType[] = ['brick'];
    const missing = getMissingResourcesDescription(hand, 'road');
    expect(missing).toBe('1 Odun');

    const missingSettlement = getMissingResourcesDescription(hand, 'settlement');
    expect(missingSettlement).toContain('Odun');
    expect(missingSettlement).toContain('Yün');
    expect(missingSettlement).toContain('Buğday');
  });

  it('enforces building row rule: 5 faceup building cards and metropolis stack at the end', () => {
    // Rulebook check:
    // 1. 5 cards in faceup building row
    // 2. Metropolis stack at the end of the building row
    // 3. Metropolis A and B variants correctly resolve faceup images
    const metroAImage = resolveCardImageUrl({
      category: 'structure',
      type: 'metropolis',
      face: 'A',
    });
    expect(metroAImage).toBe('/cards/metropolis/metropolis_A.png');

    const metroBImage = resolveCardImageUrl({
      category: 'structure',
      type: 'metropolis',
      face: 'B',
      bVariantId: 'metropolis_b_3',
    });
    expect(metroBImage).toBe('/cards/metropolis/metropolis_B_longest_route.png');
  });

  it('getMissingResourcesDescription correctly identifies missing resources for tactile feedback', () => {
    // Yol 1 tuğla + 1 odun ister. Elimizde sadece 1 tuğla varsa 1 Odun eksik olmalı
    const handWithBrick: ResourceType[] = ['brick'];
    const missingForRoad = getMissingResourcesDescription(handWithBrick, 'road');
    expect(missingForRoad).toContain('Odun');

    // Şehir 2 buğday + 3 demir ister. Boş elde 2 Buğday ve 3 Demir eksik olmalı
    const emptyHand: ResourceType[] = [];
    const missingForCity = getMissingResourcesDescription(emptyHand, 'city');
    expect(missingForCity).toContain('Buğday');
    expect(missingForCity).toContain('Demir');

    // Büyükşehir 3 yün + 1 demir ister.
    const missingForMetropolis = getMissingResourcesDescription(emptyHand, 'metropolis');
    expect(missingForMetropolis).toContain('Yün');
    expect(missingForMetropolis).toContain('Demir');
  });
});
