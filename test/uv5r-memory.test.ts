/**
 * Testy kodowania pamieci UV-5R.
 *
 * Kazdy z nich pilnuje czegos, co przy pomylce konczy sie zle zaprogramowanym
 * albo zablokowanym radiem u klienta - dlatego sprawdzamy konkretne bajty,
 * a nie to, czy funkcja "cos zwrocila".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeChannel,
  decodeChannel,
  encodeName,
  decodeName,
  writeChannelsIntoImage,
  MAIN_MEMORY_SIZE,
  CHANNELS_ADDR,
  NAMES_ADDR,
  type Channel,
} from '../src/radio/uv5r-memory.ts';
import {
  PMR446,
  LPD433,
  FREENET,
  FRS_GMRS,
  MURS,
  setsForCountry,
  countChannels,
} from '../src/data/bands.ts';
import { buildChannels } from '../src/data/build-channels.ts';
import { localServiceSets, nationalServiceSets, placeGroups } from '../src/data/services.ts';
import { formatFreq } from '../src/i18n/index.ts';

const base: Channel = {
  rxFreq: 145_500_000,
  txFreq: 145_500_000,
  name: 'WYWOL',
  bandwidth: 'narrow',
  power: 'low',
  scan: true,
};

test('czestotliwosc zapisuje sie jako BCD little-endian w jednostkach 10 Hz', () => {
  // 145,500 MHz -> 14550000 -> cyfry BCD 14 55 00 00, bajt najmlodszy pierwszy.
  const buf = encodeChannel(base);
  assert.deepEqual([...buf.slice(0, 4)], [0x00, 0x00, 0x55, 0x14]);
});

test('kanal wylacznie odbiorczy ma nadajnik zablokowany wypelniaczem', () => {
  // Kreator takich kanalow nie tworzy, ale format je zna i uzytkownik moze miec je
  // w radiu z CHIRP-a. Bez tego odczyt zinterpretowalby 0xFFFFFFFF jako czestotliwosc.
  const buf = encodeChannel({ ...base, txFreq: null });
  assert.deepEqual([...buf.slice(4, 8)], [0xff, 0xff, 0xff, 0xff]);
});

test('kanal simpleksowy ma nadawanie rowne odbiorowi', () => {
  const buf = encodeChannel(base);
  assert.deepEqual([...buf.slice(0, 4)], [...buf.slice(4, 8)]);
});

test('odczyt odwraca zapis dla kanalu nadawczego i odbiorczego', () => {
  for (const txFreq of [145_500_000, null]) {
    const round = decodeChannel(encodeChannel({ ...base, txFreq }));
    assert.equal(round?.rxFreq, 145_500_000);
    assert.equal(round?.txFreq, txFreq);
  }
});

test('pusta pozycja w pamieci jest rozpoznawana jako brak kanalu', () => {
  // Radio zostawia 0xFF na pierwszym bajcie. Blad tutaj = program czyta smieci jako kanal.
  assert.equal(decodeChannel(new Uint8Array(16).fill(0xff)), null);
});

test('szerokosc kanalu i skanowanie trafiaja we wlasciwe bity', () => {
  const wide = encodeChannel({ ...base, bandwidth: 'wide', scan: false });
  assert.equal((wide[15]! >> 6) & 1, 1, 'bit szerokosci');
  assert.equal((wide[15]! >> 2) & 1, 0, 'bit skanowania');

  const narrow = encodeChannel({ ...base, bandwidth: 'narrow', scan: true });
  assert.equal((narrow[15]! >> 6) & 1, 0);
  assert.equal((narrow[15]! >> 2) & 1, 1);
});

test('nazwa dluzsza niz 7 znakow jest przycinana, a nie odrzucana', () => {
  // Radio ma na nazwe 7 znakow. Dluzsza rozjechalaby sie na kolejna pozycje w pamieci.
  const buf = encodeName('BARDZODLUGANAZWA');
  assert.equal(decodeName(buf), 'BARDZOD');
  assert.equal(buf.length, 16);
});

test('krotka nazwa jest dopelniona wypelniaczem', () => {
  const buf = encodeName('PMR 1');
  assert.equal(decodeName(buf), 'PMR 1');
  assert.equal(buf[7], 0xff);
});

test('zapis do obrazu trafia pod adresy kanalow i nazw', () => {
  const image = new Uint8Array(MAIN_MEMORY_SIZE).fill(0x00);
  writeChannelsIntoImage(image, [base]);

  assert.deepEqual([...image.slice(CHANNELS_ADDR, CHANNELS_ADDR + 4)], [0x00, 0x00, 0x55, 0x14]);
  assert.equal(decodeName(image.slice(NAMES_ADDR, NAMES_ADDR + 16)), 'WYWOL');
  // Pozycja druga musi zostac wyczyszczona, inaczej zostana tam stare kanaly uzytkownika.
  assert.equal(image[CHANNELS_ADDR + 16], 0xff);
});

test('krance tabel czestotliwosci zgadzaja sie ze zrodlem', () => {
  // czestotliwosci.pl.tl: PMR446 kanal 1 = 446,00625, kanal 16 = 446,19375;
  // LPD433 kanal 1 = 433,075, kanal 69 = 434,775.
  assert.equal(PMR446.channels[0]!.rx, 446_006_250);
  assert.equal(PMR446.channels[15]!.rx, 446_193_750);
  assert.equal(LPD433.channels[0]!.rx, 433_075_000);
  assert.equal(LPD433.channels[68]!.rx, 434_775_000);
});

test('kanaly buduja sie jako simpleksowe - nadawanie rowne odbiorowi', () => {
  // Nie blokujemy niczego. Uzytkownik decyduje, na czym nadaje, my tylko wpisujemy kanaly.
  const result = buildChannels([PMR446, LPD433]);
  assert.equal(result.channels.length, 85);
  assert.ok(result.channels.every((c) => c.txFreq === c.rxFreq));
  assert.equal(result.dropped, 0);
});

test('nadmiar kanalow jest obcinany do pojemnosci radia i zglaszany', () => {
  // Uzytkownik musi wiedziec, ze czesc sie nie zmiescila, inaczej bedzie szukal kanalu,
  // ktorego w radiu nie ma.
  const overflow = buildChannels([PMR446, LPD433, FRS_GMRS, MURS]);
  assert.equal(overflow.channels.length, 112);
  assert.equal(overflow.dropped, 0);

  const tooMuch = buildChannels([LPD433, LPD433]);
  assert.equal(tooMuch.channels.length, 128);
  assert.equal(tooMuch.dropped, 10);
});

test('zestawy sa filtrowane po kraju', () => {
  // Amerykaninowi nie pokazujemy PMR446, a Polakowi FRS - inaczej lista jest smietnikiem.
  const us = setsForCountry('US').map((s) => s.id);
  assert.ok(us.includes('frs-gmrs') && us.includes('murs'));
  assert.ok(!us.includes('pmr446') && !us.includes('lpd433'));

  const de = setsForCountry('DE').map((s) => s.id);
  assert.ok(de.includes('freenet'), 'Freenet jest niemiecki');
  assert.ok(!de.includes('pmr154'), 'PMR-154 jest polski');
  assert.ok(de.includes('pmr446'), 'PMR446 jest ogolnoeuropejski');

  const cz = setsForCountry('CZ').map((s) => s.id);
  assert.ok(!cz.includes('freenet') && !cz.includes('pmr154'));

  const pl = setsForCountry('PL').map((s) => s.id);
  assert.ok(pl.includes('pmr154') && !pl.includes('freenet'));
});

test('krance tabel nowych krajow zgadzaja sie ze zrodlem', () => {
  // FRS/GMRS wg FCC: 1-7 od 462,5625; 8-14 od 467,5625; 15-22 od 462,5500.
  assert.equal(FRS_GMRS.channels.length, 22);
  assert.equal(FRS_GMRS.channels[0]!.rx, 462_562_500);
  assert.equal(FRS_GMRS.channels[6]!.rx, 462_712_500);
  assert.equal(FRS_GMRS.channels[7]!.rx, 467_562_500);
  assert.equal(FRS_GMRS.channels[13]!.rx, 467_712_500);
  assert.equal(FRS_GMRS.channels[14]!.rx, 462_550_000);
  assert.equal(FRS_GMRS.channels[21]!.rx, 462_725_000);

  // MURS wg FCC, piec kanalow.
  assert.deepEqual(
    MURS.channels.map((c) => c.rx),
    [151_820_000, 151_880_000, 151_940_000, 154_570_000, 154_600_000],
  );

  // Freenet wg BNetzA, szesc kanalow.
  assert.deepEqual(
    FREENET.channels.map((c) => c.rx),
    [149_025_000, 149_037_500, 149_050_000, 149_087_500, 149_100_000, 149_112_500],
  );
});

test('licznik kanalow sumuje wybrane zestawy', () => {
  assert.equal(countChannels([FRS_GMRS, MURS]), 27);
  assert.equal(countChannels([]), 0);
});

test('polskie sluzby: zestawy lokalne zaleza od wybranej miejscowosci', () => {
  // Bez miejscowosci nie ma czego pokazac - inaczej uzytkownik dostalby kanaly z calego kraju.
  assert.deepEqual(localServiceSets(null), []);
  assert.deepEqual(localServiceSets('Miasto Ktorego Nie Ma'), []);

  const wroclaw = localServiceSets('Wrocław');
  assert.ok(wroclaw.length >= 3, 'Wroclaw ma kilka sluzb');
  const ids = wroclaw.map((s) => s.id);
  assert.ok(ids.includes('svc-fire') && ids.includes('svc-police'));
  assert.ok(wroclaw.every((s) => s.countries.includes('PL')));
  assert.ok(wroclaw.every((s) => s.channels.length > 0));
});

test('polskie sluzby: nazwy kanalow miesza sie w 7 znakach radia', () => {
  // Dluzsza nazwa rozjechalaby sie na kolejna pozycje w pamieci.
  const all = [...localServiceSets('Wrocław'), ...nationalServiceSets()];
  for (const set of all) {
    for (const c of set.channels) {
      assert.ok(c.name.length <= 7, `nazwa "${c.name}" ma ${c.name.length} znakow`);
    }
  }
});

test('polskie sluzby: czestotliwosci mieszcza sie w pasmach radia', () => {
  // Parser zrodla mogl zlapac date albo numer telefonu - to by trafilo prosto do radia.
  const all = [...localServiceSets('Kraków'), ...nationalServiceSets()];
  for (const set of all) {
    for (const c of set.channels) {
      const mhz = c.rx / 1_000_000;
      const ok = (mhz >= 136 && mhz <= 174) || (mhz >= 400 && mhz <= 520);
      assert.ok(ok, `${set.id}: ${mhz} MHz poza pasmem UV-5R`);
    }
  }
});

test('polskie sluzby: krajowe kanaly strazy maja wlasna numeracje', () => {
  const fireNat = nationalServiceSets().find((s) => s.id === 'svc-fire-nat');
  assert.ok(fireNat, 'zestaw krajowych kanalow strazy istnieje');
  assert.ok(fireNat!.channels.length > 40, 'numeracja krajowa to kilkadziesiat kanalow');
  // Pasmo KSRG to 148-150 MHz - wartosc spoza niego znaczy blad parsera.
  assert.ok(fireNat!.channels.every((c) => c.rx >= 148_000_000 && c.rx <= 150_000_000));
});

test('polskie sluzby: wojewodztwa sa osobna grupa, bez duplikatow i smieci', () => {
  const { regions, cities, other } = placeGroups();

  // Wojewodztw jest szesnascie i tyle ma byc na liscie, mimo ze zrodlo
  // zapisuje kujawsko-pomorskie na dwa sposoby.
  assert.equal(regions.length, 16, `wojewodztw: ${regions.length}`);
  const keys = regions.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, 'klucze wojewodztw sie powtarzaja');

  // Klucz musi zostac taki, jak w danych - po nim lecy odczyt czestotliwosci.
  assert.ok(localServiceSets(regions.find((r) => r.region.names.en === 'Masovian')!.key).length > 0);

  // Nazwa w kazdym z czterech jezykow, zadna pusta.
  for (const { region } of regions) {
    for (const lang of ['pl', 'en', 'de', 'cs'] as const) {
      assert.ok(region.names[lang]?.length, `brak nazwy ${lang} dla ${region.keys[0]}`);
    }
  }

  assert.ok(cities.length > 300, `miejscowosci: ${cities.length}`);
  assert.ok(cities.includes('Wrocław') && cities.includes('Kraków'));

  // CNBOP (instytut PSP, nie miejscowosc) wylecial ze zrodla calkiem.
  const all = [...cities, ...other, ...regions.map((r) => r.key)];
  assert.ok(!all.includes('CNBOP'), 'CNBOP wrocil do danych');

  // OGOLNOPOLSKI to zasieg, nie miejsce - ma siedziec w trzeciej grupie,
  // a nie udawac wojewodztwa na gorze listy.
  assert.ok(other.includes('OGÓLNOPOLSKI'), 'OGOLNOPOLSKI wypadl z grupy pozostalych');
  assert.ok(!cities.includes('OGÓLNOPOLSKI'));
});

test('czestotliwosc wyswietla sie dokladnie tak, jak trafia do radia', () => {
  // Trzy miejsca to standard zapisu (145.500), wiecej tylko gdy cos znacza.
  assert.equal(formatFreq(145_500_000, 'en'), '145.500 MHz');
  assert.equal(formatFreq(172_150_000, 'en'), '172.150 MHz');
  assert.equal(formatFreq(145_587_500, 'en'), '145.5875 MHz');

  // Raster 6,25 kHz wymaga pieciu miejsc. Zaokraglenie pokazaloby 446,0063,
  // czyli inna czestotliwosc niz ta, ktora program wpisuje do pamieci.
  assert.equal(formatFreq(446_006_250, 'en'), '446.00625 MHz');
  assert.equal(formatFreq(446_193_750, 'en'), '446.19375 MHz');

  // Poza angielskim separatorem dziesietnym jest przecinek.
  assert.equal(formatFreq(145_500_000, 'pl'), '145,500 MHz');
  assert.equal(formatFreq(446_006_250, 'de'), '446,00625 MHz');
});
