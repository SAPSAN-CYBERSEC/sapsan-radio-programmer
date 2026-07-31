/**
 * Testy protokolu na atrapie radia.
 *
 * Sprawdzaja to, czego nie da sie sprawdzic patrzac na same bajty kanalu:
 * czy ramki maja poprawny format, czy sekwencja powitalna dziala i czy
 * weryfikacja faktycznie lapie przeklamany zapis.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  identify,
  readMainMemory,
  writeChannels,
  verifyChannels,
  looksLikeUv5rImage,
  MAGICS,
  RadioError,
} from '../src/radio/uv5r-protocol.ts';
import { MAIN_MEMORY_SIZE, writeChannelsIntoImage, CHANNELS_ADDR } from '../src/radio/uv5r-memory.ts';
import { buildChannels } from '../src/data/build-channels.ts';
import { PMR446 } from '../src/data/bands.ts';
import { LANGS, t } from '../src/i18n/index.ts';
import { FakeRadio } from './fake-radio.ts';

test('rozpoznanie radia po sekwencji powitalnej', async () => {
  const radio = new FakeRadio({ magic: [...MAGICS.uv82] });
  const result = await identify(radio);
  // Rodzina wynika z tego, na ktora sekwencje radio odpowiedzialo.
  assert.equal(result.family, 'uv82');
  assert.equal(result.ident.length, 8);
});

test('wskazany model dostaje kolejne proby powitania, gdy pierwsze przepadna', async () => {
  // Sterownik przejsciowki potrafi zgubic bajt sekwencji (CH34x pod Windows) -
  // pojedyncza proba konczylaby sie bledem, choc radio jest sprawne i podlaczone.
  const radio = new FakeRadio({ ignoreGreetings: 2 });
  const result = await identify(radio, 'uv5r');
  assert.equal(result.family, 'uv5r');
});

test('radio, ktore nie odpowiada na zadna sekwencje, konczy sie czytelnym bledem', async () => {
  const radio = new FakeRadio({ magic: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] });
  await assert.rejects(() => identify(radio), (err: unknown) => {
    assert.ok(err instanceof RadioError);
    // Uzytkownik ma dostac wskazowke w swoim jezyku, nie kod bledu - slownik
    // kazdego jezyka musi umiec przetlumaczyc ten kod na niepusty komunikat.
    assert.equal(err.code, 'errIdentFailed');
    for (const { code } of LANGS) {
      assert.ok(t(code).errIdentFailed.length > 0);
    }
    return true;
  });
});

test('odczyt zwraca caly glowny obszar pamieci', async () => {
  const radio = new FakeRadio();
  radio.memory[0x0000] = 0x12;
  radio.memory[0x17ff] = 0x34;

  await identify(radio);
  const image = await readMainMemory(radio);

  assert.equal(image.length, MAIN_MEMORY_SIZE);
  assert.equal(image[0x0000], 0x12);
  assert.equal(image[0x17ff], 0x34);
});

test('zapis trafia do pamieci radia, a weryfikacja to potwierdza', async () => {
  const radio = new FakeRadio();
  await identify(radio);

  const image = await readMainMemory(radio);
  const { channels } = buildChannels([PMR446]);
  writeChannelsIntoImage(image, channels);

  await writeChannels(radio, image);
  // PMR446 kanal 1 = 446,00625 MHz -> 44600625 -> BCD little-endian.
  assert.deepEqual([...radio.memory.slice(CHANNELS_ADDR, CHANNELS_ADDR + 4)], [0x25, 0x06, 0x60, 0x44]);

  const verdict = await verifyChannels(radio, image);
  assert.equal(verdict.ok, true);
});

test('zapis odswieza sesje, gdy radio zdazylo z niej wyjsc', async () => {
  // Miedzy odczytem a zapisem uzytkownik wybiera kanaly i edytuje arkusz - radio
  // przez ten czas wychodzi z trybu programowania i odrzuca pierwszy blok.
  // Zapis ma sie z nim przywitac na nowo, a nie zwrocic blad w twarz.
  const radio = new FakeRadio();
  await identify(radio);
  const image = await readMainMemory(radio);
  writeChannelsIntoImage(image, buildChannels([PMR446]).channels);

  radio.expireSession();
  await writeChannels(radio, image, undefined, 'uv5r');

  const verdict = await verifyChannels(radio, image, undefined, 'uv5r');
  assert.equal(verdict.ok, true);
});

test('weryfikacja lapie przeklamany bajt, ktory ACK przepuscil', async () => {
  // To jest caly sens tego kroku: radio potwierdza kazdy blok, nawet gdy zapisal
  // cos innego niz dostal. Bez odczytu uzytkownik zobaczylby blad dopiero w terenie.
  const corruptAt = CHANNELS_ADDR + 2;
  const radio = new FakeRadio({ corruptAt });
  await identify(radio);

  const image = await readMainMemory(radio);
  writeChannelsIntoImage(image, buildChannels([PMR446]).channels);

  await writeChannels(radio, image); // ACK przychodzi mimo przeklamania
  const verdict = await verifyChannels(radio, image);

  assert.equal(verdict.ok, false);
  assert.equal(verdict.mismatchAt, corruptAt);
});

test('urwana sesja przy zapisie konczy sie bledem, nie cicha porazka', async () => {
  const radio = new FakeRadio({ dieAfter: 3 });
  await identify(radio);
  const image = new Uint8Array(MAIN_MEMORY_SIZE).fill(0xff);

  await assert.rejects(() => writeChannels(radio, image), (err: unknown) => err instanceof RadioError);
});

test('zapis nie zostawia niedobranych potwierdzen ani nie bierze resztek za ACK', async () => {
  // Resztka w buforze przed zapisem przesuwalaby cala kontrole o jeden blok:
  // kazdy blok bylby "potwierdzany" ACK-iem poprzedniego, a blad wychodzilby
  // pod cudzym adresem. Zapis ma zaczac od czystego bufora i skonczyc z pustym.
  const radio = new FakeRadio();
  await identify(radio);
  const image = await readMainMemory(radio);
  writeChannelsIntoImage(image, buildChannels([PMR446]).channels);

  radio.plantStrayByte(0x06);
  await writeChannels(radio, image);

  assert.equal(radio.pendingBytes(), 0, 'po zapisie nie moga zostac nieodebrane bajty');
  const verdict = await verifyChannels(radio, image);
  assert.equal(verdict.ok, true);
});

test('weryfikacja po wygasnieciu sesji wita sie na nowo', async () => {
  // Po zapisie radio konczy sesje - pierwsza proba odczytu weryfikujacego
  // przepada i program ma sie przywitac jeszcze raz, a nie zglosic blad.
  const radio = new FakeRadio();
  await identify(radio);
  const image = await readMainMemory(radio);
  writeChannelsIntoImage(image, buildChannels([PMR446]).channels);
  await writeChannels(radio, image);

  radio.expireSession();
  const verdict = await verifyChannels(radio, image, undefined, 'uv5r');
  assert.equal(verdict.ok, true);
});

test('12-bajtowy identyfikator nowszych UV-6 jest normalizowany jak w CHIRP', async () => {
  // Nowsze UV-6 odpowiadaja dwunastoma bajtami zakonczonymi 0xDD. Program ma je
  // przyjac, dokonczyc potwierdzenie i oddac 8 bajtow w ukladzie CHIRP-a -
  // wczesniej cztery nadmiarowe bajty zostawaly w buforze i kazde polaczenie
  // konczylo sie bledem "radio nie potwierdzilo".
  const radio = new FakeRadio({ magic: [...MAGICS.uv6], longIdent: true });
  const result = await identify(radio, 'uv6');

  assert.equal(result.family, 'uv6');
  // Z [50 01 02 bb 01 ff 01 20 12 08 23 dd] zostaja pozycje 0, 3, 5 i ogon od 7.
  assert.deepEqual([...result.ident], [0x50, 0xbb, 0xff, 0x20, 0x12, 0x08, 0x23, 0xdd]);
  // Bufor musi byc pusty - to wlasnie niedobrane bajty psuly kolejne ramki.
  assert.equal(radio.pendingBytes(), 0);
});

test('plik kopii jest sprawdzany, zanim trafi do radia', () => {
  // Wgranie obrazu z innego modelu zamienia radio w cegle.
  assert.equal(looksLikeUv5rImage(new Uint8Array(MAIN_MEMORY_SIZE).fill(0xff)), true);

  const withChannel = new Uint8Array(MAIN_MEMORY_SIZE).fill(0xff);
  withChannel.set([0x25, 0x06, 0x60, 0x44], 0); // poprawny BCD
  assert.equal(looksLikeUv5rImage(withChannel), true);

  // Zly rozmiar - najczestszy przypadek, czyli plik z zupelnie innego programu.
  assert.equal(looksLikeUv5rImage(new Uint8Array(1024)), false);
  assert.equal(looksLikeUv5rImage(new Uint8Array(MAIN_MEMORY_SIZE + 8)), false);

  // Rozmiar sie zgadza, ale pierwsza pozycja nie jest ani pusta, ani liczba BCD.
  const garbage = new Uint8Array(MAIN_MEMORY_SIZE).fill(0xff);
  garbage.set([0xab, 0xcd, 0xef, 0x12], 0);
  assert.equal(looksLikeUv5rImage(garbage), false);
});
