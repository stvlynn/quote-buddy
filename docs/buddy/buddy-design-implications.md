# Buddy Design Implications

## Main point

The hardware profile supports a **display-first Buddy**, not a direct clone of the original `claude-desktop-buddy` device.

The original Buddy example was built around:

- a color display
- local buttons
- an IMU
- frequent animation updates

Quote0 points in a different direction.

## What the hardware is good at

The current evidence says Quote0 is good at:

- showing meaningful information on e-paper
- sleeping aggressively when idle
- waking on power-related events
- accepting host-driven or backend-driven content
- running reliably as a low-power endpoint

## What the hardware does not clearly support

The current evidence does **not** support building around:

- onboard button-driven navigation
- IMU gestures such as shake or face-down detection
- fast animated pet behavior as a core UI primitive

That does not make a Buddy adaptation impossible. It only changes the right architecture.

## Best-fit Buddy architecture

The strongest fit is:

1. a host or daemon derives Buddy state
2. the host renders low-refresh state cards for the e-paper panel
3. the device displays those cards over USB or another simple transport
4. urgent states trigger a simple LED alert if the LED is available
5. approval input lives outside the display path unless NFC is proven usable

## Recommended state model

A Quote0 Buddy should focus on a small set of durable states:

- `sleep`
- `idle`
- `busy`
- `attention`
- `celebrate`
- optional one-shot `approved` and `denied` confirmation states

These states map well to e-paper because they change rarely and carry clear meaning.

## Input strategy

Given the current hardware picture, the safest approval strategy is:

- first choice: host hotkeys, a local web UI, or another external input path
- second choice: NFC, **if** live testing proves that the current board can read or emit useful events

In other words, do not make local physical input a core dependency.

## Why this still matches the original spirit

The original Buddy concept is not really about buttons or motion. It is about:

- ambient awareness
- visible state
- timely attention cues
- a lightweight approval loop

Quote0 can still deliver that experience. It just does so as a quiet e-paper endpoint rather than as a handheld pet device.

## Bottom line

The hardware findings point to a clear design rule:

> Build a Quote0 Buddy around host-rendered state, low-refresh e-paper updates, and optional external input. Do not design it around local buttons or an IMU unless new evidence appears.
