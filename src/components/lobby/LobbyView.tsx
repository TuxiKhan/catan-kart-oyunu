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
  createOrUpdateGuestSession,
  getSavedGuestSession,
  GuestSession,
  joinAuthoritativeRoom,
  loadRoomStateFromStorage,
  MultiplayerSyncManager,
  saveGuestSession,
  startAuthoritativeGame,
  toClientGameView,
} from '@/lib/multiplayer/syncManager';
import {
  Check,
  Clock,
  Copy,
  Crown,
  LogIn,
  Play,
  PlusCircle,
  RefreshCw,
  Shield,
  Sparkles,
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
    session: GuestSession
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
  const [session, setSession] = useState<GuestSession | null>(null);
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

  // Sayfa yüklendiğinde mevcut misafir oturumunu ve varsa son odayı kontrol et (Reconnection)
  useEffect(() => {
    const existing = getSavedGuestSession();
    if (existing) {
      setSession(existing);
      setNickname(existing.nickname);
      if (existing.roomCode) {
        const storedRoom = loadRoomStateFromStorage(existing.roomCode);
        if (storedRoom) {
          setSavedRoomCode(existing.roomCode);
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

  const ensureGuestSession = (): GuestSession | null => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setErrorMessage('Lütfen oyuna girmek için bir Takma Ad (Nickname) yazın.');
      return null;
    }
    const nextSession = createOrUpdateGuestSession(trimmed, session?.playerId);
    setSession(nextSession);
    setErrorMessage(null);
    return nextSession;
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const activeSession = ensureGuestSession();
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

    const updatedSession = saveGuestSession({
      ...activeSession,
      roomCode: result.state.roomCode,
    });
    setSession(updatedSession);
    setRoomState(result.state);
    setErrorMessage(null);
  };

  const handleJoinRoom = (e: React.FormEvent, codeOverride?: string) => {
    e.preventDefault();
    const activeSession = ensureGuestSession();
    if (!activeSession) return;

    const targetCode = (codeOverride || joinCodeInput).trim().toUpperCase();
    if (targetCode.length !== 6) {
      setErrorMessage('Lütfen 6 haneli geçerli bir oda kodu girin.');
      return;
    }

    const existingRoom = loadRoomStateFromStorage(targetCode);
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

    const updatedSession = saveGuestSession({
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

    const testGuest = {
      playerId: `test_player_${nextSeatNum}_${Date.now().toString(36).slice(-3)}`,
      nickname: `Test Oyuncu ${nextSeatNum}`,
    };

    const res = joinAuthoritativeRoom(roomState, testGuest);
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
      <div className="min-h-screen bg-gradient-to-br from-amber-950 via-stone-900 to-amber-900 text-amber-50 p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-4xl w-full bg-stone-900/90 border border-amber-500/30 rounded-2xl shadow-2xl p-6 md:p-8 backdrop-blur-md">
          {/* Üst Başlık ve Oda Kodu */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-amber-500/20">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                Catan Kart Oyunu • Bekleme Odası
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-amber-100">
                Oda Hazırlığı ({roomState.players.length}/{roomState.settings.maxPlayers} Oyuncu)
              </h1>
            </div>

            <div className="flex items-center gap-3 bg-stone-950/80 border border-amber-500/40 px-4 py-3 rounded-xl">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-amber-400/80">
                  6 Haneli Oda Kodu
                </div>
                <div className="text-2xl font-mono font-extrabold tracking-widest text-amber-300">
                  {roomState.roomCode}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyRoomCode}
                className="p-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 transition"
                title="Oda Kodunu Kopyala"
              >
                {copiedCode ? (
                  <Check className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-4 p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-sm">
              {errorMessage}
            </div>
          )}

          {/* Oyuncu Koltukları (3 veya 4 Kişilik) */}
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
                        ? 'bg-amber-900/30 border-amber-400/60'
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
                              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                                Sen
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-400 flex items-center gap-1.5 mt-0.5">
                            {player.isConnected ? (
                              <>
                                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-300">Çevrimiçi • Hazır</span>
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
                            Oyuncu katılması bekleniyor...
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
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-950/60 p-4 rounded-xl border border-stone-800 text-xs">
            <div>
              <span className="text-stone-400 block">Oyuncu Kapasitesi</span>
              <span className="font-semibold text-amber-200">
                {roomState.settings.maxPlayers} Kişilik
              </span>
            </div>
            <div>
              <span className="text-stone-400 block">İlk Oyun Dizilimi</span>
              <span className="font-semibold text-amber-200">
                {roomState.settings.useFirstGamePreset
                  ? 'Açık (2 Köy, 1 Şövalye, 1 Yol, 1 Şehir)'
                  : 'Kapalı (Rastgele Market)'}
              </span>
            </div>
            <div>
              <span className="text-stone-400 block">Büyükşehir Modu</span>
              <span className="font-semibold text-amber-200">
                {roomState.settings.metropolisFaceMode === 'A'
                  ? 'A Yüzü (+2 Kaynak)'
                  : 'B Yüzü (Özel Yetenek)'}
              </span>
            </div>
            <div>
              <span className="text-stone-400 block">Tur Süresi</span>
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
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-200 text-sm font-medium border border-amber-500/30 transition"
                >
                  <UserPlus className="w-4 h-4" />
                  Hızlı Test Oyuncusu Ekle ({roomState.players.length + 1}/
                  {roomState.settings.maxPlayers})
                </button>
              )}
              <button
                type="button"
                onClick={() => setRoomState(null)}
                className="px-4 py-2.5 rounded-xl bg-stone-800/60 hover:bg-stone-800 text-stone-300 text-sm transition"
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
                  ? 'Oyunu Başlat (120 Kart)'
                  : `En Az 3 Oyuncu Gerekli (${roomState.players.length}/3)`}
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
    <div className="min-h-screen bg-gradient-to-br from-amber-950 via-stone-900 to-amber-900 text-amber-50 p-4 md:p-8 flex items-center justify-center">
      <div className="max-w-5xl w-full space-y-6">
        {/* Başlık */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            120 Kartlık Kutu Oyunu • Çok Oyunculu Lobi
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-amber-100">
            CATAN KART OYUNU
          </h1>
          <p className="text-sm md:text-base text-stone-300 max-w-xl mx-auto">
            Kayıt veya şifre olmadan takma adınızla anında giriş yapın, 3-4 kişilik oda kurun
            veya oda koduyla arkadaşlarınıza katılın.
          </p>
        </div>

        {/* Yeniden Bağlanma (Reconnection) Bildirimi */}
        {savedRoomCode && (
          <div className="bg-emerald-950/80 border border-emerald-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
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
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs shrink-0 transition"
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

        {/* Misafir Kimliği (Takma Ad) Barı */}
        <div className="bg-stone-900/90 border border-amber-500/30 rounded-2xl p-5 shadow-xl">
          <label className="block text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
            1. Misafir Oyuncu Takma Adınız (Hızlı Giriş)
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Örn: Barbaros, Kaptan, Tüccar..."
                maxLength={24}
                className="w-full px-4 py-3 rounded-xl bg-stone-950 border border-stone-700 focus:border-amber-400 focus:outline-none text-amber-100 placeholder-stone-500 font-medium"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-400 px-3 py-2 rounded-xl bg-stone-950/60 border border-stone-800">
              <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Misafir Kimliği:{' '}
                <strong className="text-amber-200 font-mono">
                  {session?.playerId ? session.playerId.slice(0, 12) : 'Otomatik'}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* İki Sütun: Yeni Oda Kur & Mevcut Odaya Katıl */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sol: Oda Kurma Formu (RoomSettings) */}
          <form
            onSubmit={handleCreateRoom}
            className="lg:col-span-7 bg-stone-900/90 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-5"
          >
            <div className="flex items-center gap-2.5 border-b border-stone-800 pb-3">
              <PlusCircle className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-amber-100">
                Yeni Oda Kur (Oda Ayarları)
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
                    className={`py-2.5 px-4 rounded-xl font-semibold text-sm border transition ${
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

            {/* İlk Oyun Dizilimi */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-300 mb-2">
                İlk Oyun Market Dizilimi (2 Köy, 1 Şövalye, 1 Yol, 1 Şehir)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setUseFirstGamePreset(true)}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs border transition ${
                    useFirstGamePreset
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-stone-950/60 border-stone-800 text-stone-400'
                  }`}
                >
                  Açık (Önerilen İlk Oyun)
                </button>
                <button
                  type="button"
                  onClick={() => setUseFirstGamePreset(false)}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs border transition ${
                    !useFirstGamePreset
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-stone-950/60 border-stone-800 text-stone-400'
                  }`}
                >
                  Kapalı (Tamamen Rastgele)
                </button>
              </div>
            </div>

            {/* Büyükşehir Modu: A Yüzü / B Yüzü */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-300 mb-2 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-amber-400" />
                Büyükşehir Kartları Modu
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMetropolisFaceMode('A')}
                  className={`p-3 rounded-xl text-left border transition ${
                    metropolisFaceMode === 'A'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-100'
                      : 'bg-stone-950/60 border-stone-800 text-stone-400'
                  }`}
                >
                  <div className="font-bold text-xs">A Yüzü (Standart Kural)</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Üretim aşamasında +2 Kaynak kartı verir.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMetropolisFaceMode('B')}
                  className={`p-3 rounded-xl text-left border transition ${
                    metropolisFaceMode === 'B'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-100'
                      : 'bg-stone-950/60 border-stone-800 text-stone-400'
                  }`}
                >
                  <div className="font-bold text-xs">B Yüzü (Plug-and-Play)</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    +1 Kaynak ve özel Büyükşehir yeteneği sunar.
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
                    className={`py-2.5 px-3 rounded-xl font-semibold text-xs border transition ${
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
            className="lg:col-span-5 bg-stone-900/90 border border-amber-500/30 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-6"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 border-b border-stone-800 pb-3">
                <LogIn className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-amber-100">
                  Oda Kodu ile Katıl
                </h2>
              </div>

              <p className="text-xs text-stone-300 leading-relaxed">
                Arkadaşınızın kurduğu 3 veya 4 kişilik odaya katılmak için 6 haneli oda kodunu
                aşağıya girin. Bağlantınız koparsa aynı kodla kaldığınız yerden devam
                edebilirsiniz.
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-300 mb-2">
                  6 Haneli Oda Kodu
                </label>
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="ÖRN: CAT123"
                  maxLength={6}
                  className="w-full px-4 py-3.5 rounded-xl bg-stone-950 border border-stone-700 focus:border-amber-400 focus:outline-none text-amber-200 font-mono text-xl tracking-widest text-center uppercase"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-amber-200 border border-amber-500/40 font-bold text-sm transition cursor-pointer"
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
