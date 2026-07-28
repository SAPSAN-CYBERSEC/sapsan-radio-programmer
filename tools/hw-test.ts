/**
 * Test calego lancucha na fizycznym radiu.
 *
 * Uzywa DOKLADNIE tego samego kodu protokolu, ktory idzie do przegladarki -
 * podmieniona jest tylko warstwa transportu, bo Web Serial nie istnieje w Node.
 * Dzieki temu test sprawdza `uv5r-protocol.ts`, a nie jego kopie.
 *
 *   node --experimental-strip-types tools/hw-test.ts [--write]
 *
 * Bez `--write` robi wylacznie odczyt. Z `--write` przechodzi pelny cykl:
 * kopia -> zapis PMR446 -> weryfikacja -> przywrocenie kopii -> weryfikacja.
 */

import { openSync, readSync, writeSync, closeSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';

import {
  identify,
  readMainMemory,
  writeChannels,
  verifyChannels,
  looksLikeUv5rImage,
  type Transport,
} from '../src/radio/uv5r-protocol.ts';
import { writeChannelsIntoImage, decodeChannel, CHANNELS_ADDR, CHANNEL_SIZE } from '../src/radio/uv5r-memory.ts';
import { buildChannels } from '../src/data/build-channels.ts';
import { PMR446 } from '../src/data/bands.ts';

const PORT = process.env.RADIO_PORT ?? '/dev/cu.wchusbserial1410';
const BACKUP = `${process.env.HOME}/Downloads/uv82-kopia-przed-testem.img`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Transport na zwyklym pliku urzadzenia - odpowiednik WebSerialTransport dla Node. */
class NodeSerialTransport implements Transport {
  private fd: number;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    // Node nie ma termios, wiec parametry lacza ustawia stty.
    // `clocal` jest tu istotne: bez niego sterownik czeka na sygnal DCD, ktorego
    // kabel do krotkofalowki nie podaje, i odczyt nigdy nie rusza.
    execFileSync('stty', ['-f', path, '9600', 'cs8', '-cstopb', '-parenb', 'clocal', 'raw', '-echo']);
    this.fd = openSync(path, constants.O_RDWR | constants.O_NOCTTY | constants.O_NONBLOCK);
  }

  async write(data: Uint8Array): Promise<void> {
    writeSync(this.fd, data);
  }

  async read(length: number): Promise<Uint8Array> {
    const out = new Uint8Array(length);
    let got = 0;
    const deadline = Date.now() + 1500;
    while (got < length) {
      if (Date.now() > deadline) throw new Error(`timeout: ${got} z ${length} bajtow`);
      try {
        const n = readSync(this.fd, out, got, length - got, null);
        // Port nieblokujacy zwraca 0, gdy nie ma jeszcze danych - to nie koniec transmisji.
        if (n === 0) await sleep(10);
        else got += n;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EAGAIN') throw err;
        await sleep(10);
      }
    }
    return out;
  }

  async flush(): Promise<void> {
    // Wyczytaj wszystko, co zostalo w buforze po poprzedniej rozmowie.
    const scrap = new Uint8Array(256);
    for (;;) {
      try {
        if (readSync(this.fd, scrap, 0, scrap.length, null) === 0) break;
      } catch {
        break;
      }
    }
  }

  /** Radio po nietrafionej sekwencji powitalnej wraca do rozmowy dopiero po tym. */
  async reconnect(): Promise<void> {
    closeSync(this.fd);
    await sleep(1000);
    execFileSync('stty', ['-f', this.path, '9600', 'cs8', '-cstopb', '-parenb', 'clocal', 'raw', '-echo']);
    this.fd = openSync(this.path, constants.O_RDWR | constants.O_NOCTTY | constants.O_NONBLOCK);
    await sleep(500);
  }

  close(): void {
    closeSync(this.fd);
  }
}

