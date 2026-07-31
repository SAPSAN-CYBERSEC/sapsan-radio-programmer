/**
 * Protokol szeregowy rodziny Baofeng UV-5R.
 *
 * Ustalony na podstawie sterownika CHIRP `chirp/drivers/uv5r.py` (GPLv3).
 * Warstwa transportu jest wstrzykiwana, zeby dalo sie testowac bez radia.
 */

import { MAIN_MEMORY_SIZE, CHANNELS_ADDR, NAMES_ADDR, CHANNEL_COUNT, CHANNEL_SIZE } from './uv5r-memory.ts';

const ACK = 0x06;
const CMD_READ = 0x53; // 'S'
const CMD_WRITE = 0x58; // 'X'
const CMD_IDENT = 0x02;

/** Rozmiar bloku przy odczycie. Radio odmawia innych wartosci w glownym obszarze. */
const READ_BLOCK = 0x40;
/** Rozmiar bloku przy zapisie. CHIRP zapisuje wylacznie porcjami po 16 bajtow. */
const WRITE_BLOCK = 0x10;

/**
 * Sekwencje powitalne poszczegolnych rodzin. Radio odpowiada ACK tylko na wlasciwa,
 * co jednoczesnie sluzy nam za rozpoznanie modelu.
 */
export const MAGICS = {
  /** UV-5R z oprogramowaniem BFB291 i nowszym - najczestszy przypadek. */
  uv5r: new Uint8Array([0x50, 0xbb, 0xff, 0x20, 0x12, 0x07, 0x25]),
  /** UV-5R z oprogramowaniem sprzed BFB291. */
  uv5rOrig: new Uint8Array([0x50, 0xbb, 0xff, 0x01, 0x25, 0x98, 0x4d]),
  uv82: new Uint8Array([0x50, 0xbb, 0xff, 0x20, 0x13, 0x01, 0x05]),
  uv6: new Uint8Array([0x50, 0xbb, 0xff, 0x20, 0x12, 0x08, 0x23]),
  bfA58: new Uint8Array([0x50, 0xbb, 0xff, 0x20, 0x14, 0x04, 0x13]),
} as const;

export type RadioFamily = keyof typeof MAGICS;

/**
 * Modele do wyboru przez uzytkownika, z rodzina protokolu kazdego z nich.
 *
 * Wybor jest swiadoma decyzja, a nie ulatwieniem: radio, ktore dostanie nie swoja
 * sekwencje powitalna, milknie na kilkanascie sekund, wiec zgadywanie po kolei
 * bywa wolniejsze i zawodne. Uzytkownik i tak wie, co kupil.
 */
export const MODELS: Array<{
  id: string;
  /** Same oznaczenia handlowe - tych nie tlumaczymy. */
  label: string;
  family: RadioFamily;
  /** Klucz w slowniku, jesli sama nazwa nie odroznia modelu od innego wpisu. */
  note?: 'modelOlder';
}> = [
  { id: 'uv5r', label: 'UV-5R / UV-5RA / UV-5RB / UV-5RC / BF-F8 / GT-3', family: 'uv5r' },
  { id: 'uv82', label: 'UV-82 / UV-82HP / P15UV', family: 'uv82' },
  { id: 'uv6', label: 'UV-6 / UV-6R', family: 'uv6' },
  { id: 'bfA58', label: 'BF-A58 / BF-9700', family: 'bfA58' },
  { id: 'uv5rOrig', label: 'UV-5R', family: 'uv5rOrig', note: 'modelOlder' },
];

/**
 * Ile czekac po nietrafionej sekwencji powitalnej, zanim sprobujemy nastepnej.
 *
 * Zmierzone na fizycznym UV-82 (2026-07-28): po zlej sekwencji radio milknie
 * i nie wraca do rozmowy nawet po 5 s czekania. Odblokowuje je dopiero zamkniecie
 * i ponowne otwarcie portu, przy czym 300 ms przerwy to za malo, a 1000 ms wystarcza.
 */
const RETRY_DELAY_MS = 1000;
/**
 * Ile razy probujemy powitania przy wskazanym modelu. Sterownik przejsciowki
 * potrafi zgubic pojedyncze bajty (widziane na CH34x pod Windows) i wtedy radio
 * nie dostaje pelnej sekwencji - kolejna proba po ponownym otwarciu portu
 * przechodzi normalnie.
 */
