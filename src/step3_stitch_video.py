"""
Step 3: Stitch ASCII art frames back into a video
"""

import cv2
import os
import argparse
from pathlib import Path


def stitch_frames_to_video(
    input_dir: str,
    output_video: str,
    fps: int = 15
) -> None:
    """
    Stitch PNG frames into a video file.

    Args:
        input_dir: Directory containing ASCII art frames
        output_video: Path for output video file
        fps: Frames per second for output video
    """
    input_path = Path(input_dir)

    # Get all ASCII frames sorted by name
    frames = sorted(input_path.glob("ascii_*.png"))
    total_frames = len(frames)

    if total_frames == 0:
        raise ValueError(f"No ASCII frames found in {input_dir}")

    print(f"Found {total_frames} frames to stitch")
    print(f"Output FPS: {fps}")

    # Read first frame to get dimensions
    first_frame = cv2.imread(str(frames[0]))
    if first_frame is None:
        raise ValueError(f"Could not read first frame: {frames[0]}")

    height, width = first_frame.shape[:2]
    print(f"Output resolution: {width}x{height}")

    # Create video writer
    # Use mp4v codec for MP4 output
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))

    if not out.isOpened():
        raise ValueError(f"Could not create video writer for: {output_video}")

    print("Stitching frames...")

    for i, frame_path in enumerate(frames):
        frame = cv2.imread(str(frame_path))
        if frame is None:
            print(f"Warning: Could not read {frame_path}, skipping")
            continue

        out.write(frame)

        # Progress indicator
        if (i + 1) % 30 == 0 or i == total_frames - 1:
            print(f"  Processed {i + 1}/{total_frames} frames")

    out.release()

    # Verify output file was created
    if os.path.exists(output_video):
        file_size = os.path.getsize(output_video) / (1024 * 1024)
        print(f"Video saved to: {output_video} ({file_size:.2f} MB)")
    else:
        raise ValueError("Failed to create output video")


def main():
    parser = argparse.ArgumentParser(description="Stitch ASCII frames into video")
    parser.add_argument(
        "--input-dir",
        default="ascii_frames",
        help="Input directory containing ASCII frames (default: ascii_frames)"
    )
    parser.add_argument(
        "--output",
        default="output_ascii.mp4",
        help="Output video file path (default: output_ascii.mp4)"
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=15,
        help="Output video FPS (default: 15)"
    )

    args = parser.parse_args()

    if not os.path.exists(args.input_dir):
        print(f"Error: Input directory not found: {args.input_dir}")
        return 1

    try:
        stitch_frames_to_video(args.input_dir, args.output, args.fps)
        return 0
    except Exception as e:
        print(f"Error: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
