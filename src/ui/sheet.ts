/**
 * Arkusz kanalow - to, co faktycznie pojdzie do radia.
 *
 * Stoi miedzy wyborem zestawow a zapisem. Uzytkownik moze tu wszystko zmienic,
 * dopisac wlasne czestotliwosci albo usunac zbedne. Nic nie jest zablokowane -
 * wartosc poza pasmem radia dostaje ostrzezenie, ale zapisac ja mozna.
 */

import type { Channel, Bandwidth, Power } from '../radio/uv5r-memory.ts';
import { CHANNEL_COUNT, NAME_LENGTH, CTCSS_TONES } from '../radio/uv5r-memory.ts';
import { formatFreq, t, type Lang } from '../i18n/index.ts';

/** Pasma, ktore obsluguje rodzina UV-5R. Poza nimi radio nie odbiera ani nie nadaje. */
const BANDS: Array<[number, number]> = [
  [136_000_000, 174_000_000],
  [400_000_000, 520_000_000],
];

export function isInBand(hz: number): boolean {
  return BANDS.some(([from, to]) => hz >= from && hz <= to);
}

/**
 * Zamienia to, co uzytkownik wpisal, na czestotliwosc w Hz.
 * Przyjmuje i kropke, i przecinek, bo ludzie pisza raz tak, raz tak.
 */
export function parseFreq(input: string): number | null {
  const cleaned = input.trim().replace(',', '.').replace(/\s+/g, '');
  if (!/^\d{1,3}(\.\d{1,5})?$/.test(cleaned)) return null;
  const mhz = Number(cleaned);
  if (!Number.isFinite(mhz)) return null;
  // Zaokraglenie do 10 Hz, bo tyle wynosi rozdzielczosc pamieci radia.
  return Math.round((mhz * 1_000_000) / 10) * 10;
}

export interface SheetCallbacks {
  onChange(channels: Channel[]): void;
}

/** Pusty kanal dopisywany przyciskiem - domyslnie w srodku pasma 2 m, pelna moc. */
function blankChannel(): Channel {
  return {
    rxFreq: 145_000_000,
    txFreq: 145_000_000,
    name: '',
    bandwidth: 'narrow',
    power: 'high',
    scan: true,
  };
}

export class ChannelSheet {
  private channels: Channel[] = [];
  private readonly root: HTMLElement;
  private readonly cb: SheetCallbacks;

  // Pola wypisane jawnie, nie przez skrocony zapis w konstruktorze - Node w trybie
  // strip-only go nie parsuje i testy przestaja sie uruchamiac.
  constructor(root: HTMLElement, cb: SheetCallbacks) {
    this.root = root;
    this.cb = cb;
  }

  setChannels(channels: Channel[]): void {
    this.channels = channels.map((c) => ({ ...c }));
    this.render();
  }

  getChannels(): Channel[] {
    return this.channels;
  }

  private emit(): void {
    this.cb.onChange(this.channels);
  }

  private lang: Lang = 'en';

  setLang(lang: Lang): void {
    this.lang = lang;
    this.render();
  }

