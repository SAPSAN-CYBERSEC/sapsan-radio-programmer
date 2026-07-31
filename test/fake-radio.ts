/**
 * Atrapa radia z rodziny UV-5R.
 *
 * Odpowiada dokladnie tak, jak opisuje protokol: wita sie, oddaje identyfikator,
 * obsluguje odczyt i zapis blokow. Dzieki temu caly cykl zapis-weryfikacja da sie
 * przejsc bez podlaczania sprzetu, a bledy w ramkach wychodza w tescie, nie u klienta.
 */

import { RadioError, type Transport } from '../src/radio/uv5r-protocol.ts';
import { MAIN_MEMORY_SIZE } from '../src/radio/uv5r-memory.ts';

const ACK = 0x06;
const CMD_READ = 0x53;
const CMD_WRITE = 0x58;
const CMD_IDENT = 0x02;

export interface FakeRadioOptions {
  /** Sekwencja powitalna, na ktora radio odpowie. Inne zostana zignorowane. */
  magic?: number[];
  /** Adres, pod ktorym radio "przeklamuje" zapis - do testowania weryfikacji. */
  corruptAt?: number;
  /** Radio przestaje odpowiadac po tylu ramkach - do testowania urwanej sesji. */
  dieAfter?: number;
  /**
   * Tyle pierwszych powitan zostaje bez odpowiedzi - jak przy sterowniku,
   * ktory zgubil bajt sekwencji. Do testowania ponawiania powitania.
   */
  ignoreGreetings?: number;
}

export class FakeRadio implements Transport {
  readonly memory = new Uint8Array(MAIN_MEMORY_SIZE).fill(0xff);
  /** Bajty czekajace na odczyt przez program. */
  private outbox: number[] = [];
  private magic: number[];
  private frames = 0;
  /** Ile powitan radio juz zignorowalo - por. `ignoreGreetings`. */
  private greetingsIgnored = 0;
  /** Czy trwa sesja programowania - radio odpowiada dopiero po powitaniu. */
  private greeted = false;
  /** Czy poprzednia ramka wymaga potwierdzenia przed odpowiedzia. */
  private sentFirstRead = false;
  /** Bufor przyjmowanej ramki - polecenia maja rozna dlugosc. */
  private inbox: number[] = [];

  private readonly opts: FakeRadioOptions;

  constructor(opts: FakeRadioOptions = {}) {
    this.opts = opts;
    this.magic = opts.magic ?? [0x50, 0xbb, 0xff, 0x20, 0x12, 0x07, 0x25];
  }

  async write(data: Uint8Array): Promise<void> {
    for (const byte of data) this.feed(byte);
  }

  async read(length: number): Promise<Uint8Array> {
    if (this.outbox.length < length) {
      // Prawdziwy transport zglasza w tym miejscu przekroczenie czasu, wiec atrapa
      // musi zachowac sie tak samo - inaczej test sprawdzalby inna sciezke bledu.
      throw new RadioError('errNoResponse');
    }
    return new Uint8Array(this.outbox.splice(0, length));
  }

  async flush(): Promise<void> {
    // Program czysci bufor przed powitaniem, wiec to dobry moment, zeby atrapa
    // wrocila do stanu "gotowa na nowa sesje" - tak samo jak radio po zakonczeniu zapisu.
    this.outbox = [];
    this.inbox = [];
    this.greeted = false;
    this.sentFirstRead = false;
  }

  private feed(byte: number): void {
    if (this.opts.dieAfter !== undefined && this.frames >= this.opts.dieAfter) return;

    this.inbox.push(byte);

    // Powitanie: bajty magiczne przychodza pojedynczo.
    if (!this.greeted) {
      if (this.inbox.length === this.magic.length) {
        const matches = this.inbox.every((b, i) => b === this.magic[i]);
        this.inbox = [];
        if (matches) {
          if (this.greetingsIgnored < (this.opts.ignoreGreetings ?? 0)) {
            this.greetingsIgnored++;
            return;
          }
          this.greeted = true;
          this.outbox.push(ACK);
        }
      }
      return;
    }

    const cmd = this.inbox[0]!;

    if (cmd === CMD_IDENT && this.inbox.length === 1) {
      this.inbox = [];
      // Osiem bajtow identyfikatora, tresc nieistotna dla protokolu.
      this.outbox.push(...[0x50, 0xbb, 0xff, 0x01, 0x25, 0x98, 0x4d, 0x00]);
      return;
    }

    if (cmd === ACK && this.inbox.length === 1) {
      this.inbox = [];
      this.outbox.push(ACK);
      return;
    }

    if (cmd === CMD_READ && this.inbox.length === 4) {
      const addr = (this.inbox[1]! << 8) | this.inbox[2]!;
      const size = this.inbox[3]!;
      this.inbox = [];
      this.frames++;

      // Od drugiego odczytu radio poprzedza odpowiedz potwierdzeniem.
      if (this.sentFirstRead) this.outbox.push(ACK);
      this.sentFirstRead = true;

      this.outbox.push(CMD_WRITE, (addr >> 8) & 0xff, addr & 0xff, size);
      this.outbox.push(...this.memory.subarray(addr, addr + size));
      return;
    }

    if (cmd === CMD_WRITE && this.inbox.length >= 4) {
      const size = this.inbox[3]!;
      if (this.inbox.length < 4 + size) return;

      const addr = (this.inbox[1]! << 8) | this.inbox[2]!;
      const payload = this.inbox.slice(4, 4 + size);
      this.inbox = [];
      this.frames++;

      this.memory.set(payload, addr);
      // Symulacja przeklamanego bajtu - taki blad przechodzi przez ACK bez sladu.
      if (this.opts.corruptAt !== undefined && addr <= this.opts.corruptAt && this.opts.corruptAt < addr + size) {
        this.memory[this.opts.corruptAt] = (this.memory[this.opts.corruptAt]! ^ 0xff) & 0xff;
      }
      this.outbox.push(ACK);
      return;
    }
  }
}
