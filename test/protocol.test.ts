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