  private render(): void {
    const d = t(this.lang);
    const table = document.createElement('table');
    table.className = 'sheet';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="col-num">${d.colNum}</th>
          <th>${d.colName}</th>
          <th>${d.colRx}</th>
          <th>${d.colTx}</th>
          <th>${d.colTone}</th>
          <th class="col-flag">${d.colWide}</th>
          <th>${d.colPower}</th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>`;

    const body = table.querySelector('tbody')!;
    this.channels.forEach((ch, i) => body.appendChild(this.renderRow(ch, i, d)));

    this.root.innerHTML = '';
    this.root.appendChild(table);
  }

  private renderRow(ch: Channel, index: number, d: ReturnType<typeof t>): HTMLTableRowElement {
    const tr = document.createElement('tr');
    const rxBad = !isInBand(ch.rxFreq);

    const toneOptions = ['<option value="">-</option>']
      .concat(CTCSS_TONES.map((hz) => `<option value="${hz}"${ch.txTone === hz ? ' selected' : ''}>${hz.toFixed(1)}</option>`))
      .join('');

    tr.innerHTML = `
      <td class="col-num">${index + 1}</td>
      <td><input class="f-name" type="text" maxlength="${NAME_LENGTH}" value="${ch.name}" /></td>
      <td><input class="f-rx" type="text" inputmode="decimal" value="${(ch.rxFreq / 1e6).toFixed(5).replace(/0+$/, '').replace(/\.$/, '.0')}" /></td>
      <td><input class="f-tx" type="text" inputmode="decimal" placeholder="${d.sameAsRx}" value="${
        ch.txFreq === null || ch.txFreq === ch.rxFreq ? '' : (ch.txFreq / 1e6).toFixed(5).replace(/0+$/, '')
      }" /></td>
      <td><select class="f-tone">${toneOptions}</select></td>
      <td class="col-flag"><input class="f-wide" type="checkbox" ${ch.bandwidth === 'wide' ? 'checked' : ''} /></td>
      <td><select class="f-power">
        <option value="low"${ch.power === 'low' ? ' selected' : ''}>Low</option>
        <option value="medium"${ch.power === 'medium' ? ' selected' : ''}>Mid</option>
        <option value="high"${ch.power === 'high' ? ' selected' : ''}>High</option>
      </select></td>
      <td><button class="row-del" type="button" title="${d.removeRow}">×</button></td>`;

    if (rxBad) {
      tr.classList.add('out-of-band');
      tr.querySelector('.f-rx')!.setAttribute('title', d.outOfBand);
    }

    const nameInput = tr.querySelector<HTMLInputElement>('.f-name')!;
    nameInput.addEventListener('input', () => {
      // Radio pokazuje 7 znakow wielkimi literami - lepiej pokazac to od razu,
      // niz pozwolic wpisac cos, co po zapisie bedzie wygladac inaczej.
      ch.name = nameInput.value.toUpperCase().slice(0, NAME_LENGTH);
      nameInput.value = ch.name;
      this.emit();
    });

    const rxInput = tr.querySelector<HTMLInputElement>('.f-rx')!;
    rxInput.addEventListener('change', () => {
      const hz = parseFreq(rxInput.value);
      if (hz === null) {
        this.render();
        return;
      }
      const wasSimplex = ch.txFreq === ch.rxFreq;
      ch.rxFreq = hz;
      if (wasSimplex) ch.txFreq = hz;
      this.emit();
      this.render();
    });

    const txInput = tr.querySelector<HTMLInputElement>('.f-tx')!;
    txInput.addEventListener('change', () => {
      if (txInput.value.trim() === '') {
        ch.txFreq = ch.rxFreq;
      } else {
        const hz = parseFreq(txInput.value);
        if (hz === null) {
          this.render();
          return;
        }
        ch.txFreq = hz;
      }
      this.emit();
      this.render();
    });

    const toneSel = tr.querySelector<HTMLSelectElement>('.f-tone')!;
    toneSel.addEventListener('change', () => {
      const hz = toneSel.value === '' ? undefined : Number(toneSel.value);
      // Ten sam ton przy nadawaniu i odbiorze - tak dziala zwykly dostep do przemiennika.
      ch.txTone = hz;
      ch.rxTone = hz;
      this.emit();
    });

    tr.querySelector<HTMLInputElement>('.f-wide')!.addEventListener('change', (e) => {
      ch.bandwidth = (e.target as HTMLInputElement).checked ? 'wide' : ('narrow' as Bandwidth);
      this.emit();
    });

    tr.querySelector<HTMLSelectElement>('.f-power')!.addEventListener('change', (e) => {
      ch.power = (e.target as HTMLSelectElement).value as Power;
      this.emit();
    });

    tr.querySelector<HTMLButtonElement>('.row-del')!.addEventListener('click', () => {
      this.channels.splice(index, 1);
      this.emit();
      this.render();
    });

    return tr;
  }

  addBlank(): boolean {
    if (this.channels.length >= CHANNEL_COUNT) return false;
    this.channels.push(blankChannel());
    this.emit();
    this.render();
    return true;
  }

  clear(): void {
    this.channels = [];
    this.emit();
    this.render();
  }

  /** Ile kanalow ma czestotliwosc poza pasmem radia. */
  countOutOfBand(): number {
    return this.channels.filter((c) => !isInBand(c.rxFreq)).length;
  }

  summary(): string {
    const d = t(this.lang);
    const total = this.channels.length;
    const bad = this.countOutOfBand();
    const base = total >= CHANNEL_COUNT ? d.sheetFull(CHANNEL_COUNT) : d.selectedOf(total, CHANNEL_COUNT);
    if (bad === 0) return base;
    return `${base} (${bad} × ${d.outOfBand})`;
  }
}

export { formatFreq };
