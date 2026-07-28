/**
 * Sterowanie kreatorem. Trzy ekrany, jedna decyzja na ekran.
 *
 * Zasada, ktora rzadzi tym plikiem: uzytkownik nigdy nie widzi dwoch rzeczy do zrobienia naraz,
 * a przycisk zapisu jest nieaktywny, dopoki nie powstanie kopia zapasowa.
 */

import { ALL_SETS, countChannels, type FrequencySet } from '../data/bands.ts';
import { buildChannels } from '../data/build-channels.ts';
import { writeChannelsIntoImage, CHANNEL_COUNT } from '../radio/uv5r-memory.ts';
import { identify, readMainMemory, writeChannels, RadioError } from '../radio/uv5r-protocol.ts';
import { WebSerialTransport, isWebSerialSupported } from '../radio/web-serial.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Brak elementu #${id} w dokumencie`);
  return el as T;
};

let transport: WebSerialTransport | null = null;
/** Obraz pamieci odczytany z radia. Modyfikujemy jego kopie, oryginal zostaje na kopie zapasowa. */
let radioImage: Uint8Array | null = null;
let backupDone = false;
const selected = new Set<string>();

function showError(err: unknown): void {
  const box = $('error');
  const msg =
    err instanceof RadioError
      ? `${err.message}${err.hint ? `. ${err.hint}` : ''}`
      : 'Coś poszło nie tak. Odłącz kabel, włącz radio ponownie i spróbuj od początku.';
  box.textContent = msg;
  box.hidden = false;
}

function clearError(): void {
  $('error').hidden = true;
}

function show(stepId: string): void {
  for (const id of ['step-connect', 'step-choose', 'step-write', 'step-done']) {
    $(id).hidden = id !== stepId;
  }
}

/** Rysuje kafelki zestawow. Kazdy niesie informacje, czy wolno na nim nadawac. */
function renderSets(): void {
  const box = $('sets');
  box.innerHTML = '';
  for (const set of ALL_SETS) {
    const label = document.createElement('label');
    label.className = 'set';
    label.innerHTML = `
      <input type="checkbox" value="${set.id}" />
      <span>
        <span class="set-label">${set.label}</span>
        <p class="set-desc">${set.description}</p>
        <span class="tag ${set.txPolicy === 'receive-only' ? 'rx' : 'tx'}">
          ${set.txPolicy === 'receive-only' ? 'Tylko słuchanie' : 'Nadawanie po okazaniu pozwolenia'}
        </span>
        <p class="legal">${set.legalNote}</p>
      </span>`;
    const input = label.querySelector('input')!;
    input.addEventListener('change', () => {
      if (input.checked) selected.add(set.id);
      else selected.delete(set.id);
      updateCounter();
    });
    box.appendChild(label);
  }
  updateCounter();
}

function chosenSets(): FrequencySet[] {
  return ALL_SETS.filter((s) => selected.has(s.id));
}

/** Licznik kanalow. Uzytkownik musi wiedziec, ze radio ma tylko 128 miejsc. */
function updateCounter(): void {
  const sets = chosenSets();
  const total = countChannels(sets);
  const counter = $('counter');
  const next = $<HTMLButtonElement>('btn-next');

  if (total === 0) {
    counter.textContent = 'Nie wybrano jeszcze niczego.';
    next.disabled = true;
    return;
  }
  next.disabled = false;
  counter.textContent =
    total > CHANNEL_COUNT
      ? `Wybrano ${total} kanałów, a radio mieści ${CHANNEL_COUNT}. Zapiszemy pierwsze ${CHANNEL_COUNT}, reszta się nie zmieści.`
      : `Wybrano ${total} z ${CHANNEL_COUNT} miejsc w radiu.`;
}

function setProgress(done: number, total: number): void {
  $('progress').hidden = false;
  $('bar').style.width = `${Math.round((done / total) * 100)}%`;
}

async function connect(): Promise<void> {
  clearError();
  const btn = $<HTMLButtonElement>('btn-connect');
  btn.disabled = true;
  btn.textContent = 'Łączę z radiem...';
  try {
    transport = await WebSerialTransport.request();
    await identify(transport);
    radioImage = await readMainMemory(transport, setProgress);
    show('step-choose');
  } catch (err) {
    showError(err);
    await transport?.close().catch(() => {});
    transport = null;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Połącz z radiem';
  }
}

/**
 * Zapisuje na dysk to, co bylo w radiu przed nasza ingerencja.
 * Bez tego kroku nie odblokowujemy zapisu - to jedyna droga powrotu, gdyby cos poszlo zle.
 */
function downloadBackup(): void {
  if (!radioImage) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  // slice() daje wlasny bufor, wiec plik na dysku nie zmieni sie, gdy pozniej ruszymy obraz.
  const buffer = radioImage.slice().buffer as ArrayBuffer;
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kopia-radia-${stamp}.img`;
  a.click();
  URL.revokeObjectURL(a.href);

  backupDone = true;
  const status = $('backup-status');
  status.textContent = 'Kopia zapisana w folderze Pobrane. Nie kasuj tego pliku.';
  status.hidden = false;
  $<HTMLButtonElement>('btn-write').disabled = false;
}

async function writeToRadio(): Promise<void> {
  if (!transport || !radioImage || !backupDone) return;
  clearError();
  const btn = $<HTMLButtonElement>('btn-write');
  btn.disabled = true;
  btn.textContent = 'Zapisuję...';

  try {
    const hasLicense = $<HTMLInputElement>('has-license').checked;
    const result = buildChannels(chosenSets(), { hasLicense });

    // Pracujemy na kopii, zeby obraz z radia zostal nietkniety na wypadek ponowienia.
    const image = radioImage.slice();
    writeChannelsIntoImage(image, result.channels);
    await writeChannels(transport, image, setProgress);

    const parts = [`Zapisano ${result.channels.length} kanałów.`];
    if (result.receiveOnly > 0) {
      parts.push(`${result.receiveOnly} z nich radio będzie tylko słuchać, bez możliwości nadawania.`);
    }
    if (result.dropped > 0) {
      parts.push(`${result.dropped} kanałów się nie zmieściło.`);
    }
    parts.push('Wyłącz radio i włącz je ponownie, żeby zobaczyć nowe kanały.');
    $('done-text').textContent = parts.join(' ');
    show('step-done');
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Zapisz kanały do radia';
  }
}

function init(): void {
  if (!isWebSerialSupported()) {
    $('browser-warning').hidden = false;
    $<HTMLButtonElement>('btn-connect').disabled = true;
    return;
  }
  renderSets();
  $('btn-connect').addEventListener('click', connect);
  $('btn-next').addEventListener('click', () => show('step-write'));
  $('btn-backup').addEventListener('click', downloadBackup);
  $('btn-write').addEventListener('click', writeToRadio);
  $('btn-restart').addEventListener('click', () => show('step-choose'));
  $<HTMLInputElement>('has-license').addEventListener('change', updateCounter);
}

init();
