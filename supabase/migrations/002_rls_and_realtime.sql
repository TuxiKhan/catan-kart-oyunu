-- ============================================================================
-- CATAN KART OYUNU (120 Kartlık Kutu Oyunu) - 002_rls_and_realtime.sql
-- Hile Korumalı Row Level Security (RLS), Güvenli RPC ve Supabase Realtime
-- ============================================================================

-- 1. KİMLİK DOĞRULAMA YARDIMCI FONKSİYONU (Misafir / Anonim Oturum Desteği)
-- İstemcinin Supabase Anonymous Auth UID'sini, JWT 'sub' veya 'x-player-id'
-- başlığını güvenli şekilde okur.
CREATE OR REPLACE FUNCTION public.request_player_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_uid TEXT;
  v_jwt_sub TEXT;
  v_header_player_id TEXT;
BEGIN
  -- 1. Supabase auth.uid() kontrolü
  BEGIN
    v_uid := auth.uid()::text;
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NOT NULL AND v_uid <> '' THEN
    RETURN v_uid;
  END IF;

  -- 2. JWT claims 'sub' veya 'player_id' kontrolü
  BEGIN
    v_jwt_sub := COALESCE(
      current_setting('request.jwt.claims', true)::json->>'player_id',
      current_setting('request.jwt.claims', true)::json->>'sub'
    );
  EXCEPTION WHEN OTHERS THEN
    v_jwt_sub := NULL;
  END;

  IF v_jwt_sub IS NOT NULL AND v_jwt_sub <> '' THEN
    RETURN v_jwt_sub;
  END IF;

  -- 3. Özel istek başlığı (x-player-id) kontrolü (Misafir oturumu için)
  BEGIN
    v_header_player_id := current_setting('request.headers', true)::json->>'x-player-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_player_id := NULL;
  END;

  RETURN v_header_player_id;
END;
$$;

-- ============================================================================
-- 2. TÜM TABLOLARDA ROW LEVEL SECURITY (RLS) AKTİFLEŞTİRME
-- ============================================================================

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_market ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RLS POLİTİKALARI (HİLE KORUMASI / ANTI-CHEAT)
-- ============================================================================

-- A) ROOMS: Oda genel durumu (tur sırası, ayarlar, faz) odadaki oyunculara açıktır.
DROP POLICY IF EXISTS "rooms_select_public" ON public.rooms;
CREATE POLICY "rooms_select_public"
  ON public.rooms
  FOR SELECT
  USING (true);

-- B) ROOM_PLAYERS: Oyuncuların genel istatistikleri ve SADECE toplam kart sayısı (hand_count)
-- odadaki herkese açıktır. Kaynakların türü bu tabloda tutulmaz!
DROP POLICY IF EXISTS "room_players_select_public" ON public.room_players;
CREATE POLICY "room_players_select_public"
  ON public.room_players
  FOR SELECT
  USING (true);

-- C) PLAYER_HANDS (KRİTİK HİLE KORUMASI):
-- Bir oyuncu SADECE KENDİ elindeki kaynak kartlarını (player_id = request_player_id()) görebilir!
-- Rakiplerin elindeki kaynakların türüne SELECT atamaz.
DROP POLICY IF EXISTS "player_hands_select_own_only" ON public.player_hands;
CREATE POLICY "player_hands_select_own_only"
  ON public.player_hands
  FOR SELECT
  USING (
    player_id = COALESCE(
      auth.uid()::text,
      current_setting('request.jwt.claims', true)::json->>'sub',
      public.request_player_id()
    )
  );

-- İstemci doğrudan kendi eline kart ekleyemez/değiştiremez (Sadece Sunucu/RPC)
DROP POLICY IF EXISTS "player_hands_deny_client_write" ON public.player_hands;
CREATE POLICY "player_hands_deny_client_write"
  ON public.player_hands
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- D) DECKS (KRİTİK HİLE KORUMASI):
-- Kapalı desteler (Kaynak, İnşaat, Olay desteleri ve ıskartalar) istemciye TAMAMEN KAPALIDIR!
-- İstemciden doğrudan SELECT/INSERT/UPDATE/DELETE yapılamaz; sadece SECURITY DEFINER RPC erişir.
DROP POLICY IF EXISTS "decks_deny_all_client_access" ON public.decks;
CREATE POLICY "decks_deny_all_client_access"
  ON public.decks
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- E) CARD_MARKET: Açık 5 inşaat kartı, büyükşehir destesi ve deste sayıları herkese açıktır.
DROP POLICY IF EXISTS "card_market_select_public" ON public.card_market;
CREATE POLICY "card_market_select_public"
  ON public.card_market
  FOR SELECT
  USING (true);

