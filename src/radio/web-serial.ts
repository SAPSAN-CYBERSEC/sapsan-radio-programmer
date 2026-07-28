/**
 * Transport szeregowy oparty o Web Serial API.
 *
 * Dziala wylacznie w przegladarkach opartych na Chromium (Chrome, Edge, Opera, Brave).
 * Web Serial widzi tylko porty, ktore system operacyjny juz wystawil, wiec sterownik
 * przejsciowki USB nadal musi byc zainstalowany - tego nie da sie obejsc.
 */

import type { Transport } from './uv5r-protocol.ts';
import { RadioError } from './uv5r-protocol.ts';

/** Parametry lacza wymagane przez rodzine UV-5R. */
const BAUD_RATE = 9600;
/** Ile czekamy na odpowiedz radia, zanim uznamy, ze nie odpowie. */
const READ_TIMEOUT_MS = 1500;
/**
 * Pauza po otwarciu portu, zanim wyslemy powitanie.
 *
 * Ustalone na fizycznym UV-82 (2026-07-28): powitanie wyslane natychmiast po
 * otwarciu portu zostaje bez odpowiedzi, to samo powitanie po krotkiej przerwie
 * dziala za pierwszym razem. Przejsciowka CH340 potrzebuje chwili na ustalenie
 * stanu linii DTR i RTS - radio odpowiada tylko wtedy, gdy obie sa aktywne.
 */
const PORT_SETTLE_MS = 500;

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export class WebSerialTransport implements Transport {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  /** Bajty odebrane, a jeszcze nieskonsumowane przez `read`. */
  private buffer = new Uint8Array(0);

  private readonly port: SerialPort;

  private constructor(port: SerialPort) {
    this.port = port;
  }

  /**
   * Prosi uzytkownika o wskazanie portu i otwiera polaczenie.
   * Wywolanie musi nastapic w reakcji na klikniecie - przegladarka inaczej odmowi.
   */
  static async request(): Promise<WebSerialTransport> {
    if (!isWebSerialSupported()) {
      throw new RadioError(
        'Ta przegladarka nie potrafi rozmawiac z radiem',
        'Otworz strone w Chrome, Edge, Operze albo Brave. Firefox i Safari tego nie obsluguja.',
      );
    }
    let port: SerialPort;
    try {
      port = await navigator.serial.requestPort();
    } catch {
      throw new RadioError(
        'Nie wybrano zadnego urzadzenia',
        'Podlacz kabel do komputera i sprobuj jeszcze raz - urzadzenie pojawi sie na liscie.',
      );
    }
    await port.open({ baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: 'none' });
    // Web Serial ustawia DTR i RTS domyslnie, ale przejsciowka potrzebuje chwili.
    await new Promise((r) => setTimeout(r, PORT_SETTLE_MS));

    const t = new WebSerialTransport(port);
    t.reader = port.readable!.getReader();
    t.writer = port.writable!.getWriter();
    return t;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new RadioError('Polaczenie z radiem zostalo zamkniete');
    await this.writer.write(data);
  }

  async read(length: number): Promise<Uint8Array> {
    const deadline = Date.now() + READ_TIMEOUT_MS;
    while (this.buffer.length < length) {
      if (Date.now() > deadline) {
        throw new RadioError(
          'Radio nie odpowiada',
          'Sprawdz, czy jest wlaczone i czy wtyk kabla siedzi do konca w gniezdzie.',
        );
      }
      const chunk = await this.readChunk(deadline - Date.now());
      if (chunk === null) continue;
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer, 0);
      merged.set(chunk, this.buffer.length);
      this.buffer = merged;
    }
    const out = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    return out;
  }

  /** Czyta porcje danych albo zwraca null, gdy uplynal czas. */
  private async readChunk(timeoutMs: number): Promise<Uint8Array | null> {
    if (!this.reader) throw new RadioError('Polaczenie z radiem zostalo zamkniete');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), Math.max(0, timeoutMs));
    });
    try {
      const result = await Promise.race([this.reader.read(), timeout]);
      if (result === null) return null;
      return result.value ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  async flush(): Promise<void> {
    this.buffer = new Uint8Array(0);
  }

  async close(): Promise<void> {
    try {
      await this.reader?.cancel();
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      await this.port.close();
    } finally {
      this.reader = null;
      this.writer = null;
    }
  }
}
