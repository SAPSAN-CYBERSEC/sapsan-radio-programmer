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
 * Na macOS wystarczalo 500 ms; sterownik CH340 pod Windows bywa wolniejszy,
 * wiec dajemy zapas.
 */
const PORT_SETTLE_MS = 1000;
/**
 * Ile odczekac z zamknietym portem, zanim otworzymy go ponownie.
 *
 * Zmierzone na fizycznym UV-82 (2026-07-28): po zakonczonej sesji zapisu radio
 * nie odpowiada od razu. Przy 1 s nadal milczy, przy 4 s wraca do rozmowy za
 * kazdym razem - i na tym opiera sie odczyt weryfikujacy zapis.
 */
const RECONNECT_PAUSE_MS = 4000;

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export class WebSerialTransport implements Transport {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  /** Bajty odebrane, a jeszcze nieskonsumowane przez `read`. */
  private buffer = new Uint8Array(0);
  /** Rozpoczete, a nieukonczone `reader.read()` - wynik odbierze kolejne wywolanie. */
  private pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

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
      throw new RadioError('browserWarning');
    }
    let port: SerialPort;
    try {
      port = await navigator.serial.requestPort();
    } catch {
      throw new RadioError('errNoDevice');
    }
    await port.open({ baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: 'none' });
    // Na macOS otwarcie portu podnosi DTR i RTS samo, ale sterownik CH340 pod
    // Windows potrafi zostawic je opuszczone - a radio bez OBU aktywnych milczy.
    // Ustawiamy jawnie, zanim odczekamy na ustalenie stanu linii.
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });
    await new Promise((r) => setTimeout(r, PORT_SETTLE_MS));

    const t = new WebSerialTransport(port);
    t.reader = port.readable!.getReader();
    t.writer = port.writable!.getWriter();
    return t;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new RadioError('errPortClosed');
    await this.writer.write(data);
  }

  async read(length: number): Promise<Uint8Array> {
    const deadline = Date.now() + READ_TIMEOUT_MS;
    while (this.buffer.length < length) {
      if (Date.now() > deadline) {
        throw new RadioError('errNoResponse');
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

  /**
   * Czyta porcje danych albo zwraca null, gdy uplynal czas.
   *
   * Przegrany wyscig z limitem czasu NIE porzuca odczytu: porzucony promise
   * odebralby bajty, ktore przyszly o wlos za pozno, i przepadlyby na zawsze.
   * Wolny sterownik (CH340 pod Windows) oddaje odpowiedz radia wlasnie tak -
   * dlatego rozpoczety odczyt czeka na kolejne wywolanie.
   */
  private async readChunk(timeoutMs: number): Promise<Uint8Array | null> {
    if (!this.reader) throw new RadioError('errPortClosed');
    const reading = this.pendingRead ?? this.reader.read();
    this.pendingRead = reading;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), Math.max(0, timeoutMs));
    });
    try {
      const result = await Promise.race([reading, timeout]);
      if (result === null) return null;
      this.pendingRead = null;
      return result.value ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  async flush(): Promise<void> {
    this.buffer = new Uint8Array(0);
    // Odczyt w locie tez idzie do kosza - flush ma odciac wszystko, co stare,
    // a bajty odebrane przez porzucony promise nigdzie dalej nie trafia.
    this.pendingRead = null;
  }

  /**
   * Zamyka i otwiera port od nowa.
   *
   * Zgoda uzytkownika dotyczy portu, nie sesji, wiec ponowne otwarcie nie wywoluje
   * kolejnego okienka wyboru. Radio, ktore dostalo nie swoja sekwencje powitalna,
   * inaczej nie wraca do rozmowy.
   */
  async reconnect(): Promise<void> {
    await this.releaseStreams();
    await this.port.close();
    await new Promise((r) => setTimeout(r, RECONNECT_PAUSE_MS));
    await this.port.open({ baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: 'none' });
    // Jawne DTR i RTS z tego samego powodu co przy pierwszym otwarciu portu.
    await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
    await new Promise((r) => setTimeout(r, PORT_SETTLE_MS));
    this.reader = this.port.readable!.getReader();
    this.writer = this.port.writable!.getWriter();
    this.buffer = new Uint8Array(0);
  }

  private async releaseStreams(): Promise<void> {
    try {
      await this.reader?.cancel();
      this.reader?.releaseLock();
      await this.writer?.close();
    } catch {
      // Zamykamy polaczenie, ktore i tak zaraz otworzymy - blad tutaj nic nie zmienia.
    }
    this.reader = null;
    this.writer = null;
    this.pendingRead = null;
  }

  async close(): Promise<void> {
    try {
      await this.releaseStreams();
      await this.port.close();
    } finally {
      this.reader = null;
      this.writer = null;
    }
  }
}
