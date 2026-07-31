/**
 * Mapa pamieci i kodowanie kanalow radiotelefonow rodziny Baofeng UV-5R.
 *
 * Format ustalony na podstawie sterownika CHIRP `chirp/drivers/uv5r.py` (GPLv3).
 * Adresy ponizej sa ADRESAMI W RADIU. Obraz CHIRP-a ma dodatkowe 8 bajtow
 * identyfikatora na poczatku, wiec offsety w pliku .img sa o 0x08 wieksze.
 */

/** Kanaly: 128 pozycji po 16 bajtow, adres radia 0x0000-0x0800. */
export const CHANNELS_ADDR = 0x0000;
/** Nazwy kanalow: 128 pozycji po 16 bajtow (7 znakow + wypelniacz), adres radia 0x1000. */
export const NAMES_ADDR = 0x1000;
export const CHANNEL_COUNT = 128;
export const CHANNEL_SIZE = 16;
export const NAME_LENGTH = 7;
/** Rozmiar glownego bloku pamieci czytanego z radia. */
export const MAIN_MEMORY_SIZE = 0x1800;

/** Znak wypelniacza. Pusty kanal ma 0xFF na pierwszym bajcie czestotliwosci. */
const EMPTY = 0xff;

/**
 * Tony CTCSS obslugiwane przez UV-5R, w hercach.
 * W pamieci zapisywane jako liczba calkowita = Hz * 10 (88.5 Hz -> 885).
 */
export const CTCSS_TONES = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4,
  100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5,
  141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9, 171.3, 173.8,
  177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5, 203.5, 206.5,
  210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1,
] as const;

/** Szerokosc kanalu. UV-5R zna tylko dwie. */
export type Bandwidth = 'wide' | 'narrow';
/**
 * Moc nadawania. Oferujemy dwa poziomy, bo tylko one znacza to samo na calej
 * rodzinie: 0 = pelna moc, 1 = obnizona. Warianty 8 W (UV-82HP, BF-F8HP) maja
 * w tym polu trzy wartosci (0 = 8 W, 1 = 4 W, 2 = 1 W wg CHIRP), ale dziela
 * pozycje na liscie modeli ze swoimi wersjami 5 W - nie wiemy, ktora wersje
 * uzytkownik podlaczyl, wiec nie zapisujemy wartosci 2, ktorej starsze wersje
 * nie znaja. Trzeci poziom wroci, gdy rozdzielimy warianty na liscie modeli.
 */
export type Power = 'high' | 'low';

export interface Channel {
  /** Czestotliwosc odbioru w Hz. */
  rxFreq: number;
  /**
   * Czestotliwosc nadawania w Hz albo `null` = kanal wylacznie odbiorczy.
   *
   * `null` zapisuje 0xFFFFFFFF w polu txfreq, co radio interpretuje jako
   * blokade nadawania (CHIRP nazywa to duplex "off"). To jedyny sposob, w jaki
   * mozemy sprzetowo zagwarantowac, ze uzytkownik nie nada na czestotliwosci,
   * na ktorej nadawac mu nie wolno.
   */
  txFreq: number | null;
  /** Nazwa pokazywana na wyswietlaczu, maks. 7 znakow. */
  name: string;
  /** Ton CTCSS wymagany do otwarcia squelcha przy odbiorze, w Hz. */
  rxTone?: number;
  /** Ton CTCSS dodawany przy nadawaniu, w Hz. */
  txTone?: number;
  bandwidth: Bandwidth;
  power: Power;
  /** Czy kanal ma byc uwzgledniany przy skanowaniu. */
  scan: boolean;
}

/**
 * Zapisuje liczbe jako 4 bajty BCD w kolejnosci little-endian.
 * Czestotliwosc trzymana jest w jednostkach 10 Hz, czyli 145.500 MHz -> 14550000.
 */
function encodeBcdLe(value: number, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  let digits = value.toString().padStart(bytes * 2, '0');
  if (digits.length > bytes * 2) {
    throw new RangeError(`Wartosc ${value} nie miesci sie w ${bytes} bajtach BCD`);
  }
  for (let i = 0; i < bytes; i++) {
    // Bajt najmlodszy idzie pierwszy, wiec czytamy pary cyfr od konca.
    const pair = digits.slice(digits.length - (i + 1) * 2, digits.length - i * 2);
    out[i] = (Number(pair[0]) << 4) | Number(pair[1]);
  }
  return out;
}

