/**
 * Atrapa radia z rodziny UV-5R.
 *
 * Modeluje protokol tak, jak robi go referencyjny sterownik CHIRP (uv5r.py),
 * a nie tak, jak nasz kod akurat z radiem rozmawia. Roznica jest celowa:
 * prawdziwe firmware bywa tolerancyjne (UV-82 znosil brak potwierdzen), ale
 * testy maja pilnowac zgodnosci z protokolem, ktory przezyl tysiace radiotelefonow,
 * nie z tolerancja jednego egzemplarza. Stad atrapa:
 *  - wymaga od programu ACK po kazdym odebranym bloku danych (CHIRP: write 0x06),
 *  - nie przyjmuje zapisu jako pierwszej komendy po powitaniu - CHIRP przed kazdym
 *    uploadem najpierw czyta; radio, ktore dostalo 'X' bez zadnego odczytu, milczy
 *    (tak wygladal objaw "odrzucil zapis pod adres 0x0" na Windows 7),
 *  - umie odpowiedziec 12-bajtowym identyfikatorem nowszych UV-6.
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
  /**
   * Radio odpowiada 12-bajtowym identyfikatorem zakonczonym 0xDD - tak robia
   * nowsze UV-6. Program ma go przyjac i znormalizowac do 8 bajtow jak CHIRP.
   */
  longIdent?: boolean;
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
  /** Po wyslaniu identyfikatora radio czeka na ACK i potwierdza go wlasnym ACK. */
  private awaitConfirm = false;
  /** Po ramce danych radio czeka na ACK programu - CHIRP wysyla go po kazdym bloku. */
  private pendingReadAck = false;
  /** Czy w tej sesji byl juz jakis odczyt - bez niego radio nie przyjmuje zapisu. */
  private hadReadThisSession = false;
  /** Czy w tej sesji byl zapis - po zapisie radio konczy sesje przy probie odczytu. */
  private wroteThisSession = false;
  /**
   * Radio, ktore dostalo bajt niezgodny z protokolem, przestaje odpowiadac.
   * Nie ma z tego powrotu w ramach atrapy - test, ktory tu trafil, ma pasc.
   */
  private confused = false;
  /** Bufor przyjmowanej ramki - polecenia maja rozna dlugosc. */
  private inbox: number[] = [];

  private readonly opts: FakeRadioOptions;

  constructor(opts: FakeRadioOptions = {}) {
    this.opts = opts;
    this.magic = opts.magic ?? [0x50, 0xbb, 0xff, 0x20, 0x12, 0x07, 0x25];
  }

  /**
   * Radio wychodzi z trybu programowania, tak jak prawdziwe po chwili bezczynnosci.
   * Kolejne polecenia zostaja bez odpowiedzi, dopoki nie przyjdzie nowe powitanie.
   */
  expireSession(): void {
    this.greeted = false;
    this.sentFirstRead = false;
    this.awaitConfirm = false;
    this.pendingReadAck = false;
    this.hadReadThisSession = false;
    this.wroteThisSession = false;
    this.inbox = [];
    this.outbox = [];
  }

  /** Podklada bajt-sierote w kanale zwrotnym - jak resztka po poprzedniej rozmowie. */
  plantStrayByte(byte: number): void {
    this.outbox.push(byte);
  }

  /**
   * Ile bajtow radio wyslalo, a program nie odebral. Po poprawnie domknietej
   * operacji ma byc zero - kazda inna wartosc znaczy, ze potwierdzenia
   * rozjechaly sie z ramkami i program bierze stare ACK za nowe.
   */
  pendingBytes(): number {
    return this.outbox.length;
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
    // Flush czysci wylacznie bufor odbiorczy PROGRAMU. Prawdziwe radio nie widzi,
    // ze komputer wyrzucil swoje nieprzeczytane bajty - sesja programowania trwa dalej.
    // Wczesniejsza wersja atrapy konczyla tu sesje i przez to testy nie odroznialy
    // zapisu na zywej sesji od zapisu po jej wygasnieciu.
    this.outbox = [];
  }

  private feed(byte: number): void {
    if (this.confused) return;
    if (this.opts.dieAfter !== undefined && this.frames >= this.opts.dieAfter) return;

    // Powitanie: bajty magiczne przychodza pojedynczo. Radio poza sesja ignoruje
    // smieci i rozpoznaje sekwencje przesuwnie - ramka wyslana w prozni przed
    // powitaniem nie moze przesunac fazy dopasowania na zawsze.
    if (!this.greeted) {
      this.inbox.push(byte);
      if (this.inbox.length > this.magic.length) this.inbox.shift();
      if (
        this.inbox.length === this.magic.length &&
        this.inbox.every((b, i) => b === this.magic[i])
      ) {
        this.inbox = [];
        if (this.greetingsIgnored < (this.opts.ignoreGreetings ?? 0)) {
          this.greetingsIgnored++;
          return;
        }
        this.greeted = true;
        this.hadReadThisSession = false;
        this.wroteThisSession = false;
        this.sentFirstRead = false;
        this.outbox.push(ACK);
      }
      return;
    }

    // ACK-i sa stanowe, nie bezwarunkowe: po idencie radio odpowiada wlasnym ACK
    // (drugie potwierdzenie klonowania), po bloku danych tylko go przyjmuje.
    if (this.inbox.length === 0 && byte === ACK) {
      if (this.awaitConfirm) {
        this.awaitConfirm = false;
        this.outbox.push(ACK);
      } else if (this.pendingReadAck) {
        this.pendingReadAck = false;
      }
      // Luzny ACK poza tymi stanami to nieszkodliwa resztka - radio go ignoruje.
      return;
    }

    // Nowa komenda, a poprzedni blok danych wciaz niepotwierdzony: program zgubil
    // krok protokolu. CHIRP potwierdza kazdy blok, wiec radio ma prawo sie pogubic.
    if (this.inbox.length === 0 && this.pendingReadAck) {
      this.confused = true;
      return;
    }

    this.inbox.push(byte);
    const cmd = this.inbox[0]!;

    if (cmd === CMD_IDENT && this.inbox.length === 1) {
      this.inbox = [];
      if (this.opts.longIdent) {
        // Nowsze UV-6: dwanascie bajtow zakonczonych 0xDD.
        this.outbox.push(...[0x50, 0x01, 0x02, 0xbb, 0x01, 0xff, 0x01, 0x20, 0x12, 0x08, 0x23, 0xdd]);
      } else {
        // Osiem bajtow identyfikatora, tresc nieistotna dla protokolu.
        this.outbox.push(...[0x50, 0xbb, 0xff, 0x01, 0x25, 0x98, 0x4d, 0x00]);
      }
      this.awaitConfirm = true;
      return;
    }

    if (cmd === CMD_READ && this.inbox.length === 4) {
      const addr = (this.inbox[1]! << 8) | this.inbox[2]!;
      const size = this.inbox[3]!;
      this.inbox = [];
      this.frames++;

      // Zmierzone na fizycznym UV-82 (2026-07-28): po zapisie radio konczy sesje
      // i odczyt zostaje bez odpowiedzi az do nowego powitania.
      if (this.wroteThisSession) {
        this.greeted = false;
        this.sentFirstRead = false;
        return;
      }
      this.hadReadThisSession = true;

      // Od drugiego odczytu radio poprzedza odpowiedz potwierdzeniem.
      if (this.sentFirstRead) this.outbox.push(ACK);
      this.sentFirstRead = true;

      this.outbox.push(CMD_WRITE, (addr >> 8) & 0xff, addr & 0xff, size);
      this.outbox.push(...this.memory.subarray(addr, addr + size));
      this.pendingReadAck = true;
      return;
    }

    if (cmd === CMD_WRITE && this.inbox.length >= 4) {
      const size = this.inbox[3]!;
      if (this.inbox.length < 4 + size) return;

      const addr = (this.inbox[1]! << 8) | this.inbox[2]!;
      const payload = this.inbox.slice(4, 4 + size);
      this.inbox = [];
      this.frames++;

      // Zapis jako pierwsza komenda po powitaniu: zaden sterownik tak nie robi
      // (CHIRP przed uploadem czyta bloki aux) i radio na Windows 7 wlasnie na tym
      // milklo. Atrapa odtwarza to zachowanie, zeby kod musial najpierw czytac.
      if (!this.hadReadThisSession) return;

      this.wroteThisSession = true;
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