function describeChannels(image: Uint8Array, limit = 5): string[] {
  const out: string[] = [];
  for (let i = 0; i < 128 && out.length < limit; i++) {
    const ch = decodeChannel(image.slice(CHANNELS_ADDR + i * CHANNEL_SIZE, CHANNELS_ADDR + (i + 1) * CHANNEL_SIZE));
    if (ch) out.push(`    ${i + 1}: ${(ch.rxFreq / 1e6).toFixed(5)} MHz`);
  }
  return out;
}

function countUsed(image: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < 128; i++) {
    if (decodeChannel(image.slice(CHANNELS_ADDR + i * CHANNEL_SIZE, CHANNELS_ADDR + (i + 1) * CHANNEL_SIZE))) n++;
  }
  return n;
}

const step = (msg: string) => console.log(`\n=== ${msg}`);

async function main() {
  const doWrite = process.argv.includes('--write');
  const t = new NodeSerialTransport(PORT);
  // Ta sama pauza co w przegladarce - bez niej radio nie odpowiada na powitanie.
  await sleep(500);

  try {
    step('powitanie');
    // Model podany wprost - zgadywanie po kolei wprowadza radio w stan, w ktorym milknie.
    const id = await identify(t, 'uv82');
    console.log(`  rodzina: ${id.family}, identyfikator: ${Buffer.from(id.ident).toString('hex')}`);

    step('odczyt pamieci');
    const t0 = Date.now();
    const original = await readMainMemory(t);
    console.log(`  ${original.length} bajtow w ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log(`  walidacja kopii: ${looksLikeUv5rImage(original)}`);
    console.log(`  zajete pozycje: ${countUsed(original)}`);
    console.log(describeChannels(original).join('\n'));

    // Kopii nie nadpisujemy: przy drugim uruchomieniu w radiu siedza juz nasze
    // kanaly testowe i zapisanie ich jako "kopii" skasowaloby jedyna droge powrotu.
    if (existsSync(BACKUP)) {
      console.log(`  kopia juz istnieje, zostawiam nietknieta: ${BACKUP}`);
    } else {
      writeFileSync(BACKUP, original);
      console.log(`  kopia zapisana: ${BACKUP}`);
    }

    if (!doWrite) {
      console.log('\n(bez --write, koniec na odczycie)');
      return;
    }

    step('zapis PMR446');
    const modified = original.slice();
    const { channels } = buildChannels([PMR446]);
    writeChannelsIntoImage(modified, channels);
    const t1 = Date.now();
    await writeChannels(t, modified);
    console.log(`  zapisane w ${((Date.now() - t1) / 1000).toFixed(1)} s`);

    step('weryfikacja zapisu');
    const v1 = await verifyChannels(t, modified, undefined, 'uv82');
    console.log(`  zgodnosc: ${v1.ok}${v1.ok ? '' : ` (pierwsza roznica @ 0x${v1.mismatchAt?.toString(16)})`}`);

    step('kontrolny odczyt niezalezny od weryfikacji');
    await t.flush();
    await t.reconnect();
    await identify(t, 'uv82');
    const readBack = await readMainMemory(t);
    console.log(`  zajete pozycje: ${countUsed(readBack)}`);
    console.log(describeChannels(readBack).join('\n'));

    step('przywrocenie kopii');
    await t.flush();
    await t.reconnect();
    await identify(t, 'uv82');
    await writeChannels(t, original);
    const v2 = await verifyChannels(t, original, undefined, 'uv82');
    console.log(`  zgodnosc po przywroceniu: ${v2.ok}`);

    step('kontrolny odczyt po przywroceniu');
    await t.flush();
    await t.reconnect();
    await identify(t, 'uv82');
    const restored = await readMainMemory(t);
    console.log(`  zajete pozycje: ${countUsed(restored)}`);
    console.log(describeChannels(restored).join('\n'));

    const same = restored.every((b, i) => b === original[i]);
    console.log(`\n  obraz identyczny z kopia sprzed testu: ${same}`);
  } finally {
    t.close();
  }
}

main().catch((err) => {
  console.error('\nBLAD:', err instanceof Error ? err.message : err);
  process.exit(1);
});
