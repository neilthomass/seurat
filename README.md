# Video to ASCII Art

Convert videos into ASCII art animations with colored characters.

## Features

- Converts video to 15 FPS ASCII art
- Preserves colors from original video
- Customizable ASCII character set (`F$V*`)
- Maximum contrast enhancement
- Random noise effect for animated look
- White background with transparent bright areas

## Installation

```bash
uv sync
```

## Usage

**Convert a video:**
```bash
uv run convert_video.py input.mp4
```

**With options:**
```bash
uv run convert_video.py input.mp4 --output output.mp4 --fps 15 --width 240
```

**Run individual steps:**
```bash
# Step 1: Extract frames at 15 FPS
uv run step1_extract_frames.py video.mp4 --output-dir frames

# Step 2: Convert frames to ASCII art
uv run step2_convert_to_ascii.py --input-dir frames --output-dir ascii_frames --width 240

# Step 3: Stitch frames back into video
uv run step3_stitch_video.py --input-dir ascii_frames --output output.mp4
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--output` | `{input}_ascii.mp4` | Output video path |
| `--fps` | 15 | Target frames per second |
| `--width` | 240 | ASCII characters per row |
| `--keep-temp` | false | Keep temporary frame directories |

## Requirements

- Python 3.11+
- OpenCV
- Pillow
- NumPy
