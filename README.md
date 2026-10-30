# wallpapers

Animated, generative wallpapers as live HTML pages. Use them as desktop wallpapers with [Plash](https://sindresorhus.com/plash) (macOS) or [Lively Wallpaper](https://www.rocksdanister.com/lively/) (Windows).

Every wallpaper is **clock-synced**: each frame is computed from the current time, so anyone with the same URL sees the same animation. There is no server involved.

## Wallpapers

| Wallpaper | URL |
|---|---|
| Gaussian Process | https://shanerybacki.github.io/wallpapers/wallpapers/gaussian-process/ |

## URL parameters

Every wallpaper accepts these. People using the same full URL still see identical frames.

| Param | Default | Meaning |
|---|---|---|
| `seed` | `wallpapers` | Any text. Different seeds give different animations. |
| `speed` | `1` | Time multiplier (0.1–20). |
| `brightness` | `0.8` | Brightness cap (0.05–1). |
| `fps` | `0` | Frame-rate cap. `0` means the display's refresh rate. |

A wallpaper can add its own parameters, listed in its `meta.json`. For example, `?samples=60&lengthscale=2` for Gaussian Process.

## OLED rules

These wallpapers are designed to reduce burn-in on OLED screens. Every wallpaper must:

1. Use a **pure black** (`#000`) background. `oled.clear()` does this every frame.
2. Have **no static elements**: no axes, gridlines, labels, logos or text.
3. **Keep lit pixels moving** so no region stays lit for long. Spread content over the whole screen over time.
4. Build colors with `oled.color()` so the brightness cap applies.
5. Derive everything from the shared clock (`t`) and seed, never from page-load time or `Math.random()`.

## Layout

```
shared/                 code used by every wallpaper (RNG, clock, params, canvas, loop, OLED guard, linear algebra)
wallpapers/<slug>/      one folder per wallpaper: index.html, main.js, meta.json, plus anything else it needs
tests/                  unit tests (node --test)
```

To add a wallpaper, create `wallpapers/<slug>/` with an `index.html` that loads `../../shared/wallpaper.css` and a `main.js` that calls `run()` from `../../shared/wallpaper.js`.

## Development

No build step and no dependencies.

```sh
npm run serve   # python3 -m http.server 8000, then open http://localhost:8000/
npm test        # Node 20+
```

The pages use ES modules, so open them over http, not `file://`.

## License

MIT
