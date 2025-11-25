"""
Main script: Convert a video to ASCII art video

This script runs all three steps in sequence:
1. Extract frames from input video at 15 FPS
2. Convert each frame to colored ASCII art
3. Stitch ASCII frames back into a video
"""

import argparse
import os
import shutil
from pathlib import Path

from src.step1_extract_frames import extract_frames
from src.step2_convert_to_ascii import convert_frames_to_ascii
from src.step3_stitch_video import stitch_frames_to_video


def convert_video_to_ascii(
    input_video: str,
    output_video: str,
    fps: int = 15,
    ascii_width: int = 240,
    keep_temp: bool = False
) -> None:
    """
    Convert a video to ASCII art video.

    Args:
        input_video: Path to input video file
        output_video: Path for output ASCII video
        fps: Target FPS (default: 15)
        ascii_width: Number of ASCII characters per row (default: 240)
        keep_temp: Keep temporary frame directories (default: False)
    """
    # Create temporary directories
    frames_dir = "temp_frames"
    ascii_dir = "temp_ascii_frames"

    try:
        print("=" * 60)
        print("STEP 1: Extracting frames from video")
        print("=" * 60)
        extract_frames(input_video, frames_dir, fps)

        print()
        print("=" * 60)
        print("STEP 2: Converting frames to ASCII art")
        print("=" * 60)
        convert_frames_to_ascii(frames_dir, ascii_dir, ascii_width)

        print()
        print("=" * 60)
        print("STEP 3: Stitching ASCII frames into video")
        print("=" * 60)
        stitch_frames_to_video(ascii_dir, output_video, fps)

        print()
        print("=" * 60)
        print("CONVERSION COMPLETE!")
        print("=" * 60)
        print(f"Output video: {output_video}")

    finally:
        # Clean up temporary directories unless keep_temp is True
        if not keep_temp:
            print()
            print("Cleaning up temporary files...")
            if os.path.exists(frames_dir):
                shutil.rmtree(frames_dir)
            if os.path.exists(ascii_dir):
                shutil.rmtree(ascii_dir)
            print("Done!")


def main():
    parser = argparse.ArgumentParser(
        description="Convert a video to ASCII art video",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  uv run convert_video.py input.mp4
  uv run convert_video.py input.mp4 --output ascii_output.mp4
  uv run convert_video.py input.mp4 --width 80 --fps 10
  uv run convert_video.py input.mp4 --keep-temp
        """
    )
    parser.add_argument("input_video", help="Path to input video file")
    parser.add_argument(
        "--output",
        default=None,
        help="Output video file path (default: input_ascii.mp4)"
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=15,
        help="Target FPS for conversion (default: 15)"
    )
    parser.add_argument(
        "--width",
        type=int,
        default=240,
        help="Number of ASCII characters per row (default: 240)"
    )
    parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="Keep temporary frame directories"
    )

    args = parser.parse_args()

    if not os.path.exists(args.input_video):
        print(f"Error: Input video not found: {args.input_video}")
        return 1

    # Generate default output name if not specified
    output_video = args.output
    if output_video is None:
        input_path = Path(args.input_video)
        output_video = f"{input_path.stem}_ascii.mp4"

    try:
        convert_video_to_ascii(
            args.input_video,
            output_video,
            args.fps,
            args.width,
            args.keep_temp
        )
        return 0
    except Exception as e:
        print(f"Error: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
