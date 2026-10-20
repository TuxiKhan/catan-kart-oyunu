-- ============================================================================
-- CATAN KART OYUNU (120 Kartlık Kutu Oyunu) - 001_initial_schema.sql
-- 3-4 Kişilik Online Multiplayer Veritabanı Şeması (Supabase PostgreSQL)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ROOMS TABLOSU (Odalar, 3-4 kişi sınırı, oyun durumu, ayarlar, tur takibi)
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(8) NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 4
    CHECK (max_players >= 3 AND max_players <= 4),
  settings JSONB NOT NULL DEFAULT '{
    "maxPlayers": 4,
    "useFirstGamePreset": true,
    "metropolisFaceMode": "A",
    "turnTimeoutSeconds": 60
  }'::jsonb
    CHECK (
      ((settings->>'maxPlayers')::int IN (3, 4)) AND
      ((settings->>'metropolisFaceMode') IN ('A', 'B')) AND
      ((settings->>'turnTimeoutSeconds')::int IN (0, 60, 90))
    ),
  turn_number INTEGER NOT NULL DEFAULT 0
    CHECK (turn_number >= 0),
  active_player_index INTEGER NOT NULL DEFAULT 0
    CHECK (active_player_index >= 0 AND active_player_index <= 3),
  turn_phase TEXT NOT NULL DEFAULT 'production'
    CHECK (turn_phase IN ('production', 'action', 'resolving_event', 'game_over')),
  turn_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  has_traded_this_turn BOOLEAN NOT NULL DEFAULT FALSE,
  has_used_harbor_this_turn BOOLEAN NOT NULL DEFAULT FALSE,
  winner_player_id TEXT NULL,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON public.rooms (room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms (status);

-- 2. ROOM_PLAYERS TABLOSU (Oyuncu sırası, ZP, eldeki kart sayısı, açık/kapalı yapılar)
-- NOT: Rakipler bu tablodan sadece hand_count (toplam kaynak kartı sayısı) değerini görebilir!
CREATE TABLE IF NOT EXISTS public.room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  nickname VARCHAR(32) NOT NULL
    CHECK (char_length(trim(nickname)) >= 2),
  seat_index INTEGER NOT NULL
    CHECK (seat_index >= 0 AND seat_index <= 3),
  victory_points INTEGER NOT NULL DEFAULT 1
    CHECK (victory_points >= 0),
  hand_count INTEGER NOT NULL DEFAULT 0
    CHECK (hand_count >= 0),
  roads_count INTEGER NOT NULL DEFAULT 1
    CHECK (roads_count >= 1),
  knights_count INTEGER NOT NULL DEFAULT 0
    CHECK (knights_count >= 0),
  village_slots JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(village_slots) = 'array'),
  has_longest_road BOOLEAN NOT NULL DEFAULT FALSE,
  has_largest_army BOOLEAN NOT NULL DEFAULT FALSE,
  is_connected BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, player_id),
  UNIQUE (room_id, seat_index)
);

CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON public.room_players (room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_player_id ON public.room_players (player_id);

-- 3. PLAYER_HANDS TABLOSU (RLS Korumalı Gizli Oyuncu Elleri)
-- Bir oyuncu diğerinin elindeki kaynakların TÜRÜNÜ göremez, sadece kendi elini görebilir!
CREATE TABLE IF NOT EXISTS public.player_hands (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  resources JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(resources) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, player_id),
  FOREIGN KEY (room_id, player_id)
    REFERENCES public.room_players(room_id, player_id) ON DELETE CASCADE
);

-- 4. DECKS TABLOSU (Kapalı Desteler ve Iskarta Yığınları - İstemciye Tamamen Kapalı!)
-- Sadece sunucu / SECURITY DEFINER RPC fonksiyonları erişebilir.
CREATE TABLE IF NOT EXISTS public.decks (
  room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  resource_deck JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(resource_deck) = 'array'),
  resource_discard JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(resource_discard) = 'array'),
  building_deck JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(building_deck) = 'array'),
  event_deck JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(event_deck) = 'array'),
  event_discard JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(event_discard) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. CARD_MARKET TABLOSU (Açık 5 İnşaat Kartı + Büyükşehir Destesi + Aktif Olay Çözümlemesi)
