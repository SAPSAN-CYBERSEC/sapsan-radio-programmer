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

/** Kolejnosc prob rozpoznania. UV-5R pierwszy, bo to najczesciej sprzedawany model. */
const IDENT_ORDER: RadioFamily[] = ['uv5r', 'uv82', 'uv5rOrig', 'uv6', 'bfA58'];

export interface Transport {
  write(data: Uint8Array): Promise<void>;
  /** Czyta dokladnie `length` bajtow albo odrzuca obietnice po uplywie czasu. */
  read(length: number): Promise<Uint8Array>;
  /** Czysci bufor wejsciowy z resztek poprzedniej rozmowy. */
  flush(): Promise<void>;
}

export class RadioError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = 'RadioError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wysyla sekwencje powitalna i odbiera identyfikator radia.
 * Bajty magiczne musza isc pojedynczo z przerwa - radio gubi je przy wysylce hurtem.
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
  const confirm = await t.read(1);
  if (confirm[0] !== ACK) {
    throw new RadioError(
      'Radio nie potwierdzilo polaczenia',
      'Sprobuj wyjac i wlozyc wtyk kabla do radia, a potem sprobowac jeszcze raz.',
    );
  }
  return ident;
}

export interface IdentifiedRadio {
  family: RadioFamily;
  ident: Uint8Array;
}

/**
 * Rozpoznaje podlaczone radio, probujac kolejnych sekwencji powitalnych.
 * Zwraca rodzine protokolu, nie nazwe handlowa - jeden protokol obsluguje wiele modeli.
 */
export async function identify(t: Transport): Promise<IdentifiedRadio> {
  for (const family of IDENT_ORDER) {
    const ident = await tryIdent(t, MAGICS[family]);
    if (ident) return { family, ident };
    await sleep(200);
  }
  throw new RadioError(
    'Nie udalo sie nawiazac polaczenia z radiem',
    'Sprawdz, czy radio jest wlaczone, czy wtyk siedzi do konca i czy glosnosc nie jest na zero.',
  );
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
      throw new RadioError(`Radio odmowilo odczytu spod adresu 0x${addr.toString(16)}`);
    }
  }

  const header = await t.read(4);
  const respAddr = (header[1]! << 8) | header[2]!;
  if (header[0] !== CMD_WRITE || respAddr !== addr || header[3] !== size) {
    throw new RadioError(
      `Radio odpowiedzialo niezrozumiale na odczyt spod adresu 0x${addr.toString(16)}`,
      'Odlacz kabel, wlacz radio ponownie i sprobuj od poczatku.',
    );
  }
  return t.read(size);
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
    throw new RadioError(
      `Radio odrzucilo zapis pod adres 0x${addr.toString(16)}`,
      'NIE odlaczaj kabla. Sprobuj zapisac jeszcze raz albo przywroc kopie zapasowa.',
    );
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

/** Zapisuje do radia wylacznie obszary kanalow i nazw z podanego obrazu. */
export async function writeChannels(t: Transport, image: Uint8Array, onProgress?: ProgressFn): Promise<void> {
  if (image.length < MAIN_MEMORY_SIZE) {
    throw new RadioError(`Obraz ma ${image.length} bajtow, oczekiwano ${MAIN_MEMORY_SIZE}`);
  }
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
