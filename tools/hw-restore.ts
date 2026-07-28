/**
 * Przywraca radio z pliku kopii.
 *
 *   node --experimental-strip-types tools/hw-restore.ts <plik.img> [rodzina]
 *
 * Uzywa tego samego kodu protokolu co przegladarka. Sprawdza plik przed wyslaniem
 * i porownuje wynik odczytem po zapisie.
 */

import { readFileSync } from 'node:fs';
import { openSync, readSync, writeSync, closeSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';

import {
  identify,
  writeChannels,
  readMainMemory,
  looksLikeUv5rImage,
  type Transport,
  type RadioFamily,
} from '../src/radio/uv5r-protocol.ts';
import { decodeChannel, CHANNELS_ADDR, CHANNEL_SIZE } from '../src/radio/uv5r-memory.ts';

const PORT = process.env.RADIO_PORT ?? '/dev/cu.wchusbserial1410';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class NodeSerialTransport implements Transport {
  private fd: number;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.fd = this.openFd();
  }

  private openFd(): number {
    execFileSync('stty', ['-f', this.path, '9600', 'cs8', '-cstopb', '-parenb', 'clocal', 'raw', '-echo']);
    return openSync(this.path, constants.O_RDWR | constants.O_NOCTTY | constants.O_NONBLOCK);
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
    const scrap = new Uint8Array(256);
    try {
      readSync(this.fd, scrap, 0, scrap.length, null);
    } catch {
      // pusty bufor
    }
  }

  async reconnect(): Promise<void> {
    closeSync(this.fd);
    // Radio po zakonczonej sesji potrzebuje dluzszej przerwy niz sekunda.
    await sleep(4000);
    this.fd = this.openFd();
    await sleep(500);
  }

  close(): void {
    closeSync(this.fd);
  }
}

function summarize(image: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < 128; i++) {
    const ch = decodeChannel(image.slice(CHANNELS_ADDR + i * CHANNEL_SIZE, CHANNELS_ADDR + (i + 1) * CHANNEL_SIZE));
    if (ch) out.push(`    ${i + 1}: ${(ch.rxFreq / 1e6).toFixed(5)} MHz`);
  }
  return out;
}

async function main() {
  const file = process.argv[2];
  const family = (process.argv[3] ?? 'uv82') as RadioFamily;
  if (!file) {
    console.error('podaj plik kopii');
    process.exit(1);
  }

  const image = new Uint8Array(readFileSync(file));
  console.log(`plik: ${file} (${image.length} B), walidacja: ${looksLikeUv5rImage(image)}`);
  if (!looksLikeUv5rImage(image)) {
    console.error('plik nie wyglada na kopie tej rodziny radia - przerywam');
    process.exit(2);
  }
  console.log('kanaly w pliku:');
  console.log(summarize(image).join('\n'));

  const t = new NodeSerialTransport(PORT);
  await sleep(500);
  try {
    await identify(t, family);
    console.log('\npowitanie OK, zapisuje...');
    const t0 = Date.now();
    await writeChannels(t, image);
    console.log(`  zapisane w ${((Date.now() - t0) / 1000).toFixed(1)} s`);

    await t.reconnect();
    await identify(t, family);
    const back = await readMainMemory(t);
    const same = back.every((b, i) => b === image[i]);
    console.log(`\nodczyt kontrolny - obraz zgodny z plikiem: ${same}`);
    console.log('kanaly w radiu:');
    console.log(summarize(back).join('\n'));
  } finally {
    t.close();
  }
}

main().catch((err) => {
  console.error('\nBLAD:', err instanceof Error ? err.message : err);
  process.exit(1);
});
