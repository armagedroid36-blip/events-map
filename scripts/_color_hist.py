from PIL import Image

img = Image.open(r'C:\Users\armag\AppData\Local\Temp\canvas_frame.png').convert('RGB')
small = img.resize((img.width // 4, img.height // 4))
colors = small.getcolors(maxcolors=10_000_000)
colors.sort(reverse=True)
print('top colors:', colors[:8])

def count_near(small, rgb, tol=40):
    n = 0
    for y in range(small.height):
        for x in range(small.width):
            r, g, b = small.getpixel((x, y))
            if abs(r-rgb[0]) < tol and abs(g-rgb[1]) < tol and abs(b-rgb[2]) < tol:
                n += 1
    return n

print('turquoise water (114,210,207):', count_near(small, (114, 210, 207)))
print('orange (230,99,67):', count_near(small, (230, 99, 67)))
print('ne-blue ocean (150,180,220)-ish:', count_near(small, (160, 190, 230)))
print('background (250,247,242):', count_near(small, (250, 247, 242)))
