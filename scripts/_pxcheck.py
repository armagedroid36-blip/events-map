import zlib, struct, sys

def read_png(path):
    data = open(path, 'rb').read()
    pos = 8
    idat = b''
    w = h = None
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h = struct.unpack('>II', chunk[:8])
        elif typ == b'IDAT':
            idat += chunk
        pos += 12 + ln
    raw = zlib.decompress(idat)
    bpp = 4  # RGBA
    stride = w * bpp
    return w, h, raw, stride

def px(raw, stride, w, h, fx, fy):
    x = int(w * fx)
    y = int(h * fy)
    off = y * stride + x * 4
    return tuple(raw[off:off+4])

path = sys.argv[1]
w, h, raw, stride = read_png(path)
print('size', w, 'x', h)
# Центр экрана — океан (вода), верх — тоже океан; низ-центр может быть суша
for name, fx, fy in [('центр', 0.5, 0.5), ('верх', 0.5, 0.3), ('низ', 0.5, 0.75), ('слева', 0.3, 0.5)]:
    print(name, px(raw, stride, w, h, fx, fy))

# Поиск оранжевых кластеров (#E66343 = 230,99,67) с допуском
count = 0
step = 8
for y in range(0, h, step):
    for x in range(0, w, step):
        off = y * stride + x * 4
        r, g, b = raw[off], raw[off+1], raw[off+2]
        if abs(r-230) < 40 and abs(g-99) < 40 and abs(b-67) < 40:
            count += 1
print('orange-ish pixels (step 8):', count)
