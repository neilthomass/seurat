"""
Step 1: Extract frames from video at 15 FPS
"""

import cv2
import os
import argparse
from pathlib import Path


def extract_frames(input_video: str, output_dir: str, target_fps: int = 15) -> int:
    """
    Extract frames from a video file at the specified FPS.

    Args:
        input_video: Path to the input video file
        output_dir: Directory to save extracted frames
        target_fps: Target frames per second (default: 15)

    Returns:
        Number of frames extracted
    """
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Open the video file
    cap = cv2.VideoCapture(input_video)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {input_video}")

    # Get video properties
    original_fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"Video properties:")
    print(f"  Original FPS: {original_fps}")
    print(f"  Total frames: {total_frames}")
    print(f"  Resolution: {width}x{height}")
    print(f"  Target FPS: {target_fps}")

    # Calculate frame interval to achieve target FPS
    frame_interval = original_fps / target_fps

    frame_count = 0
    extracted_count = 0
    next_frame_to_extract = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Extract frame if we've reached the next interval
        if frame_count >= next_frame_to_extract:
            output_file = output_path / f"frame_{extracted_count:06d}.png"
            cv2.imwrite(str(output_file), frame)
            extracted_count += 1
            next_frame_to_extract += frame_interval

        frame_count += 1

    cap.release()

    print(f"Extracted {extracted_count} frames to {output_dir}")
    return extracted_count


def main():
    parser = argparse.ArgumentParser(description="Extract frames from video at 15 FPS")
    parser.add_argument("input_video", help="Path to input video file")
    parser.add_argument(
        "--output-dir",
        default="frames",
        help="Output directory for frames (default: frames)"
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=15,
        help="Target FPS for extraction (default: 15)"
    )

    args = parser.parse_args()

    if not os.path.exists(args.input_video):
        print(f"Error: Input video not found: {args.input_video}")
        return 1

    try:
        extract_frames(args.input_video, args.output_dir, args.fps)
        return 0
    except Exception as e:
        print(f"Error: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
