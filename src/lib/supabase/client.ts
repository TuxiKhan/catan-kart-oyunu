/**
 * CATAN KART OYUNU - Supabase İstemci, Realtime Kanal ve RLS Doğrulama Katmanı
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const DEFAULT_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const DEFAULT_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-placeholder';

/**
 * Supabase ortam değişkenlerinin gerçek bir projeye bağlı olup olmadığını kontrol eder.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321'
  );
}

/**
 * Oyuncu için RLS uyumlu Supabase istemcisi oluşturur.
 * `x-player-id` başlığı sayesinde `public.request_player_id()` fonksiyonu
 * `player_hands` tablosunda sadece ilgili oyuncunun kendi kartlarını görmesini sağlar.
 */
export function createPlayerSupabaseClient(
  playerId?: string
): SupabaseClient<Database> {
  const globalHeaders: Record<string, string> = {};
  if (playerId && playerId.trim().length > 0) {
    globalHeaders['x-player-id'] = playerId.trim();
  }

  return createClient<Database>(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      headers: globalHeaders,
    },
  });
}

/**
 * Sunucu tarafında (API Route / Server Action) tam yetkili (Service Role)
 * istemci oluşturur. Kapalı desteleri (`decks`) ve oyuncu ellerini (`player_hands`)
 * yalnızca sunucu katmanı güncelleyebilir.
 */
export function createServiceSupabaseClient(): SupabaseClient<Database> {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_ANON_KEY;

  return createClient<Database>(DEFAULT_SUPABASE_URL, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Oda bazlı Supabase Realtime kanal adını standartlaştırır.
 */
export function getRoomRealtimeChannelName(roomId: string): string {
  return `catan_room:${roomId}`;
}

/**
 * Realtime yayınına dahil edilen tabloların listesi.
 * GÜVENLİK: 'decks' tablosu kapalı olduğu için bu listede KESİNLİKLE yer almaz!
 */
export const REALTIME_PUBLISHED_TABLES = [
  'rooms',
  'room_players',
  'card_market',
  'trades',
  'player_hands',
] as const;

export const SERVER_ONLY_RESTRICTED_TABLES = ['decks'] as const;

/**
 * RLS Kural Doğrulayıcı: Bir oyuncunun belirli bir `player_hands` satırını
 * okuyup okuyamayacağını doğrular (Hile Koruması).
 */
export function canPlayerReadHand(
  handOwnerPlayerId: string,
  requestingPlayerId: string | null | undefined
): boolean {
  if (!requestingPlayerId || !handOwnerPlayerId) {
    return false;
  }
  return handOwnerPlayerId === requestingPlayerId;
}

/**
 * RLS Kural Doğrulayıcı: İstemcinin `decks` tablosuna doğrudan SELECT atıp
 * atamayacağını doğrular (Her zaman false döner - sadece sunucu/RPC erişebilir).
 */
export function canClientReadDecksDirectly(): boolean {
  return false;
}