function decodeBcdLe(bytes: Uint8Array): number {
  let digits = '';
  for (let i = bytes.length - 1; i >= 0; i--) {
    const b = bytes[i]!;
    digits += (b >> 4).toString() + (b & 0x0f).toString();
  }
  return Number(digits);
}

/**
 * Zamienia ton CTCSS na wartosc zapisywana w pamieci.
 * 0x0000 oznacza brak tonu. Wartosci ponizej 0x0258 sa zarezerwowane dla DTCS,
 * ktorego nie obslugujemy - najnizszy ton CTCSS (67.0 Hz -> 670) i tak jest wyzszy.
 */
function encodeTone(hz: number | undefined): number {
  if (hz === undefined) return 0x0000;
  const raw = Math.round(hz * 10);
  if (raw < 0x0258) {
    throw new RangeError(`Ton ${hz} Hz jest ponizej zakresu CTCSS obslugiwanego przez UV-5R`);
  }
  return raw;
}

function decodeTone(raw: number): number | undefined {
  if (raw === 0x0000 || raw === 0xffff) return undefined;
  if (raw < 0x0258) return undefined; // DTCS - nie obslugujemy, traktujemy jak brak
  return raw / 10;
}

/**
 * Kodowanie mocy wg CHIRP: 0 = najwyzsza, wyzsze wartosci = nizsza moc.
 * Poprzednie mapowanie (medium: 2, low: 1) mialo zamieniona kolejnosc wzgledem
 * CHIRP-owego [High, Med, Low] i na radiach 8 W odwracalo Mid z Low.
 */
const POWER_BITS: Record<Power, number> = { high: 0, low: 1 };
/** Wartosci 2 i 3 zapisuja programy trzeciopoziomowe - dla nas to tez obnizona moc. */
const POWER_FROM_BITS: Record<number, Power> = { 0: 'high', 1: 'low', 2: 'low', 3: 'low' };

/**
 * Koduje kanal do 16 bajtow w formacie UV-5R.
 *
 * Uklad bajtow:
 *   0-3   rxfreq  (BCD LE, jednostki 10 Hz)
 *   4-7   txfreq  (BCD LE albo 0xFFFFFFFF = zakaz nadawania)
 *   8-9   rxtone  (u16 LE)
 *   10-11 txtone  (u16 LE)
 *   12    scode w mlodszych 4 bitach, isuhf na bicie 4
 *   13    txtoneicon na bicie 0
 *   14    lowpower na bitach 0-1, mailicon na bitach 5-7
 *   15    pttid 0-1, scan 2, bcl 3, wide 6
 */
export function encodeChannel(ch: Channel): Uint8Array {
  const buf = new Uint8Array(CHANNEL_SIZE);

  buf.set(encodeBcdLe(Math.round(ch.rxFreq / 10), 4), 0);

  if (ch.txFreq === null) {
    buf.fill(EMPTY, 4, 8);
  } else {
    buf.set(encodeBcdLe(Math.round(ch.txFreq / 10), 4), 4);
  }

  const rxTone = encodeTone(ch.rxTone);
  const txTone = encodeTone(ch.txTone);
  buf[8] = rxTone & 0xff;
  buf[9] = (rxTone >> 8) & 0xff;
  buf[10] = txTone & 0xff;
  buf[11] = (txTone >> 8) & 0xff;

  buf[12] = 0x00;
  buf[13] = 0x00;
  buf[14] = POWER_BITS[ch.power] & 0x03;
  buf[15] = (ch.bandwidth === 'wide' ? 1 : 0) << 6;
  if (ch.scan) buf[15] |= 1 << 2;

  return buf;
}

export function decodeChannel(buf: Uint8Array): Channel | null {
  if (buf.length !== CHANNEL_SIZE) {
    throw new RangeError(`Kanal ma ${buf.length} bajtow zamiast ${CHANNEL_SIZE}`);
  }
  // Radio oznacza wolna pozycje wypelniaczem na pierwszym bajcie czestotliwosci.
  if (buf[0] === EMPTY) return null;

  const txRaw = buf.slice(4, 8);
  const txInhibited = txRaw.every((b) => b === EMPTY);

  return {
    rxFreq: decodeBcdLe(buf.slice(0, 4)) * 10,
    txFreq: txInhibited ? null : decodeBcdLe(txRaw) * 10,
    name: '',
    rxTone: decodeTone(buf[8]! | (buf[9]! << 8)),
    txTone: decodeTone(buf[10]! | (buf[11]! << 8)),
    bandwidth: (buf[15]! >> 6) & 1 ? 'wide' : 'narrow',
    power: POWER_FROM_BITS[buf[14]! & 0x03] ?? 'high',
    scan: ((buf[15]! >> 2) & 1) === 1,
  };
}