-- F) TRADES: Aktif ticaret teklifleri ve karşı teklifler odadaki oyunculara açıktır.
DROP POLICY IF EXISTS "trades_select_public" ON public.trades;
CREATE POLICY "trades_select_public"
  ON public.trades
  FOR SELECT
  USING (true);

-- ============================================================================
-- 4. GÜVENLİ OYUN GÖRÜNÜMÜ RPC FONKSİYONU (SECURITY DEFINER)
-- İstemciye sadece görmeye yetkili olduğu verileri (ClientGameView formatında) döner.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_masked_client_game_view(
  p_room_id UUID,
  p_player_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_player_id TEXT;
  v_room RECORD;
  v_market RECORD;
  v_my_hand JSONB;
  v_players JSONB;
  v_active_trade JSONB;
BEGIN
  v_effective_player_id := COALESCE(p_player_id, public.request_player_id());

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadı: %', p_room_id;
  END IF;

  SELECT * INTO v_market FROM public.card_market WHERE room_id = p_room_id;

  -- Sadece çağıran oyuncunun kendi elini çek
  SELECT COALESCE(resources, '[]'::jsonb) INTO v_my_hand
  FROM public.player_hands
  WHERE room_id = p_room_id AND player_id = v_effective_player_id;

  IF v_my_hand IS NULL THEN
    v_my_hand := '[]'::jsonb;
  END IF;

  -- Oyuncu listesini (sadece hand_count ile, gizli kaynaklar olmadan) hazırla
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'playerId', rp.player_id,
        'nickname', rp.nickname,
        'seatIndex', rp.seat_index,
        'isConnected', rp.is_connected,
        'lastSeenAt', rp.last_seen_at,
        'handCount', rp.hand_count,
        'roadsCount', rp.roads_count,
        'knightsCount', rp.knights_count,
        'villageSlots', rp.village_slots,
        'hasLongestRoad', rp.has_longest_road,
        'hasLargestArmy', rp.has_largest_army,
        'victoryPoints', rp.victory_points
      ) ORDER BY rp.seat_index ASC
    ),
    '[]'::jsonb
  ) INTO v_players
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id;

  -- Aktif ticaret oturumu (varsa)
  SELECT jsonb_build_object(
    'id', t.id,
    'roomId', t.room_id,
    'initiatorPlayerId', t.initiator_player_id,
    'wantedResources', t.wanted_resources,
    'offeredResources', t.offered_resources,
    'counterOffers', t.counter_offers,
    'status', t.status
  ) INTO v_active_trade
  FROM public.trades t
  WHERE t.room_id = p_room_id AND t.status IN ('open', 'offered')
  ORDER BY t.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'roomId', v_room.id,
    'roomCode', v_room.room_code,
    'status', v_room.status,
    'settings', v_room.settings,
    'turnNumber', v_room.turn_number,
    'activePlayerIndex', v_room.active_player_index,
    'turnPhase', v_room.turn_phase,
    'turnStartedAt', v_room.turn_started_at,
    'hasTradedThisTurn', v_room.has_traded_this_turn,
    'hasUsedHarborThisTurn', v_room.has_used_harbor_this_turn,
    'players', v_players,
    'myPlayerId', v_effective_player_id,
    'myHand', v_my_hand,
    'resourceDeckCount', COALESCE(v_market.resource_deck_count, 0),
    'resourceDiscardCount', COALESCE(v_market.resource_discard_count, 0),
    'buildingDeckCount', COALESCE(v_market.building_deck_count, 0),
    'cardMarket', COALESCE(v_market.open_building_cards, '[]'::jsonb),
    'metropolisDeckCount', COALESCE(jsonb_array_length(v_market.metropolis_deck), 0),
    'topMetropolisCard', CASE
      WHEN v_market.metropolis_deck IS NOT NULL AND jsonb_array_length(v_market.metropolis_deck) > 0
      THEN v_market.metropolis_deck->0
      ELSE NULL
    END,
    'eventDeckCount', COALESCE(v_market.event_deck_count, 0),
    'eventDiscardCount', COALESCE(v_market.event_discard_count, 0),
    'pendingEvent', v_market.pending_event,
    'activeTrade', v_active_trade,
    'winnerPlayerId', v_room.winner_player_id,
    'logs', v_room.logs
  );
END;
$$;

-- ============================================================================
-- 5. SUPABASE REALTIME PUBLICATION TANIMLARI
-- NOT: 'decks' tablosu hile koruması nedeniyle KESİNLİKLE Realtime'a EKLENMEZ!
-- ============================================================================

ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_players REPLICA IDENTITY FULL;
ALTER TABLE public.card_market REPLICA IDENTITY FULL;
ALTER TABLE public.trades REPLICA IDENTITY FULL;
ALTER TABLE public.player_hands REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_market;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_hands;
