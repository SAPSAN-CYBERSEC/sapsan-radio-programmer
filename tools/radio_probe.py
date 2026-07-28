#!/usr/bin/env python3
"""
Proba kontaktu z radiem Baofeng przez port szeregowy - TYLKO ODCZYT.

Nie zapisuje niczego do radia. Sluzy do sprawdzenia, czy protokol zaimplementowany
w programatorze zgadza sie z tym, co robi prawdziwy sprzet.
"""
import os, sys, time, termios, tty

PORT = '/dev/cu.wchusbserial1410'

MAGICS = {
    'uv82':     bytes([0x50, 0xBB, 0xFF, 0x20, 0x13, 0x01, 0x05]),
    'uv5r':     bytes([0x50, 0xBB, 0xFF, 0x20, 0x12, 0x07, 0x25]),
    'uv5rOrig': bytes([0x50, 0xBB, 0xFF, 0x01, 0x25, 0x98, 0x4D]),
    'uv6':      bytes([0x50, 0xBB, 0xFF, 0x20, 0x12, 0x08, 0x23]),
    'bfA58':    bytes([0x50, 0xBB, 0xFF, 0x20, 0x14, 0x04, 0x13]),
}
ACK = 0x06


def open_port(path):
    fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    tty.setraw(fd)
    attrs = termios.tcgetattr(fd)
    # iflag, oflag, cflag, lflag, ispeed, ospeed, cc
    attrs[0] = 0                      # bez obrobki wejscia
    attrs[1] = 0                      # bez obrobki wyjscia
    attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL   # 8N1, bez kontroli przeplywu
    attrs[3] = 0                      # tryb surowy
    attrs[4] = termios.B9600
    attrs[5] = termios.B9600
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    termios.tcflush(fd, termios.TCIOFLUSH)
    return fd


def read_exact(fd, n, timeout=1.5):
    """Czyta dokladnie n bajtow albo zwraca to, co przyszlo przed uplywem czasu."""
    buf = b''
    deadline = time.time() + timeout
    while len(buf) < n and time.time() < deadline:
        try:
            chunk = os.read(fd, n - len(buf))
            if chunk:
                buf += chunk
                continue
        except BlockingIOError:
            pass
        time.sleep(0.01)
    return buf


def try_ident(fd, name, magic):
    termios.tcflush(fd, termios.TCIOFLUSH)
    # Bajty magiczne ida pojedynczo z przerwa - radio gubi je przy wysylce hurtem.
    for b in magic:
        os.write(fd, bytes([b]))
        time.sleep(0.01)

    ack = read_exact(fd, 1)
    if not ack:
        return None, 'brak odpowiedzi'
    if ack[0] != ACK:
        return None, f'odpowiedzialo 0x{ack[0]:02X} zamiast ACK'

    os.write(fd, bytes([0x02]))
    ident = read_exact(fd, 8)
    if len(ident) != 8:
        return None, f'identyfikator ma {len(ident)} bajtow zamiast 8'

    os.write(fd, bytes([ACK]))
    confirm = read_exact(fd, 1)
    ok = bool(confirm) and confirm[0] == ACK
    return ident, ('potwierdzone' if ok else 'brak potwierdzenia po identyfikatorze')


def read_block(fd, addr, size, first):
    msg = bytes([0x53, (addr >> 8) & 0xFF, addr & 0xFF, size])
    os.write(fd, msg)
    if not first:
        ack = read_exact(fd, 1)
        if not ack or ack[0] != ACK:
            raise RuntimeError(f'brak ACK przed blokiem 0x{addr:04X}')
    header = read_exact(fd, 4)
    if len(header) != 4:
        raise RuntimeError(f'naglowek bloku 0x{addr:04X} ma {len(header)} bajtow')
    if header[0] != 0x58:
        raise RuntimeError(f'blok 0x{addr:04X}: pierwszy bajt 0x{header[0]:02X} zamiast X')
    got_addr = (header[1] << 8) | header[2]
    if got_addr != addr or header[3] != size:
        raise RuntimeError(f'blok 0x{addr:04X}: radio odpowiedzialo adresem 0x{got_addr:04X}/{header[3]}')
    data = read_exact(fd, size)
    if len(data) != size:
        raise RuntimeError(f'blok 0x{addr:04X}: {len(data)} z {size} bajtow')
    return data


def main():
    if not os.path.exists(PORT):
        print(f'BRAK PORTU {PORT}')
        return 1
    fd = open_port(PORT)
    # Radio nie odpowiada na powitanie wyslane natychmiast po otwarciu portu.
    time.sleep(0.4)
    print(f'port otwarty: {PORT}, 9600 8N1\n')

    found = None
    for name, magic in MAGICS.items():
        ident, note = try_ident(fd, name, magic)
        print(f'  {name:9} -> {"OK  " if ident else "nie "} {note}')
        if ident:
            found = (name, ident)
            break
        time.sleep(0.3)

    if not found:
        print('\nZadna sekwencja powitalna nie zadzialala.')
        os.close(fd)
        return 2

    name, ident = found
    print(f'\nROZPOZNANE: {name}')
    print(f'identyfikator: {ident.hex(" ")}  |  ascii: {ident.decode("ascii", "replace")!r}')

    print('\nodczyt pamieci...')
    blocks = []
    first = True
    t0 = time.time()
    try:
        for addr in range(0, 0x1800, 0x40):
            blocks.append(read_block(fd, addr, 0x40, first))
            first = False
    except RuntimeError as e:
        print(f'  przerwane: {e}')
    image = b''.join(blocks)
    print(f'  odczytano {len(image)} z 6144 bajtow w {time.time() - t0:.1f} s')

    if len(image) >= 0x40:
        out = os.path.expanduser('~/Downloads/uv82-odczyt-testowy.img')
        open(out, 'wb').write(image)
        print(f'  zapisane do {out}')
        print(f'\npierwsze 3 pozycje kanalow:')
        for i in range(3):
            raw = image[i * 16:(i + 1) * 16]
            if raw[0] == 0xFF:
                print(f'  {i + 1}: pusty')
                continue
            # BCD little-endian, jednostki 10 Hz
            digits = ''.join(f'{b >> 4}{b & 0x0F}' for b in reversed(raw[0:4]))
            print(f'  {i + 1}: rx={int(digits) / 100000:.5f} MHz   raw={raw.hex(" ")}')

    os.close(fd)
    return 0


if __name__ == '__main__':
    sys.exit(main())