/**
 * Znaki, ktore wyswietlacz radia zna (UV5R_CHARSET z CHIRP-a). Bajt spoza tej
 * listy pokazuje sie jako smieci - a polskie znaki mialyby kody powyzej 255
 * i po obcieciu do bajtu trafialyby w przypadkowe symbole.
 */
const NAME_CHARSET = new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !@#$%^&*()+-=[]:";\'<>?,./']);

/** Polskie znaki maja oczywiste odpowiedniki ASCII - lepsze "ZOLW" niz krzaki. */
const TRANSLITERATION: Record<string, string> = {
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
};

/**
 * Sprowadza nazwe do postaci, ktora radio faktycznie wyswietli: wielkie litery,
 * polskie znaki przetransliterowane, znaki spoza zestawu radia usuniete, 7 znakow.
 * Arkusz uzywa tej samej funkcji, zeby uzytkownik widzial dokladnie to, co zapisze.
 */
export function normalizeName(raw: string): string {
  return [...raw.toUpperCase()]
    .map((c) => TRANSLITERATION[c] ?? c)
    .filter((c) => NAME_CHARSET.has(c))
    .join('')
    .slice(0, NAME_LENGTH);
}

/** Koduje nazwe kanalu: 7 znakow ASCII wielkimi literami, reszta wypelniacz. */
export function encodeName(name: string): Uint8Array {
  const buf = new Uint8Array(CHANNEL_SIZE).fill(EMPTY);
  const clean = normalizeName(name);
  for (let i = 0; i < clean.length; i++) {
    buf[i] = clean.charCodeAt(i);
  }
  return buf;
}

export function decodeName(buf: Uint8Array): string {
  let out = '';
  for (let i = 0; i < NAME_LENGTH; i++) {
    const b = buf[i]!;
    // Oprogramowanie fabryczne potrafi wstawic 0xFF w srodku nazwy.
    out += b === EMPTY || b === 0x00 ? ' ' : String.fromCharCode(b);
  }
  return out.trimEnd();
}

/** Bajty pustej pozycji - takie, jakie zostawia radio po skasowaniu kanalu. */
export function emptyChannelBytes(): Uint8Array {
  return new Uint8Array(CHANNEL_SIZE).fill(EMPTY);
}

/**
 * Wstawia liste kanalow do pelnego obrazu pamieci, od pierwszej pozycji.
 * Radio i CHIRP numeruja pozycje od 0 do 127 - arkusz pokazuje te same numery.
 * Obraz jest modyfikowany w miejscu - to swiadome, bo pracujemy na kopii
 * odczytanej z radia i chcemy zachowac wszystkie ustawienia, ktorych nie ruszamy.
 */
export function writeChannelsIntoImage(image: Uint8Array, channels: Channel[]): void {
  if (image.length < MAIN_MEMORY_SIZE) {
    throw new RangeError(`Obraz ma ${image.length} bajtow, oczekiwano co najmniej ${MAIN_MEMORY_SIZE}`);
  }
  if (channels.length > CHANNEL_COUNT) {
    throw new RangeError(`Radio miesci ${CHANNEL_COUNT} kanalow, dostalem ${channels.length}`);
  }

  for (let i = 0; i < CHANNEL_COUNT; i++) {
    const ch = channels[i];
    const chOffset = CHANNELS_ADDR + i * CHANNEL_SIZE;
    const nameOffset = NAMES_ADDR + i * CHANNEL_SIZE;
    if (ch === undefined) {
      image.set(emptyChannelBytes(), chOffset);
      image.set(new Uint8Array(CHANNEL_SIZE).fill(EMPTY), nameOffset);
    } else {
      image.set(encodeChannel(ch), chOffset);
      image.set(encodeName(ch.name), nameOffset);
    }
  }
}
