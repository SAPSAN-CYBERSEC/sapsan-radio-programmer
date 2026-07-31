/**
 * Diagnostyka polaczenia z radiem - narzedzie dla przypadkow "port jest, radio milczy".
 *
 * Wlacza sie parametrem `?diag` w adresie, bo to narzedzie serwisowe, nie czesc kreatora.
 * Zamiast jednego "radio nie odpowiedzialo" pokazuje, co dokladnie poszlo na port i co
 * z niego wrocilo - z podzialem na kombinacje linii sterujacych, bo to one najczesciej
 * roznia sterowniki miedzy systemami.
 *
 * Wynik jest po angielsku i celowo surowy: to material do wklejenia w zgloszeniu, a nie
 * komunikat dla klienta.
 */

import { MAGICS, type RadioFamily } from '../radio/uv5r-protocol.ts';

/** Kombinacje linii sterujacych do sprawdzenia, w kolejnosci od najbardziej prawdopodobnej. */
const SIGNAL_MODES: Array<{ name: string; signals: SerialOutputSignals }> = [
  { name: 'DTR+RTS', signals: { dataTerminalReady: true, requestToSend: true } },
  { name: 'DTR only', signals: { dataTerminalReady: true, requestToSend: false } },
  { name: 'RTS only', signals: { dataTerminalReady: false, requestToSend: true } },
  { name: 'no signals', signals: { dataTerminalReady: false, requestToSend: false } },
];

const SETTLE_MS = 1200;
const LISTEN_MS = 2500;
const BAUD_RATE = 9600;

const hex = (bytes: number[]): string =>
  bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Czyta z portu przez zadany czas i oddaje wszystko, co przyszlo.
 * Nie przerywa po pierwszej porcji - interesuje nas calosc odpowiedzi, takze spozniona.
 */
async function listen(port: SerialPort, ms: number): Promise<number[]> {
  const reader = port.readable!.getReader();
  const got: number[] = [];
  const deadline = Date.now() + ms;
  try {
    while (Date.now() < deadline) {
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), deadline - Date.now()));
      const result = await Promise.race([reader.read(), timeout]);
      if (result === null) break;
      if (result.value?.length) got.push(...result.value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Port zaraz zamykamy - blad anulowania niczego nie zmienia.
    }
    try {
      reader.releaseLock();
    } catch {
      // j.w.
    }
  }
  return got;
}

/** Wysyla sekwencje powitalna bajt po bajcie - hurtem radio ja gubi. */
async function sendMagic(port: SerialPort, magic: Uint8Array): Promise<void> {
  const writer = port.writable!.getWriter();
  try {
    for (const byte of magic) {
      await writer.write(new Uint8Array([byte]));
      await sleep(10);
    }
  } finally {
    writer.releaseLock();
  }
}

export async function runDiagnostics(family: RadioFamily, onLine: (line: string) => void): Promise<void> {
  const magic = MAGICS[family];
  onLine(`Model: ${family}, greeting: ${hex([...magic])}`);
  onLine(`User agent: ${navigator.userAgent}`);

  if (!('serial' in navigator)) {
    onLine('FAIL: this browser has no Web Serial API.');
    return;
  }

  let port: SerialPort;
  try {
    port = await navigator.serial.requestPort();
  } catch {
    onLine('FAIL: no port was selected.');
    return;
  }

  const info = port.getInfo();
  onLine(`Port picked: vendorId=${info.usbVendorId ?? '?'} productId=${info.usbProductId ?? '?'}`);

  for (const mode of SIGNAL_MODES) {
    try {
      await port.open({ baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: 'none' });
    } catch (e) {
      onLine(`${mode.name}: cannot open port - ${(e as Error).message}`);
      return;
    }

    let signalsOk = true;
    try {
      await port.setSignals(mode.signals);
    } catch (e) {
      signalsOk = false;
      onLine(`${mode.name}: setSignals failed - ${(e as Error).message}`);
    }

    await sleep(SETTLE_MS);
    try {
      await sendMagic(port, magic);
      const got = await listen(port, LISTEN_MS);
      onLine(
        `${mode.name}${signalsOk ? '' : ' (signals not set)'}: ` +
          (got.length ? `GOT ${got.length} byte(s): ${hex(got)}` : 'silence'),
      );
      if (got.length) {
        onLine(`>>> The radio answered with ${mode.name}. <<<`);
        await port.close();
        return;
      }
    } catch (e) {
      onLine(`${mode.name}: error - ${(e as Error).message}`);
    }

    // Radio, ktore dostalo powitanie i nie odpowiedzialo, wraca do rozmowy dopiero
    // po ponownym otwarciu portu - kolejna kombinacja musi zaczac od czystego stanu.
    try {
      await port.close();
    } catch {
      // Port zamykamy tylko po to, by otworzyc go na nowo w nastepnej iteracji.
    }
    await sleep(500);
  }

  onLine('No combination got a reply. The radio never answered on this port.');
}
