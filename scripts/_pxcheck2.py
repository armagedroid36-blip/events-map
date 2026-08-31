from PIL import Image

img = Image.open(r'C:\Users\armag\projects\events-map\_map_no_gpu.png').convert('RGB')
w, h = img.size
print('size', w, 'x', h)
pts = {'центр': (0.5, 0.5), 'верх': (0.5, 0.3), 'низ': (0.5, 0.75), 'слева': (0.3, 0.5), 'справа': (0.7, 0.5)}
for name, (fx, fy) in pts.items():
    print(name, img.getpixel((int(w*fx), int(h*fy))))

# Оранжевые кластеры #E66343 (230,99,67) с допуском
count = 0
small = img.resize((w//6, h//6))
for y in range(small.height):
    for x in range(small.width):
        r, g, b = small.getpixel((x, y))
        if abs(r-230) < 45 and abs(g-99) < 45 and abs(b-67) < 45:
            count += 1
print('orange-ish sampled pixels:', count)
# Бирюзовая вода #72D2CF (114,210,207)
cnt2 = 0
for y in range(small.height):
    for x in range(small.width):
        r, g, b = small.getpixel((x, y))
        if abs(r-114) < 45 and abs(g-210) < 45 and abs(b-207) < 45:
            cnt2 += 1
print('turquoise-ish sampled pixels:', cnt2)
