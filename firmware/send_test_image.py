#!/usr/bin/env python3
"""
Send a test image to the Quote/0 e-Paper display via USB serial JTAG.
Usage: python3 send_test_image.py [serial_port]
"""

import serial
import struct
import sys
import time


def crc32_update(crc, data):
    """Compute CRC-32 matching the ESP32 implementation."""
    crc = (crc ^ 0xFFFFFFFF) & 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xedb88320
            else:
                crc >>= 1
            crc &= 0xFFFFFFFF
    return (crc ^ 0xFFFFFFFF) & 0xFFFFFFFF


def wait_for_ready(serial, timeout=10.0):
    """Wait for Q0READY message from device."""
    start = time.time()
    while time.time() - start < timeout:
        if serial.in_waiting > 0:
            data = serial.read(serial.in_waiting)
            text = data.decode("ascii", errors="replace")
            if "Q0READY" in text:
                print(f"Device ready: {text.strip()}")
                return True
        time.sleep(0.01)
    return False


def read_line(serial, timeout=5.0):
    """Read a line from the device."""
    start = time.time()
    response = b""
    while time.time() - start < timeout:
        if serial.in_waiting > 0:
            response += serial.read(serial.in_waiting)
            if b"\n" in response:
                break
        time.sleep(0.01)
    return response.decode("ascii", errors="replace").strip()


def create_white_image(width, height):
    """Create a solid white image."""
    bytes_per_row = (width + 7) // 8
    return bytes([0xff] * (bytes_per_row * height))


def create_black_image(width, height):
    """Create a solid black image."""
    bytes_per_row = (width + 7) // 8
    return bytes([0x00] * (bytes_per_row * height))


def create_checkerboard(width, height, square_size=16):
    """Create a checkerboard pattern."""
    bytes_per_row = (width + 7) // 8
    frame = bytearray(bytes_per_row * height)

    for y in range(height):
        row_offset = y * bytes_per_row
        for x in range(width):
            byte_index = row_offset + (x // 8)
            bit_index = 7 - (x % 8)
            is_white = ((x // square_size) + (y // square_size)) % 2 == 0
            if is_white:
                frame[byte_index] |= (1 << bit_index)

    return bytes(frame)


def create_gradient(width, height):
    """Create a vertical gradient pattern."""
    bytes_per_row = (width + 7) // 8
    frame = bytearray(bytes_per_row * height)

    for y in range(height):
        row_offset = y * bytes_per_row
        value = (y * 255) // height
        for x in range(width):
            byte_index = row_offset + (x // 8)
            bit_index = 7 - (x % 8)
            pixel_value = value if (x * 255) // width > (255 - value) else 0
            if pixel_value > 127:
                frame[byte_index] |= (1 << bit_index)

    return bytes(frame)


def send_image(serial, width, height, frame_data, name="image"):
    """Send an image to the e-Paper display."""
    expected_crc = crc32_update(0, frame_data)
    header = f"Q0IMG1 {width} {height} 1BPP {len(frame_data)} {expected_crc:x}\n"

    print(f"\n=== Sending {name} ===")
    print(f"Header: {header.strip()}")
    serial.write(header.encode("ascii"))

    response = read_line(serial, timeout=5.0)
    print(f"Response: {response}")

    if "ERR" in response:
        print(f"Error sending header: {response}")
        return False

    print(f"Sending {len(frame_data)} bytes...")
    serial.write(frame_data)

    response = read_line(serial, timeout=60.0)
    print(f"Response: {response}")

    if response == "OK":
        print(f"{name} displayed successfully!")
        return True
    elif "ERR" in response:
        print(f"Error displaying {name}: {response}")
        return False
    else:
        print(f"Unexpected response: {response}")
        return False


def main():
    port = sys.argv[1] if len(sys.argv) > 1 else "/dev/cu.usbmodem1101"
    width = 152
    height = 296

    print(f"Connecting to {port}...")

    # Open serial port
    serial_port = serial.Serial(port, 115200, timeout=1.0)

    # Reset the device via DTR/RTS to ensure clean state
    print("Resetting device...")
    serial_port.dtr = False
    serial_port.rts = True
    time.sleep(0.1)
    serial_port.dtr = True
    serial_port.rts = False
    time.sleep(0.5)

    # Wait for Q0READY
    print("Waiting for device ready...")
    if not wait_for_ready(serial_port, timeout=15.0):
        print("Device did not send Q0READY!")
        if serial_port.in_waiting > 0:
            data = serial_port.read(serial_port.in_waiting)
            print(f"Buffer: {data}")
        serial_port.close()
        return

    # Test patterns
    print("\n" + "="*50)
    print("Testing e-Paper display with various patterns")
    print("="*50)

    # Test 1: White
    send_image(serial_port, width, height, create_white_image(width, height), "White")

    time.sleep(3)

    # Test 2: Checkerboard
    send_image(serial_port, width, height, create_checkerboard(width, height, 16), "Checkerboard 16px")

    time.sleep(3)

    # Test 3: Gradient
    send_image(serial_port, width, height, create_gradient(width, height), "Vertical Gradient")

    time.sleep(3)

    # Test 4: Black
    send_image(serial_port, width, height, create_black_image(width, height), "Black")

    serial_port.close()
    print("\nAll tests complete!")


if __name__ == "__main__":
    main()