const IDENT_ATTEMPTS = 3;

/** Kolejnosc prob rozpoznania. UV-5R pierwszy, bo to najczesciej sprzedawany model. */
const IDENT_ORDER: RadioFamily[] = ['uv5r', 'uv82', 'uv5rOrig', 'uv6', 'bfA58'];

export interface Transport {
  write(data: Uint8Array): Promise<void>;
  /** Czyta dokladnie `length` bajtow albo odrzuca obietnice po uplywie czasu. */
  read(length: number): Promise<Uint8Array>;
  /** Czysci bufor wejsciowy z resztek poprzedniej rozmowy. */
  flush(): Promise<void>;
  /**
   * Zamyka i otwiera polaczenie od nowa.
   *
   * Potrzebne przy rozpoznawaniu modelu: radio, ktore dostalo nie swoja sekwencje
   * powitalna, przestaje odpowiadac i samo czekanie go nie odblokowuje.
   */
  reconnect?(): Promise<void>;
}

/**
 * Kody bledow tlumaczone dopiero w UI - ta warstwa nie zna jezyka strony.
 * Kazdy kod ma swoj wpis w slowniku i18n; nowy kod bez wpisu zatrzyma kompilacje
 * na wyczerpujacym switchu w `showError`.
 */
export type RadioErrorCode =
  | 'browserWarning'
  | 'errNoDevice'
  | 'errPortClosed'
  | 'errNoResponse'
  | 'errNoConfirm'
  | 'errIdentSilent'
  | 'errIdentFailed'
  | 'errReadRefused'
  | 'errReadGarbled'
  | 'errWriteRejected'
  | 'errBadImage'
  | 'restoreBadFile';

export class RadioError extends Error {
  readonly code: RadioErrorCode;
  /** Wartosci wstawiane do przetlumaczonego komunikatu, np. adres bloku. */
  readonly params: Record<string, string | number>;