CREATE TABLE IF NOT EXISTS public.card_market (
  room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  open_building_cards JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (
      jsonb_typeof(open_building_cards) = 'array' AND
      jsonb_array_length(open_building_cards) <= 5
    ),
  metropolis_deck JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (
      jsonb_typeof(metropolis_deck) = 'array' AND
      jsonb_array_length(metropolis_deck) <= 4
    ),
  resource_deck_count INTEGER NOT NULL DEFAULT 0
    CHECK (resource_deck_count >= 0),
  resource_discard_count INTEGER NOT NULL DEFAULT 0
    CHECK (resource_discard_count >= 0),
  building_deck_count INTEGER NOT NULL DEFAULT 0
    CHECK (building_deck_count >= 0),
  event_deck_count INTEGER NOT NULL DEFAULT 0
    CHECK (event_deck_count >= 0),
  event_discard_count INTEGER NOT NULL DEFAULT 0
    CHECK (event_discard_count >= 0),
  pending_event JSONB NULL DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TRADES TABLOSU (Aktif Ticaret Teklifleri ve Karşı Teklifler)
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  initiator_player_id TEXT NOT NULL,
  wanted_resources JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(wanted_resources) = 'array'),
  offered_resources JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(offered_resources) = 'array'),
  counter_offers JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(counter_offers) = 'array'),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'offered', 'accepted', 'cancelled', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_room_id ON public.trades (room_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON public.trades (room_id, status);

-- ============================================================================
-- VERİ BÜTÜNLÜĞÜ TETİKLEYİCİLERİ (TRIGGERS)
-- ============================================================================

-- A) Odaya maksimum oyuncu sınırı (3 veya 4 kişi) kontrolü
CREATE OR REPLACE FUNCTION public.check_room_player_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count INTEGER;
  v_max_players INTEGER;
BEGIN
  SELECT max_players INTO v_max_players
  FROM public.rooms
  WHERE id = NEW.room_id;

  IF v_max_players IS NULL THEN
    RAISE EXCEPTION 'Oda bulunamadı: %', NEW.room_id;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.room_players
  WHERE room_id = NEW.room_id;

  IF v_current_count >= v_max_players THEN
    RAISE EXCEPTION 'Oda kapasitesi dolu (Maksimum % oyuncu).', v_max_players;
  END IF;

  IF NEW.seat_index >= v_max_players THEN
    RAISE EXCEPTION 'Koltuk sırası (seat_index: %) maksimum oyuncu sınırını (%) aşıyor.', NEW.seat_index, v_max_players;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_room_player_capacity ON public.room_players;
CREATE TRIGGER trg_check_room_player_capacity
BEFORE INSERT ON public.room_players
FOR EACH ROW
EXECUTE FUNCTION public.check_room_player_capacity();

-- B) player_hands güncellendiğinde room_players.hand_count değerini otomatik senkronize et
CREATE OR REPLACE FUNCTION public.sync_player_hand_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.room_players
  SET hand_count = jsonb_array_length(NEW.resources)
  WHERE room_id = NEW.room_id
    AND player_id = NEW.player_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_player_hand_count ON public.player_hands;
CREATE TRIGGER trg_sync_player_hand_count
AFTER INSERT OR UPDATE OF resources ON public.player_hands
FOR EACH ROW
EXECUTE FUNCTION public.sync_player_hand_count();

-- C) decks güncellendiğinde card_market üzerindeki kart sayılarını otomatik senkronize et
CREATE OR REPLACE FUNCTION public.sync_deck_counts_to_market()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.card_market
  SET
    resource_deck_count = jsonb_array_length(NEW.resource_deck),
    resource_discard_count = jsonb_array_length(NEW.resource_discard),
    building_deck_count = jsonb_array_length(NEW.building_deck),
    event_deck_count = jsonb_array_length(NEW.event_deck),
    event_discard_count = jsonb_array_length(NEW.event_discard),
    updated_at = NOW()
  WHERE room_id = NEW.room_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deck_counts_to_market ON public.decks;
CREATE TRIGGER trg_sync_deck_counts_to_market
AFTER INSERT OR UPDATE ON public.decks
FOR EACH ROW
EXECUTE FUNCTION public.sync_deck_counts_to_market();
