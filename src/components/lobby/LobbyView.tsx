'use client';

import React, { useEffect, useState } from 'react';
import {
  AuthoritativeGameState,
  ClientGameView,
  MetropolisFaceMode,
  RoomSettings,
  TurnTimeoutOption,
} from '@/types/game';
import {
  createAuthoritativeRoom,
  createOrUpdatePlayerSession,
  getSavedPlayerSession,
  joinAuthoritativeRoom,
  loadRoomStateFromStorage,
  MultiplayerSyncManager,
  PlayerSession,
  savePlayerSession,
  saveRoomStateToStorage,
  startAuthoritativeGame,
  toClientGameView,
} from '@/lib/multiplayer/syncManager';
import { fetchAuthoritativeRoomFromSupabase } from '@/lib/supabase/supabaseRoomRepository';
import {
  Check,
  Clock,
  Compass,
  Copy,
  Crown,
  LogIn,
  Play,
  PlusCircle,
  RefreshCw,
  Sparkles,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';

export interface LobbyViewProps {
  onGameStarted?: (
    authoritativeState: AuthoritativeGameState,
    clientView: ClientGameView,
    session: PlayerSession
  ) => void;
  onStateUpdated?: (
    authoritativeState: AuthoritativeGameState,
    clientView: ClientGameView
  ) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  onGameStarted,
  onStateUpdated,
}) => {
  const [nickname, setNickname] = useState<string>('');
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [savedRoomCode, setSavedRoomCode] = useState<string | null>(null);

  // RoomSettings state
  const [maxPlayers, setMaxPlayers] = useState<3 | 4>(3);
  const [useFirstGamePreset, setUseFirstGamePreset] = useState<boolean>(true);
  const [metropolisFaceMode, setMetropolisFaceMode] = useState<MetropolisFaceMode>('A');
  const [turnTimeoutSeconds, setTurnTimeoutSeconds] = useState<TurnTimeoutOption>(60);

  const [roomState, setRoomState] = useState<AuthoritativeGameState | null>(null);
  const [syncManager, setSyncManager] = useState<MultiplayerSyncManager | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Sayfa yüklendiğinde kalıcı oyuncu oturumunu ve varsa aktif odayı yükle (Reconnection)
  useEffect(() => {
    const existing = getSavedPlayerSession();
    if (existing) {
      setSession(existing);
      if (existing.nickname) {
        setNickname(existing.nickname);
      }
      if (existing.roomCode) {
        const storedRoom = loadRoomStateFromStorage(existing.roomCode);
        if (storedRoom) {
          setSavedRoomCode(existing.roomCode);
        } else {
          void fetchAuthoritativeRoomFromSupabase(existing.roomCode).then((cloudRoom) => {
            if (cloudRoom) {
              saveRoomStateToStorage(cloudRoom);
              setSavedRoomCode(existing.roomCode!);
            }
          });
        }
      }
    }
  }, []);

  // Oda değiştiğinde Realtime + BroadcastChannel senkronizasyonunu bağla
  useEffect(() => {
    if (!roomState?.roomCode || !session?.playerId) return;

    const manager = new MultiplayerSyncManager(roomState.roomCode, session.playerId);
    manager.connect();

    const unsubscribe = manager.subscribe((nextAuthState, nextClientView) => {
      setRoomState(nextAuthState);
      if (onStateUpdated) {
        onStateUpdated(nextAuthState, nextClientView);
      }
      if (nextAuthState.status === 'playing' && onGameStarted) {
        onGameStarted(nextAuthState, nextClientView, session);
      }
    });

    setSyncManager(manager);

    return () => {
      unsubscribe();
      manager.disconnect();
    };
  }, [roomState?.roomCode, session?.playerId]);

  const ensurePlayerSession = (): PlayerSession | null => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setErrorMessage('Lütfen oyuna başlamak için bir oyuncu adı girin.');
      return null;
    }
    const nextSession = createOrUpdatePlayerSession(trimmed, session?.playerId);
    setSession(nextSession);
    setErrorMessage(null);
    return nextSession;
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const activeSession = ensurePlayerSession();
    if (!activeSession) return;

    const settings: RoomSettings = {
      maxPlayers,
      useFirstGamePreset,
      metropolisFaceMode,
      turnTimeoutSeconds,
    };

    const result = createAuthoritativeRoom(activeSession, settings);
    if (!result.ok || !result.state) {
      setErrorMessage(result.error || 'Oda oluşturulurken bir hata oluştu.');
      return;
    }

    const updatedSession = savePlayerSession({
      ...activeSession,
      roomCode: result.state.roomCode,
    });
    setSession(updatedSession);
    setRoomState(result.state);
    setErrorMessage(null);
  };

  const handleJoinRoom = async (e: React.FormEvent, codeOverride?: string) => {
    e.preventDefault();
    const activeSession = ensurePlayerSession();
    if (!activeSession) return;

    const targetCode = (codeOverride || joinCodeInput).trim().toUpperCase();
    if (targetCode.length !== 6) {
      setErrorMessage('Lütfen 6 haneli geçerli bir oda kodu girin.');
      return;
    }

    let existingRoom = loadRoomStateFromStorage(targetCode);
    if (!existingRoom) {
      const cloudRoom = await fetchAuthoritativeRoomFromSupabase(targetCode);
      if (cloudRoom) {
        saveRoomStateToStorage(cloudRoom);
        existingRoom = cloudRoom;
      }
    }

    if (!existingRoom) {
      setErrorMessage(
        `${targetCode} kodlu aktif bir oda bulunamadı. Lütfen oda kodunu kontrol edin.`
      );
      return;
    }

    const joinRes = joinAuthoritativeRoom(existingRoom, activeSession);
    if (!joinRes.ok || !joinRes.state) {
      setErrorMessage(joinRes.error || 'Odaya katılırken bir hata oluştu.');
      return;
    }

    const updatedSession = savePlayerSession({
      ...activeSession,
      roomCode: joinRes.state.roomCode,
    });
    setSession(updatedSession);
    setRoomState(joinRes.state);
    setErrorMessage(null);

    const tempManager = new MultiplayerSyncManager(
      joinRes.state.roomCode,
      updatedSession.playerId
    );
    tempManager.connect();
    tempManager.broadcastState(joinRes.state);
    tempManager.disconnect();

    if (joinRes.state.status === 'playing' && onGameStarted) {
      onGameStarted(
        joinRes.state,
        toClientGameView(joinRes.state, updatedSession.playerId),
        updatedSession
      );
    }
  };

  const handleQuickAddTestPlayer = () => {
    if (!roomState || !syncManager) return;
    const nextSeatNum = roomState.players.length + 1;
    if (nextSeatNum > roomState.settings.maxPlayers) return;

    const testPlayer = {
      playerId: `player_test_${nextSeatNum}_${Date.now().toString(36).slice(-4)}`,
      nickname: `Test Oyuncu ${nextSeatNum}`,
    };

    const res = joinAuthoritativeRoom(roomState, testPlayer);
    if (res.ok && res.state) {
      syncManager.broadcastState(res.state);
      setErrorMessage(null);
    } else if (res.error) {
      setErrorMessage(res.error);
    }
  };

  const handleStartGame = () => {
    if (!roomState || !session || !syncManager) return;
    const res = startAuthoritativeGame(roomState, session.playerId);
    if (!res.ok || !res.state) {
      setErrorMessage(res.error || 'Oyun başlatılamadı.');
      return;
    }
    syncManager.broadcastState(res.state);
    if (onGameStarted) {
      onGameStarted(
        res.state,
        toClientGameView(res.state, session.playerId),
        session
      );
    }
  };

  const handleCopyRoomCode = () => {
    if (!roomState?.roomCode) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(roomState.roomCode).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isHost =
    roomState && session && roomState.players[0]?.playerId === session.playerId;

  // BEKLEME ODASI EKRANI (Waiting Room)
  if (roomState && roomState.status === 'waiting') {
    const canStart = roomState.players.length >= 3 && roomState.players.length <= 4;

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#3a0404] via-[#220305] to-[#120203] text-amber-50 p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-4xl w-full bg-[#240203]/90 border-2 border-amber-400/40 rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] p-6 md:p-8 backdrop-blur-md">
          {/* Üst Başlık ve Oda Kodu */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-amber-400/25">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/40 mb-2 shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
                Catan Kart Oyunu • Bekleme Odası
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-amber-100">
                Oda Hazırlığı ({roomState.players.length}/{roomState.settings.maxPlayers} Oyuncu)
              </h1>
            </div>

            <div className="flex items-center gap-3 bg-[#160102]/90 border border-amber-400/50 px-4 py-3 rounded-xl shadow-inner">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-amber-400/80 font-medium">
                  Oda Kodu
                </div>
                <div className="text-2xl font-mono font-extrabold tracking-widest text-amber-300">
                  {roomState.roomCode}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyRoomCode}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold transition cursor-pointer"
                title="Oda Kodunu Kopyala"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300 font-medium">Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-amber-300" />
                    <span>Kopyala</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-4 p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-sm">
              {errorMessage}
            </div>
          )}

          {/* Oyuncu Koltukları (3 veya 4 Kişilik Oyuncu Listesi) */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: roomState.settings.maxPlayers }).map((_, idx) => {
              const player = roomState.players[idx];
              const isMe = player?.playerId === session?.playerId;

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border transition flex items-center justify-between ${
                    player
                      ? isMe
                        ? 'bg-amber-900/30 border-amber-400/60 shadow-sm'
                        : 'bg-stone-800/70 border-stone-700'
                      : 'bg-stone-950/40 border-dashed border-stone-700/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        player
                          ? 'bg-amber-500 text-stone-950'
                          : 'bg-stone-800 text-stone-500'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      {player ? (
                        <>
                          <div className="font-semibold text-amber-100 flex items-center gap-2">
                            {player.nickname}
                            {idx === 0 && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Crown className="w-3 h-3" /> Kurucu
                              </span>
                            )}
                            {isMe && (
                              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                                Sen
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-400 flex items-center gap-1.5 mt-0.5">
                            {player.isConnected ? (
                              <>
                                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-300">Hazır</span>
                              </>
                            ) : (
                              <>
                                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-amber-300">Yeniden bağlanıyor...</span>
                              </>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium text-stone-400">
                            Boş Koltuk #{idx + 1}
                          </div>
                          <div className="text-xs text-stone-500">
                            Oyuncu bekleniyor...
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Seçili Oda Kuralları Özeti */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-stone-950/60 p-4 rounded-xl border border-stone-800 text-xs">
            <div>
              <span className="text-stone-400 block mb-0.5">Oyuncu Kapasitesi</span>
              <span className="font-semibold text-amber-200">
                {roomState.settings.maxPlayers} Kişilik Oda
              </span>
            </div>
            <div>
              <span className="text-stone-400 block mb-0.5">Oyun Modu</span>
              <span className="font-semibold text-amber-200">
                {roomState.settings.useFirstGamePreset && roomState.settings.metropolisFaceMode === 'A'
                  ? 'İlk Kez Oynuyorum (Dengeli Market + A Yüzü)'
                  : 'Daha Önce Oynadım (Rastgele Market + B Yüzü)'}
              </span>
            </div>
            <div>
              <span className="text-stone-400 block mb-0.5">Tur Süresi</span>
              <span className="font-semibold text-amber-200">
                {roomState.settings.turnTimeoutSeconds === 0
                  ? 'Süresiz'
                  : `${roomState.settings.turnTimeoutSeconds} Saniye`}
              </span>
            </div>
          </div>

          {/* Alt Aksiyon Butonları */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {roomState.players.length < roomState.settings.maxPlayers && (
                <button
                  type="button"
                  onClick={handleQuickAddTestPlayer}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-200 text-sm font-medium border border-amber-500/30 transition cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Hızlı Oyuncu Ekle (Test)
                </button>
              )}
              <button
                type="button"
                onClick={() => setRoomState(null)}
                className="px-4 py-2.5 rounded-xl bg-stone-800/60 hover:bg-stone-800 text-stone-300 text-sm transition cursor-pointer"
              >
                Lobiye Dön
              </button>
            </div>

            {isHost ? (
              <button
                type="button"
                disabled={!canStart}
                onClick={handleStartGame}
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm shadow-lg transition ${
                  canStart
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-stone-950 cursor-pointer'
                    : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                {canStart
                  ? 'Oyunu Başlat'
                  : `Oyunu Başlat (En az 3 oyuncu gerekli: ${roomState.players.length}/3)`}
              </button>
            ) : (
              <div className="text-sm text-amber-300/90 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Oda kurucusunun oyunu başlatması bekleniyor...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // LOBİ GİRİŞ, ODA KURMA VE ODAYA KATILMA EKRANI
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#3a0404] via-[#220305] to-[#120203] text-amber-50 p-4 md:p-8 flex items-center justify-center">
      <div className="max-w-5xl w-full space-y-6">
        {/* Başlık & Dekoratif Kart Yelpazesi */}
        <div className="text-center space-y-2.5">
          <div className="flex items-center justify-center gap-1.5 mb-1 select-none" aria-hidden="true">
            <img
              src="/cards/resource/resource_wheat.png"
              alt=""
              className="w-7 h-10 rounded-md border border-amber-300/70 shadow-md -rotate-12 translate-y-1 object-cover"
            />
            <img
              src="/cards/building/building_settlement.png"
              alt=""
              className="w-8 h-11 rounded-md border-2 border-amber-400 shadow-lg z-10 object-cover"
            />
            <img
              src="/cards/resource/resource_ore.png"
              alt=""
              className="w-7 h-10 rounded-md border border-amber-300/70 shadow-md rotate-12 translate-y-1 object-cover"
            />
          </div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-semibold shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            120 Kartlık Kutu Oyunu • Çok Oyunculu Lobi
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-amber-100 drop-shadow">
            CATAN KART OYUNU
          </h1>
          <p className="text-sm md:text-base text-amber-100/80 max-w-xl mx-auto">
            Oyuncu adınızı belirleyin, 3-4 kişilik yeni oda kurun veya oda koduyla arkadaşlarınıza katılın.
          </p>
        </div>

        {/* Yeniden Bağlanma (Reconnection) Bildirimi */}
        {savedRoomCode && (
          <div className="bg-emerald-950/85 border border-emerald-400/50 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-sm">
                <span className="font-bold text-emerald-200">
                  Aktif Oda Oturumu Bulundu ({savedRoomCode}):
                </span>{' '}
                <span className="text-emerald-100/90">
                  Bağlantınız koptuysa veya sayfayı yenilediyseniz kaldığınız yerden devam edebilirsiniz.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => handleJoinRoom(e, savedRoomCode)}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs shrink-0 transition cursor-pointer"
            >
              Odaya Yeniden Bağlan ({savedRoomCode})
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-950/90 border border-red-500/50 text-red-200 text-sm font-medium">
            {errorMessage}
          </div>
        )}

        {/* Oyuncu Adı Giriş Barı */}
        <div className="bg-[#240203]/90 border-2 border-amber-400/35 rounded-2xl p-5 shadow-xl">
          <label className="block text-xs font-bold uppercase tracking-wider text-amber-300 mb-2 flex items-center gap-1.5">
            <User className="w-4 h-4 text-amber-400" />
            Oyuncu Adınız
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={nickname}
                onChange={(e) => {
                  const val = e.target.value;
                  setNickname(val);
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem('catan_player_name', val.trim());
                  }
                }}
                placeholder="Oyunda görünecek adınızı yazın (Örn: Barbaros, Kaptan...)"
                maxLength={24}
                className="w-full px-4 py-3 rounded-xl bg-[#140102] border border-amber-400/30 focus:border-amber-400 focus:outline-none text-amber-100 placeholder-stone-500 font-medium"
              />
            </div>
            {session?.playerId && (
              <div className="flex items-center gap-2 text-xs text-amber-200/80 px-3 py-2 rounded-xl bg-[#140102]/80 border border-amber-400/20 shrink-0">
                <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Oyuncu ID:{' '}
                  <strong className="text-amber-200 font-mono">
                    {session.playerId.slice(0, 8)}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* İki Sütun: Yeni Oda Kur & Mevcut Odaya Katıl */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sol: Oda Kurma Formu */}
          <form
            onSubmit={handleCreateRoom}
            className="lg:col-span-7 bg-[#240203]/90 border-2 border-amber-400/35 rounded-2xl p-6 shadow-xl space-y-5"
          >
            <div className="flex items-center gap-2.5 border-b border-amber-400/20 pb-3">
              <PlusCircle className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-amber-100">
                Yeni Oda Kur
              </h2>
            </div>

            {/* Oyuncu Sayısı: 3 veya 4 */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-300 mb-2 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-400" />
                Oyuncu Sayısı
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([3, 4] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setMaxPlayers(count)}
                    className={`py-2.5 px-4 rounded-xl font-semibold text-sm border transition cursor-pointer ${
                      maxPlayers === count
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    {count} Kişilik Oda
                  </button>
                ))}
              </div>
            </div>

            {/* Oyun Seviyesi / Kural Modu Seçimi (Tek ve Sade 2 Seçenekli Kart) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-300 mb-2 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-400" />
                Oyun Seviyesi ve Kurallar
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Seçenek 1: İlk Kez Oynuyorum */}
                <button
                  type="button"
                  onClick={() => {
                    setUseFirstGamePreset(true);
                    setMetropolisFaceMode('A');
                  }}
                  className={`p-4 rounded-xl text-left border-2 transition relative flex flex-col justify-between cursor-pointer ${
                    useFirstGamePreset && metropolisFaceMode === 'A'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-lg'
                      : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700 hover:bg-stone-900/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-amber-200">
                        İlk Kez Oynuyorum
                      </span>
                      {useFirstGamePreset && metropolisFaceMode === 'A' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-stone-950">
                          <Check className="w-3 h-3 stroke-[3]" /> Seçili
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-amber-100/90 font-medium mb-2.5">
                      Yeni Başlayanlar İçin Dengeli Kurallar
                    </div>
                    <ul className="text-[11px] text-stone-300 space-y-1.5">
                      <li className="flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1 shrink-0" />
                        <span><strong>Dengeli Pazar:</strong> 2 Köy, 1 Şövalye, 1 Yol, 1 Şehir</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1 shrink-0" />
                        <span><strong>A Yüzü Büyükşehirler:</strong> Üretimde +2 Kaynak kartı</span>
                      </li>
                    </ul>
                  </div>
                </button>

                {/* Seçenek 2: Daha Önce Oynadım */}
                <button
                  type="button"
                  onClick={() => {
                    setUseFirstGamePreset(false);
                    setMetropolisFaceMode('B');
                  }}
                  className={`p-4 rounded-xl text-left border-2 transition relative flex flex-col justify-between cursor-pointer ${
                    !useFirstGamePreset && metropolisFaceMode === 'B'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-lg'
                      : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700 hover:bg-stone-900/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-amber-200">
                        Daha Önce Oynadım
                      </span>
                      {!useFirstGamePreset && metropolisFaceMode === 'B' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-stone-950">
                          <Check className="w-3 h-3 stroke-[3]" /> Seçili
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-amber-100/90 font-medium mb-2.5">
                      Deneyimli Oyuncular İçin Taktiksel Mod
                    </div>
                    <ul className="text-[11px] text-stone-300 space-y-1.5">
                      <li className="flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1 shrink-0" />
                        <span><strong>Rastgele Pazar:</strong> 120 kartlık desteden dinamik açılış</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1 shrink-0" />
                        <span><strong>B Yüzü Büyükşehirler:</strong> +1 Kaynak ve özel güçler</span>
                      </li>
                    </ul>
                  </div>
                </button>
              </div>
            </div>

            {/* Tur Süresi Sayacı: Süresiz / 60sn / 90sn */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-300 mb-2 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                Tur Süresi Sayacı
              </label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: 0, label: 'Süresiz' },
                  { value: 60, label: '60 Saniye' },
                  { value: 90, label: '90 Saniye' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTurnTimeoutSeconds(opt.value)}
                    className={`py-2.5 px-3 rounded-xl font-semibold text-xs border transition cursor-pointer ${
                      turnTimeoutSeconds === opt.value
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-stone-950/60 border-stone-800 text-stone-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-stone-950 font-bold text-sm shadow-lg transition cursor-pointer"
            >
              Odayı Oluştur ve Bekleme Odasına Geç
            </button>
          </form>

          {/* Sağ: Oda Kodu ile Katıl */}
          <form
            onSubmit={handleJoinRoom}
            className="lg:col-span-5 bg-[#240203]/90 border-2 border-amber-400/35 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-6"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 border-b border-amber-400/20 pb-3">
                <LogIn className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-amber-100">
                  Oda Kodu ile Katıl
                </h2>
              </div>

              <p className="text-xs text-amber-100/80 leading-relaxed">
                Arkadaşınızın kurduğu 3 veya 4 kişilik odaya katılmak için 6 haneli oda kodunu
                aşağıya girin. Bağlantınız koparsa aynı kodla kaldığınız yerden devam
                edebilirsiniz.
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-amber-200/90 mb-2">
                  6 Haneli Oda Kodu
                </label>
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="ÖRN: CAT123"
                  maxLength={6}
                  className="w-full px-4 py-3.5 rounded-xl bg-[#140102] border border-amber-400/35 focus:border-amber-400 focus:outline-none text-amber-200 font-mono text-xl tracking-widest text-center uppercase"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl bg-[#3b0404] hover:bg-amber-500 hover:text-stone-950 text-amber-200 border border-amber-400/40 font-bold text-sm transition cursor-pointer shadow"
            >
              Mevcut Odaya Katıl
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LobbyView;