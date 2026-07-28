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
import { PMR446, LPD433, HAM_2M } from '../src/data/bands.ts';
import { buildChannels } from '../src/data/build-channels.ts';

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
  // To jedyny mechanizm, ktorym radio sprzetowo blokuje nadawanie.
  // Gdyby tu wpadla czestotliwosc zamiast 0xFF, uzytkownik nadalby na PMR446 mocą 1 W.
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

test('PMR446 i LPD433 NIGDY nie dostaja prawa nadawania, nawet z pozwoleniem', () => {
  // Limit mocy PMR446 to 0,5 W, LPD433 to 10 mW. Baofeng nie zejdzie tak nisko,
  // wiec zadne oswiadczenie uzytkownika nie moze tego odblokowac.
  const result = buildChannels([PMR446, LPD433], { hasLicense: true });
  assert.equal(result.channels.length, 85);
  assert.ok(result.channels.every((c) => c.txFreq === null));
  assert.equal(result.receiveOnly, 85);
});

test('pasmo amatorskie nadaje dopiero po oswiadczeniu o pozwoleniu', () => {
  const without = buildChannels([HAM_2M], { hasLicense: false });
  assert.ok(without.channels.every((c) => c.txFreq === null));

  const with_ = buildChannels([HAM_2M], { hasLicense: true });
  assert.ok(with_.channels.every((c) => c.txFreq === c.rxFreq));
});

test('nadmiar kanalow jest obcinany do pojemnosci radia i zglaszany', () => {
  // 16 + 69 + 32 + 15 = 132 kanaly, a radio miesci 128. Uzytkownik musi o tym wiedziec,
  // inaczej bedzie szukal kanalu, ktorego nie ma.
  const sets = [PMR446, LPD433, HAM_2M];
  const result = buildChannels(sets, { hasLicense: false });
  assert.equal(result.channels.length, 117);
  assert.equal(result.dropped, 0);

  const overflow = buildChannels([...sets, { ...PMR446, id: 'x', channels: PMR446.channels }], {
    hasLicense: false,
  });
  assert.equal(overflow.channels.length, 128);
  assert.equal(overflow.dropped, 5);
});

test('krance tabel czestotliwosci zgadzaja sie ze zrodlem', () => {
  // czestotliwosci.pl.tl: PMR446 kanal 1 = 446,00625, kanal 16 = 446,19375;
  // LPD433 kanal 1 = 433,075, kanal 69 = 434,775.
  assert.equal(PMR446.channels[0]!.rx, 446_006_250);
  assert.equal(PMR446.channels[15]!.rx, 446_193_750);
  assert.equal(LPD433.channels[0]!.rx, 433_075_000);
  assert.equal(LPD433.channels[68]!.rx, 434_775_000);
});
