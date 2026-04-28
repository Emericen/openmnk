# Banner Creation Procedure

## Overview
Create side-by-side banner images from macOS window screenshots. The screenshots have built-in shadows and transparency (alpha channel), so no manual margin or background color needs to be added.

## Step 1: Human Takes Screenshots

> **The human must take these screenshots.** Do not attempt to capture screenshots via script or automation.

Use **macOS Screenshot tool** (`Cmd + Shift + 4`, then press `Space`) to capture **individual windows**.

- **Do NOT** use rectangle selection — that captures the desktop background behind the window
- **DO** use window selection (press `Space` after `Cmd + Shift + 4`) — this captures the window with its natural shadow and transparent background
- The resulting PNG will have an alpha channel (RGBA mode)

Save screenshots to Desktop. They will be named `Screenshot YYYY-MM-DD at HH.MM.SS AM/PM.png`.

## Step 2: Run the Banner Script

Place the latest screenshots on Desktop, then run:

```python
from PIL import Image
import glob

# Configuration
blue = (81, 171, 203)  # OpenMNK brand blue
target_height = 1664   # Resize all screenshots to this height
crop_inner = 50        # Pixels to crop from inner edges (0 for no crop)

# Get latest N screenshots from Desktop
files = sorted(glob.glob('~/Desktop/Screenshot*.png'))[-N:]
# Replace N with number of panels (2, 3, etc.)

images = []
for f in files:
    img = Image.open(f)
    # Resize to consistent height
    w = int(img.width * target_height / img.height)
    img_r = img.resize((w, target_height), Image.LANCZOS)
    images.append(img_r)

# Crop inner edges (optional — removes excess shadow between panels)
for i in range(len(images)):
    w, h = images[i].size
    if i == 0 and len(images) > 1:
        # First image: crop right edge
        images[i] = images[i].crop((0, 0, w - crop_inner, h))
    elif i == len(images) - 1 and len(images) > 1:
        # Last image: crop left edge
        images[i] = images[i].crop((crop_inner, 0, w, h))
    elif len(images) > 2:
        # Middle images: crop both edges
        images[i] = images[i].crop((crop_inner, 0, w - crop_inner, h))

# Calculate canvas size
canvas_w = sum(img.width for img in images)
canvas_h = target_height

# Create blue RGBA canvas
canvas = Image.new('RGBA', (canvas_w, canvas_h), blue + (255,))

# Paste images with alpha compositing
x = 0
for img in images:
    canvas.paste(img, (x, 0), img)
    x += img.width

# Convert to RGB for final output
canvas_rgb = Image.new('RGB', canvas.size, blue)
canvas_rgb.paste(canvas, mask=canvas.split()[3])

# Save
canvas_rgb.save('banner.png')
```

## Key Technical Details

### Why Window Screenshots Work Better
- macOS window screenshots include a **drop shadow** around the window
- The area outside the shadow is **fully transparent** (alpha = 0)
- When composited onto the blue background, the shadow blends naturally
- No need to add margins, gaps, or background colors manually

### Why Not Rectangle Screenshots?
- Rectangle captures include whatever desktop background is behind the window
- If the desktop has a different color/image, it becomes part of the screenshot
- Cropping becomes manual and imprecise

### Alpha Compositing
The screenshots are RGBA. When pasting onto the blue canvas:
- Transparent areas show the blue background
- Semi-transparent shadow pixels blend with the blue
- Fully opaque window content stays unchanged

### Inner Edge Cropping
The natural shadows create ~80-100px of space between panels. To bring panels closer:
- Crop `crop_inner` pixels from the right edge of left panels
- Crop `crop_inner` pixels from the left edge of right panels
- 50px is a good default; adjust based on visual preference

### Multi-Panel Banners (3+)
The same script works for any number of panels. The middle images get both edges cropped when `len(images) > 2`.

## Output
- File: `banner.png`
- Location: `/Users/eddyliang/Desktop/workfile/openmnk/desktop/assets/`
- Dimensions: variable width × 1664px height
