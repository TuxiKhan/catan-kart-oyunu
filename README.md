# 🏝️ Catan Kart Oyunu — Online Multiplayer (3-4 Oyuncu)

120 kartlık **Catan Kart Oyunu** kutu oyunu kurallarına birebir sadık kalınarak **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (PostgreSQL, RLS, Realtime)** mimarisiyle geliştirilmiş çevrimiçi çok oyunculu web ve mobil uygulaması.

---

## 🚀 Hızlı Başlangıç

```bash
cd C:\A\kode\catan
npm.cmd install
npm.cmd run dev
```

Tarayıcıda `http://localhost:3000` adresini açarak:
- **Misafir Girişi (Takma Ad)** ile anında oda kurabilir veya 6 haneli oda koduyla katılabilirsiniz.
- `.env.local` dosyasında Supabase bağlantı bilgileri tanımlandığında **Supabase Realtime** üzerinden, tanımlanmadığında ise otomatik olarak **Çoklu Sekme (`BroadcastChannel` + `localStorage`)** ve üst bardaki **Görünüm (RLS Test) Perspektif Değiştirici** üzerinden 3 veya 4 oyuncuyu anında test edebilirsiniz.

### Birim ve Kural Denetim Testlerini Çalıştırma

```bash
npm.cmd test
```
* **Toplam:** 4 Test Paketi (`db-schema`, `game-engine`, `multiplayer-trade`, `qa-rulebook-audit`) — **53/53 Test Başarılı**.

---

## 🖼️ Kart Görselleri Geldiğinde Nasıl Eklenecek?

Tüm kartlar şu anda vektörel (SVG/CSS) Placeholder olarak çalışmaktadır. Kart görselleri geldiğinde sadece [`src/components/cards/CardVisual.tsx`](./src/components/cards/CardVisual.tsx) içindeki `CUSTOM_CARD_IMAGE_MAP` tablosuna dosya yollarını eklemeniz yeterlidir:

```ts
export const CUSTOM_CARD_IMAGE_MAP: Partial<Record<string, string>> = {
  'resource:brick': '/cards/brick.png',
  'resource:wood': '/cards/wood.png',
  'resource:wool': '/cards/wool.png',
  'resource:wheat': '/cards/wheat.png',
  'resource:ore': '/cards/ore.png',
  'structure:road': '/cards/road.png',
  'structure:settlement': '/cards/settlement.png',
  'structure:city': '/cards/city.png',
  'structure:metropolis': '/cards/metropolis.png',
  'structure:knight': '/cards/knight.png',
  // ...
};
```

## 🏛️ Büyükşehir B Yüzü Yetenekleri Geldiğinde Nasıl Eklenecek?

[`src/lib/engine/metropolisRegistry.ts`](./src/lib/engine/metropolisRegistry.ts) içerisindeki `registerMetropolisBEffect` fonksiyonu ile 4 farklı B yüzü kartının özel yeteneği oyun motoruna dokunmadan plug-and-play olarak kaydedilebilir.
