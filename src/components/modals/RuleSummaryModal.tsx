'use client';

import React from 'react';
import { BookOpen, X, Trophy, Anchor, Sparkles, ShieldAlert } from 'lucide-react';

export interface RuleSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RuleSummaryModal: React.FC<RuleSummaryModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rule-summary-title"
    >
      <div className="relative w-full max-w-3xl rounded-2xl border-2 border-amber-400/70 bg-gradient-to-b from-stone-900 via-stone-950 to-black text-amber-50 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Başlık */}
        <div className="flex items-center justify-between px-4 py-3 bg-amber-950/80 border-b border-amber-500/30">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <h2 id="rule-summary-title" className="text-base md:text-lg font-extrabold text-amber-100">
              Catan Kart Oyunu — Kural Özeti & Yapı Maliyetleri (4x Özet Kartı)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* İçerik Gövdesi */}
        <div className="p-4 md:p-5 overflow-y-auto space-y-5 text-xs md:text-sm">
          {/* 1. Tur Sırası ve Zafer Koşulu */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-stone-900/90 border border-amber-500/30 p-3">
              <h3 className="font-bold text-amber-300 flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-4 h-4" /> Tur Akışı (2 Aşama)
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-stone-200">
                <li>
                  <strong>Üretim:</strong> Aktif oyuncudan başlayarak saat yönünde herkes <strong>1 Kaynak kartı</strong> çeker. Aktif oyuncu, önündeki her görünür <strong>Şehir için +1</strong>, her <strong>Büyükşehir (A yüzü) için +2</strong> (B yüzü ise +1 ve özel güç) fazladan Kaynak kartı çeker.
                </li>
                <li>
                  <strong>İnşaat & Ticaret:</strong> İstenildiği kadar yapı inşa edilebilir; turda <strong>en fazla 1 kez</strong> Liman Takası ve <strong>en fazla 1 kez</strong> Oyuncu Takası yapılabilir.
                </li>
              </ol>
            </div>

            <div className="rounded-xl bg-stone-900/90 border border-yellow-500/30 p-3">
              <h3 className="font-bold text-yellow-300 flex items-center gap-1.5 mb-1.5">
                <Trophy className="w-4 h-4" /> Oyun Sonu (7 Zafer Puanı)
              </h3>
              <p className="text-stone-200 leading-relaxed">
                Kendi turunda <strong>7 Zafer Puanına (ZP)</strong> ulaşan ilk oyuncu oyunu anında kazanır!
                <br />
                <span className="text-amber-300 font-semibold">En Uzun Yol (2 ZP):</span> En az 3 Yola (İlk Yol dahil) ulaşan alır.
                <br />
                <span className="text-rose-300 font-semibold">En Güçlü Ordu (2 ZP):</span> En az 2 Şövalyeye ulaşan alır.
              </p>
            </div>
          </div>

          {/* 2. Yapı Maliyetleri ve Etkileri Tablosu */}
          <div className="rounded-xl bg-stone-900/90 border border-amber-500/30 overflow-hidden">
            <div className="bg-amber-950/60 px-3 py-2 font-bold text-amber-200 border-b border-amber-500/20">
              İnşaat Maliyetleri, Zafer Puanları ve Etkileri
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-amber-300/90 text-[11px] uppercase">
                    <th className="py-2 px-3">Yapı</th>
                    <th className="py-2 px-3">Maliyet</th>
                    <th className="py-2 px-3">Puan</th>
                    <th className="py-2 px-3">Üretim & Özel Etki</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-stone-200">
                  <tr>
                    <td className="py-2 px-3 font-bold text-amber-200">Yol</td>
                    <td className="py-2 px-3">1 Tuğla + 1 Odun</td>
                    <td className="py-2 px-3">0 ZP</td>
                    <td className="py-2 px-3">Üst üste dizilir. Liman takası oranını iyileştirir (4:1 → 1:1).</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-bold text-orange-300">Köy</td>
                    <td className="py-2 px-3">1 Tuğla + 1 Odun + 1 Yün + 1 Buğday</td>
                    <td className="py-2 px-3 font-bold text-yellow-300">1 ZP</td>
                    <td className="py-2 px-3">1 ZP • Olay Kartı Tetikler (Hasat Kutlamaları olayında görünür Köy başına +1 kaynak verir).</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-bold text-indigo-300">Şehir</td>
                    <td className="py-2 px-3">2 Buğday + 3 Demir</td>
                    <td className="py-2 px-3 font-bold text-yellow-300">2 ZP</td>
                    <td className="py-2 px-3">2 ZP • Üretimde +1 Kaynak • Köye Kapanır (Alttaki Köy artık puan vermez, net +1 ZP).</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-bold text-purple-300">Büyükşehir</td>
                    <td className="py-2 px-3">3 Yün + 1 Demir</td>
                    <td className="py-2 px-3 font-bold text-yellow-300">3 ZP</td>
                    <td className="py-2 px-3">3 ZP • Üretimde +2 Kaynak • Şehre Kapanır (Alttaki Şehir artık puan vermez, net +1 ZP).</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-bold text-rose-300">Şövalye</td>
                    <td className="py-2 px-3">1 Yün + 1 Buğday + 1 Demir</td>
                    <td className="py-2 px-3">0 ZP</td>
                    <td className="py-2 px-3">0 ZP • Hırsız Limitini +1 Artırır & Ordu Gücü (Üst üste dizilir).</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Liman Oranları & 5 Olay Kartı */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-stone-900/90 border border-amber-500/30 p-3">
              <h3 className="font-bold text-amber-300 flex items-center gap-1.5 mb-2">
                <Anchor className="w-4 h-4" /> Yol (Liman Etkisi) Oranları
              </h3>
              <p className="text-stone-300 text-xs mb-2">
                Turda 1 kez, aynı türden kaynakları ıskartaya atıp çekme veya ıskarta destesinden <strong>istediğiniz 1 kaynağı seçerek</strong> alabilirsiniz:
              </p>
              <ul className="space-y-1 text-stone-200 text-xs">
                <li>• <strong>1 Yol (İlk Yol):</strong> 4 aynı kaynak ver → 1 istediğin kaynak al (4:1)</li>
                <li>• <strong>2 Yol:</strong> 3 aynı kaynak ver → 1 istediğin kaynak al (3:1)</li>
                <li>• <strong>3 Yol:</strong> 2 aynı kaynak ver → 1 istediğin kaynak al (2:1)</li>
                <li>• <strong>4+ Yol:</strong> 1 kaynak ver → 1 istediğin kaynak al (1:1)</li>
              </ul>
            </div>

            <div className="rounded-xl bg-stone-900/90 border border-red-500/30 p-3">
              <h3 className="font-bold text-red-300 flex items-center gap-1.5 mb-2">
                <ShieldAlert className="w-4 h-4" /> Olay Kartları (Köy Alındığında)
              </h3>
              <ul className="space-y-1 text-stone-200 text-xs">
                <li>• <strong>Hırsız (3x):</strong> Elinde <code>7 + (Şövalye Sayısı)</code> değerinden fazla kaynak kartı olan tüm oyuncular, ellerindeki kaynakların yarısını (aşağı yuvarlanarak) seçerek ıskartaya atar.</li>
                <li>• <strong>Sadaka (1x):</strong> En çok ZP&apos;ye sahip oyuncu(lar), kendisinden daha az puanı olan bir oyuncuya elinden 1 kaynak kartı verir.</li>
                <li>• <strong>Teşvik (1x):</strong> <em>En Uzun Yol</em> ve <em>En Güçlü Ordu</em> kartlarına sahip olmayan tüm oyuncular desteden <strong>2&apos;şer kaynak</strong> çeker.</li>
                <li>• <strong>Hasat Kutlamaları (1x):</strong> Tüm oyuncular, önlerindeki her <strong>görünür Köy</strong> (üzerine Şehir kapatılmamış) için desteden <strong>1 kaynak kartı</strong> çeker.</li>
                <li>• <strong>Yeni Yıl (1x):</strong> Herkes <strong>1 kaynak kartı çeker</strong>. Ardından tüm Olay kartları (ıskarta dahil) toplanıp yeniden karıştırılarak yeni Olay destesi oluşturulur.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Alt Kapat Butonu */}
        <div className="px-4 py-3 bg-stone-950 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-xs md:text-sm cursor-pointer"
          >
            Anladım, Oyuna Dön
          </button>
        </div>
      </div>
    </div>
  );
};
