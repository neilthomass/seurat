"""
Step 2: Convert frames to ASCII art based on color gradients
"""

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os
import argparse
import random
from pathlib import Path


# ASCII characters ordered by visual density (dark to light)
# Last character is space for white/bright areas (will be skipped on white background)
ASCII_CHARS = "F$V* "

# Brightness threshold - pixels brighter than this are considered "white" and skipped
WHITE_THRESHOLD = 240

# Character dimensions for monospace font rendering
CHAR_WIDTH = 10
CHAR_HEIGHT = 18


def get_color_ascii_char(r: int, g: int, b: int, noise: bool = True) -> tuple[str | None, tuple[int, int, int]]:
    """
    Get ASCII character based on pixel brightness while preserving color.

    Args:
        r, g, b: RGB values
        noise: Whether to add random noise to character selection

    Returns:
        Tuple of (ASCII character or None for white, RGB color)
    """
    # Calculate perceived brightness using luminance formula
    brightness = 0.299 * r + 0.587 * g + 0.114 * b

    # Skip very bright pixels (will show as white background)
    if brightness >= WHITE_THRESHOLD:
        return None, (r, g, b)

    # Map brightness to ASCII character index (excluding the space character)
    # Use chars 0-8 (excluding last space) for actual content
    char_index = int((brightness / WHITE_THRESHOLD) * (len(ASCII_CHARS) - 2))
    char_index = min(char_index, len(ASCII_CHARS) - 2)

    # Add random noise to character selection for animated effect
    if noise and len(ASCII_CHARS) > 2:
        # Randomly shift by -1, 0, or +1 with some probability
        if random.random() < 0.15:  # 15% chance of noise
            shift = random.choice([-1, 1])
            char_index = max(0, min(len(ASCII_CHARS) - 2, char_index + shift))

    char = ASCII_CHARS[char_index]

    return char, (r, g, b)


def maximize_contrast(frame: np.ndarray) -> np.ndarray:
    """
    Maximize contrast of a frame by stretching histogram to full range.

    Args:
        frame: BGR image from OpenCV

    Returns:
        Contrast-enhanced BGR image
    """
    # Convert to LAB color space for better contrast adjustment
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to L channel
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l = clahe.apply(l)

    # Also stretch to full range for maximum contrast
    l = cv2.normalize(l, None, 0, 255, cv2.NORM_MINMAX)

    # Merge and convert back to BGR
    lab = cv2.merge([l, a, b])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def frame_to_ascii_image(
    frame: np.ndarray,
    output_width: int = 240,
    bg_color: tuple[int, int, int] = (255, 255, 255)
) -> Image.Image:
    """
    Convert a video frame to an ASCII art image with colors.

    Args:
        frame: BGR image from OpenCV
        output_width: Number of ASCII characters per row
        bg_color: Background color RGB

    Returns:
        PIL Image of the colored ASCII art
    """
    # Maximize contrast before conversion
    frame = maximize_contrast(frame)

    # Convert BGR to RGB
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    height, width = frame_rgb.shape[:2]

    # Calculate output dimensions maintaining aspect ratio
    # Account for character aspect ratio (height > width)
    aspect_ratio = height / width
    char_aspect = CHAR_HEIGHT / CHAR_WIDTH
    output_height = int(output_width * aspect_ratio / char_aspect)

    # Resize frame to match ASCII grid
    resized = cv2.resize(frame_rgb, (output_width, output_height))

    # Create output image
    img_width = output_width * CHAR_WIDTH
    img_height = output_height * CHAR_HEIGHT
    ascii_image = Image.new("RGB", (img_width, img_height), bg_color)
    draw = ImageDraw.Draw(ascii_image)

    # Try to load a monospace font
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 14)
    except (IOError, OSError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 14)
        except (IOError, OSError):
            font = ImageFont.load_default()

    # Convert each pixel to ASCII with color
    for y in range(output_height):
        for x in range(output_width):
            r, g, b = resized[y, x]
            char, color = get_color_ascii_char(r, g, b)

            # Skip white/bright pixels (leave as background)
            if char is None:
                continue

            # Draw the character at the corresponding position
            pos_x = x * CHAR_WIDTH
            pos_y = y * CHAR_HEIGHT
            draw.text((pos_x, pos_y), char, font=font, fill=color)

    return ascii_image


def convert_frames_to_ascii(
    input_dir: str,
    output_dir: str,
    ascii_width: int = 120
) -> int:
    """
    Convert all frames in a directory to ASCII art images.

    Args:
        input_dir: Directory containing input frames
        output_dir: Directory to save ASCII art images
        ascii_width: Number of ASCII characters per row

    Returns:
        Number of frames converted
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Get all PNG frames sorted by name
    frames = sorted(input_path.glob("frame_*.png"))
    total_frames = len(frames)

    if total_frames == 0:
        raise ValueError(f"No frames found in {input_dir}")

    print(f"Converting {total_frames} frames to ASCII art...")
    print(f"ASCII width: {ascii_width} characters")

    for i, frame_path in enumerate(frames):
        # Read frame
        frame = cv2.imread(str(frame_path))
        if frame is None:
            print(f"Warning: Could not read {frame_path}")
            continue

        # Convert to ASCII art image
        ascii_img = frame_to_ascii_image(frame, ascii_width)

        # Save output
        output_file = output_path / f"ascii_{i:06d}.png"
        ascii_img.save(str(output_file))

        # Progress indicator
        if (i + 1) % 10 == 0 or i == total_frames - 1:
            print(f"  Processed {i + 1}/{total_frames} frames")

    print(f"Saved ASCII frames to {output_dir}")
    return total_frames


def main():
    parser = argparse.ArgumentParser(description="Convert frames to colored ASCII art")
    parser.add_argument(
        "--input-dir",
        default="frames",
        help="Input directory containing frames (default: frames)"
    )
    parser.add_argument(
        "--output-dir",
        default="ascii_frames",
        help="Output directory for ASCII frames (default: ascii_frames)"
    )
    parser.add_argument(
        "--width",
        type=int,
        default=240,
        help="Number of ASCII characters per row (default: 240)"
    )

    args = parser.parse_args()

    if not os.path.exists(args.input_dir):
        print(f"Error: Input directory not found: {args.input_dir}")
        return 1

    try:
        convert_frames_to_ascii(args.input_dir, args.output_dir, args.width)
        return 0
    except Exception as e:
        print(f"Error: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