  constructor(code: RadioErrorCode, params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'RadioError';
    this.code = code;
    this.params = params;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wysyla sekwencje powitalna i odbiera identyfikator radia.
 * Bajty magiczne musza isc pojedynczo z przerwa - radio gubi je przy wysylce hurtem.
 *
 * Identyfikator ma 8 bajtow, ale nowsze UV-6 odpowiadaja dwunastoma zakonczonymi
 * 0xDD. CHIRP czyta wtedy do 0xDD i normalizuje wynik do 8 bajtow - robimy tak samo,
 * inaczej nadmiarowe bajty zostaja w buforze i "potwierdzenie" czyta smieci.
 */
async function tryIdent(t: Transport, magic: Uint8Array): Promise<Uint8Array | null> {
  await t.flush();
  for (const byte of magic) {
    await t.write(new Uint8Array([byte]));
    await sleep(10);
  }

  let ack: Uint8Array;
  try {
    ack = await t.read(1);
  } catch {
    return null;
  }
  if (ack[0] !== ACK) return null;

  await t.write(new Uint8Array([CMD_IDENT]));
  const ident = await t.read(8);

  await t.write(new Uint8Array([ACK]));
  const next = await t.read(1);
  // Osmiobajtowy identyfikator: zaraz po naszym ACK przychodzi ACK radia.
  if (next[0] === ACK) return ident;

  // Dwunastobajtowy: to, co wzielismy za potwierdzenie, jest dziewiatym bajtem.
  // Doczytujemy do 0xDD (najwyzej trzy bajty) i dopiero potem czekamy na ACK.
  // Zalozenie jak w CHIRP: bajt 0xDD zamyka identyfikator i nie wystepuje wczesniej.
  const tail = [next[0]!];
  while (tail[tail.length - 1] !== 0xdd) {
    if (tail.length === 4) throw new RadioError('errNoConfirm');
    const byte = await t.read(1);
    tail.push(byte[0]!);
  }
  const full = new Uint8Array([...ident, ...tail]);

  const confirm = await t.read(1);
  if (confirm[0] !== ACK) {
    throw new RadioError('errNoConfirm');
  }
  // Normalizacja CHIRP: z dwunastu bajtow zostaja [0], [3], [5] i ogon od [7],
  // zeby obraz pamieci mial ten sam uklad co przy starszych radiach.
  return new Uint8Array([full[0]!, full[3]!, full[5]!, ...full.subarray(7)]);
}

export interface IdentifiedRadio {
  family: RadioFamily;
  ident: Uint8Array;
}

/**
 * Rozpoznaje podlaczone radio, probujac kolejnych sekwencji powitalnych.
 * Zwraca rodzine protokolu, nie nazwe handlowa - jeden protokol obsluguje wiele modeli.
 */
export async function identify(t: Transport, only?: RadioFamily): Promise<IdentifiedRadio> {
  // Gdy wiemy, co jest podlaczone, wysylamy jedna sekwencje i koniec.
  //
  // Zmierzone na fizycznym UV-82 (2026-07-28): radio, ktore dostalo NIE SWOJA
  // sekwencje powitalna, milknie na kilkanascie sekund - ani czekanie 5 s, ani
  // ponowne otwarcie portu po 1 s go nie odblokowuje. Przy wysylaniu wylacznie
  // wlasciwej sekwencji odpowiada za kazdym razem. Dlatego zgadywanie modelu jest
  // droga awaryjna, a nie domyslna.
  if (only) {
    for (let attempt = 0; attempt < IDENT_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        // Po nieudanym powitaniu radio wraca do rozmowy dopiero po ponownym
        // otwarciu portu - samo odczekanie nie wystarcza.
        await sleep(RETRY_DELAY_MS);
        if (t.reconnect) await t.reconnect();
      }
      // Powitanie urwane w polowie (zgubiony bajt identyfikatora albo potwierdzenia)
      // to nieudana proba, nie koniec rozmowy - CHIRP w tym miejscu tez ponawia.
      let ident: Uint8Array | null;
      try {
        ident = await tryIdent(t, MAGICS[only]);
      } catch (err) {
        if (!(err instanceof RadioError)) throw err;
        ident = null;
      }
      if (ident) return { family: only, ident };
    }
    throw new RadioError('errIdentSilent');
  }

  for (const family of IDENT_ORDER) {
    let ident: Uint8Array | null;
    try {
      ident = await tryIdent(t, MAGICS[family]);
    } catch (err) {
      if (!(err instanceof RadioError)) throw err;
      ident = null;
    }
    if (ident) return { family, ident };
    // Samo czekanie nie wystarczy - radio trzeba odlaczyc i podlaczyc na nowo.
    // Transport bez `reconnect` (np. atrapa w testach) po prostu odczekuje.
    if (t.reconnect) {
      await sleep(RETRY_DELAY_MS);
      await t.reconnect();
    } else {
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw new RadioError('errIdentFailed');
}

/** Czyta jeden blok pamieci spod podanego adresu. */
async function readBlock(t: Transport, addr: number, size: number, first: boolean): Promise<Uint8Array> {
  const cmd = new Uint8Array(4);
  cmd[0] = CMD_READ;
  cmd[1] = (addr >> 8) & 0xff;
  cmd[2] = addr & 0xff;
  cmd[3] = size;
  await t.write(cmd);

  // Od drugiego bloku radio poprzedza odpowiedz potwierdzeniem poprzedniej ramki.
  if (!first) {
    const ack = await t.read(1);
    if (ack[0] !== ACK) {
      throw new RadioError('errReadRefused', { addr: addr.toString(16) });
    }
  }

  const header = await t.read(4);
  const respAddr = (header[1]! << 8) | header[2]!;
  if (header[0] !== CMD_WRITE || respAddr !== addr || header[3] !== size) {
    throw new RadioError('errReadGarbled', { addr: addr.toString(16) });
  }
  const chunk = await t.read(size);

  // Potwierdzamy radiu kazdy odebrany blok - CHIRP robi to po kazdym chunku
  // (write 0x06 + pauza). Bez tego ostatni blok odczytu zostaje niedomkniety
  // i czesc firmware odrzuca potem pierwszy zapis w tej samej sesji.
  await t.write(new Uint8Array([ACK]));
  await sleep(50);

  return chunk;
}

/** Zapisuje jeden blok pamieci. */
async function writeBlock(t: Transport, addr: number, data: Uint8Array): Promise<void> {
  const msg = new Uint8Array(4 + data.length);
  msg[0] = CMD_WRITE;
  msg[1] = (addr >> 8) & 0xff;
  msg[2] = addr & 0xff;
  msg[3] = data.length;
  msg.set(data, 4);
  await t.write(msg);
  await sleep(50);

  const ack = await t.read(1);
  if (ack[0] !== ACK) {
    throw new RadioError('errWriteRejected', { addr: addr.toString(16) });
  }
}

export type ProgressFn = (done: number, total: number) => void;

/**
 * Czyta caly glowny obszar pamieci (0x0000-0x1800).
 * Obszar pomocniczy od 0x1EC0 - limity pasm, komunikat powitalny - celowo pomijamy:
 * nie zmieniamy go, wiec nie ma powodu go ruszac ani nawet czytac.
 */
export async function readMainMemory(t: Transport, onProgress?: ProgressFn): Promise<Uint8Array> {
  const image = new Uint8Array(MAIN_MEMORY_SIZE);
  let first = true;
  for (let addr = 0; addr < MAIN_MEMORY_SIZE; addr += READ_BLOCK) {
    const block = await readBlock(t, addr, READ_BLOCK, first);
    image.set(block, addr);
    first = false;
    onProgress?.(addr + READ_BLOCK, MAIN_MEMORY_SIZE);
  }
  return image;
}

/**
 * Zakresy, ktore zapisujemy do radia. Swiadomie wezsze niz w CHIRP-ie: ruszamy
 * wylacznie kanaly i ich nazwy, wiec ustawienia radia zostaja nietkniete,
 * a kazdy bajt, ktorego nie zapisujemy, to bajt, ktorego nie mozemy zepsuc.
 */
const WRITE_RANGES: Array<[number, number]> = [
  [CHANNELS_ADDR, CHANNELS_ADDR + CHANNEL_COUNT * CHANNEL_SIZE],
  [NAMES_ADDR, NAMES_ADDR + CHANNEL_COUNT * CHANNEL_SIZE],
];

async function writeAllRanges(t: Transport, image: Uint8Array, onProgress?: ProgressFn): Promise<void> {
  const total = WRITE_RANGES.reduce((sum, [from, to]) => sum + (to - from), 0);
  let done = 0;
  for (const [from, to] of WRITE_RANGES) {
    for (let addr = from; addr < to; addr += WRITE_BLOCK) {
      await writeBlock(t, addr, image.subarray(addr, addr + WRITE_BLOCK));
      done += WRITE_BLOCK;
      onProgress?.(done, total);
    }
  }
}

/**
 * Odswieza sesje programowania: rozlacza sie, wita na nowo i wykonuje jeden
 * odczyt rozgrzewkowy.
 *
 * Samo powitanie na tym samym polaczeniu nie wystarcza - radio wraca do rozmowy
 * dopiero po ponownym otwarciu portu. Odczyt rozgrzewkowy jest rownie wazny:
 * zaden sterownik nie zapisuje zaraz po powitaniu (CHIRP przed kazdym uploadem
 * czyta bloki z radia i ostrzega, ze swiezo przywitane radia potrafia odpowiadac
 * blednie, dopoki czegos nie przeczytaja). Zapis jako pierwsza komenda po idencie
 * konczyl sie na Windows 7 odrzuceniem bloku pod adresem 0x0 - takze w ponowieniu,
 * przez co blad wygladal na nienaprawialny.
 */
async function refreshSession(t: Transport, family?: RadioFamily): Promise<void> {
  await t.flush();
  if (t.reconnect) await t.reconnect();
  await identify(t, family);
  await readBlock(t, 0x0000, READ_BLOCK, true);
}

/** Zapisuje do radia wylacznie obszary kanalow i nazw z podanego obrazu. */
export async function writeChannels(
  t: Transport,
  image: Uint8Array,
  onProgress?: ProgressFn,
  family?: RadioFamily,
): Promise<void> {
  if (image.length < MAIN_MEMORY_SIZE) {
    throw new RadioError('errBadImage', { got: image.length, want: MAIN_MEMORY_SIZE });
  }
  // Resztki w buforze (np. spozniona odpowiedz poprzedniej rozmowy) zostalyby wziete
  // za potwierdzenie pierwszego bloku i cala kontrola zapisu przesunelaby sie o jeden.
  await t.flush();
  try {
    await writeAllRanges(t, image, onProgress);
  } catch (err) {
    if (!(err instanceof RadioError)) throw err;
    // Tryb programowania wygasa po chwili bezczynnosci, a miedzy odczytem a zapisem
    // uzytkownik wybiera kanaly i edytuje arkusz - radio zdazy z niego wyjsc i odrzuca
    // pierwszy blok (objaw: "odrzucil zapis pod adres 0x0"). Witamy sie na nowo i
    // piszemy caly zakres jeszcze raz: piszemy zawsze te same zakresy, wiec powtorka
    // niczego nie psuje, a polowicznie zapisane radio i tak trzeba dokonczyc.
    await refreshSession(t, family);
    await writeAllRanges(t, image, onProgress);
  }
}

/** Wynik sprawdzenia, czy w radiu jest to, co wyslalismy. */
export interface VerifyResult {
  ok: boolean;
  /** Adres pierwszej roznicy - przydatny w zglaszaniu bledow. */
  mismatchAt?: number;
}

/**
 * Czyta z radia zapisane obszary i porownuje z tym, co mialo tam trafic.
 *
 * Radio potwierdza kazdy blok bajtem ACK, ale potwierdzenie znaczy tylko "odebralem",
 * nie "zapisalem poprawnie". Roznica moze wyjsc przy slabym kablu albo styku,
 * a uzytkownik zauwazylby ja dopiero w terenie.
 *
 * Rzuca `RadioError`, gdy nie da sie odczytac - to co innego niz niezgodnosc
 * i wywolujacy musi te dwa przypadki rozroznic.
 */
export async function verifyChannels(
  t: Transport,
  expected: Uint8Array,
  onProgress?: ProgressFn,
  family?: RadioFamily,
): Promise<VerifyResult> {
  // Zmierzone na fizycznym UV-82 (2026-07-28): po zapisie radio konczy sesje
  // i nie odpowiada na odczyt. Trzeba odlaczyc sie i przywitac na nowo - samo
  // ponowne powitanie na tym samym polaczeniu nie wystarcza.
  try {
    return await readAndCompare(t, expected, onProgress);
  } catch {
    await t.flush();
    if (t.reconnect) await t.reconnect();
    await identify(t, family);
    return await readAndCompare(t, expected, onProgress);
  }
}

async function readAndCompare(
  t: Transport,
  expected: Uint8Array,
  onProgress?: ProgressFn,
): Promise<VerifyResult> {
  const total = WRITE_RANGES.reduce((sum, [from, to]) => sum + (to - from), 0);
  let done = 0;
  let first = true;

  for (const [from, to] of WRITE_RANGES) {
    for (let addr = from; addr < to; addr += READ_BLOCK) {
      const size = Math.min(READ_BLOCK, to - addr);
      const block = await readBlock(t, addr, size, first);
      first = false;
      for (let i = 0; i < size; i++) {
        if (block[i] !== expected[addr + i]) {
          return { ok: false, mismatchAt: addr + i };
        }
      }
      done += size;
      onProgress?.(done, total);
    }
  }
  return { ok: true };
}

/**
 * Sprawdza, czy plik wyglada na kopie pamieci radia z rodziny UV-5R.
 *
 * Wgranie obrazu z innego modelu zamienia radio w cegle, a uzytkownik siegajacy
 * po kopie zapasowa jest zwykle w sytuacji, w ktorej drugi blad go dobije.
 */
export function looksLikeUv5rImage(data: Uint8Array): boolean {
  if (data.length !== MAIN_MEMORY_SIZE) return false;

  // Pierwsza pozycja musi byc albo pusta (0xFF), albo poprawna liczba BCD -
  // kazda polowka bajtu jest wtedy cyfra 0-9.
  const isBcdByte = (b: number) => (b >> 4) <= 9 && (b & 0x0f) <= 9;
  const head = data.subarray(0, 4);
  const empty = head.every((b) => b === 0xff);
  return empty || head.every(isBcdByte);
}
