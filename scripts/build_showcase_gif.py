#!/usr/bin/env python3
"""Render the silent promotional GIF from existing website artwork.

Requires Pillow and ffmpeg. No website files are changed. The animated UI is a
condensed presentation of the real features, not a browser screen recording.
"""

from functools import lru_cache
from pathlib import Path
import math
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "website/soundboard/assets"
DEST = ROOT / "designs/chivalry-showcase.gif"
W, H, SCALE, FPS = 960, 540, 2, 20
GOLD, BLUE, RED = "#dfbd6d", "#83b7f1", "#e47b6e"
WHITE, MUTED, LINE = "#edf1f7", "#a9bdd3", "#3e6892"
STOPS = [0, 3, 5.8, 9.8, 13.4, 16.4]


@lru_cache(None)
def font(size, kind="sans"):
    paths = {
        "title": ASSETS / "ringbearer.ttf",
        "serif": Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
        "sans": Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    }
    return ImageFont.truetype(str(paths[kind]), round(size * SCALE))


def coords(values):
    return tuple(round(v * SCALE) for v in values)


def text(im, value, x, y, size=20, color=WHITE, kind="sans", anchor="mm"):
    ImageDraw.Draw(im).text(coords((x, y)), value, font=font(size, kind),
                           fill=color, anchor=anchor, stroke_width=0)


def line(im, points, color=LINE, width=1):
    ImageDraw.Draw(im).line(coords(points), fill=color, width=round(width * SCALE))


def rect(im, box, fill=None, outline=None, width=1):
    ImageDraw.Draw(im).rectangle(coords(box), fill=fill, outline=outline,
                                width=round(width * SCALE))


def panel(im, box, accent=LINE, fill="#0a192b", corners=True):
    x, y, r, b = box
    rect(im, box, fill, accent)
    rect(im, (x+4, y+4, r-4, b-4), outline="#243f5a")
    if corners:
        for cx, cy, sx, sy in [(x+9,y+9,1,1), (r-9,y+9,-1,1),
                               (x+9,b-9,1,-1), (r-9,b-9,-1,-1)]:
            for n in (0, 5):
                line(im, [cx+sx*n, cy+sy*19, cx+sx*n, cy+sy*n,
                          cx+sx*19, cy+sy*n], accent)
            line(im, [cx,cy+sy*10,cx+sx*10,cy+sy*10,cx+sx*10,cy], accent)


@lru_cache(None)
def asset(name, width, height=None):
    im = Image.open(ASSETS / name).convert("RGBA")
    if height is None:
        height = round(im.height * width / im.width)
    return im.resize(coords((width, height)), Image.Resampling.LANCZOS)


def paste(im, image, x, y, alpha=1):
    if alpha < 1:
        image = image.copy()
        image.putalpha(image.getchannel("A").point(lambda p: round(p * alpha)))
    im.alpha_composite(image, coords((x, y)))


@lru_cache(None)
def crest(side, size):
    source = Image.open(ASSETS / "optimized/faction-emblems.webp").convert("RGBA")
    cell = source.width // 2
    return source.crop((side*cell, 0, (side+1)*cell, source.height)).resize(
        coords((size, size)), Image.Resampling.LANCZOS)


@lru_cache(None)
def backdrop():
    im = asset("optimized/castle-1672.webp", W, H).copy()
    im.alpha_composite(Image.new("RGBA", im.size, (3, 10, 22, 155)))
    panel(im, (12, 12, 948, 528), fill=None)
    return im


def base(step):
    im = backdrop().copy()
    text(im, "CHIVALRY  /  VOICE COMMANDS", 40, 36, 13, GOLD, anchor="lm")
    text(im, "chivalry.firzen.net", 920, 36, 14, MUTED, anchor="rm")
    for i in range(5):
        x = 426 + i*24
        line(im, (x, 506, x+13, 506), GOLD if i == step else LINE, 2)
    return im


def heading(im, title, subtitle):
    text(im, title, 480, 91, 38, WHITE, "title")
    text(im, subtitle, 480, 134, 18, MUTED)


def equalizer(im, x, y, t, count=5, color=GOLD):
    for i in range(count):
        h = 5 + 17 * (.5 + .5 * math.sin(t*12 + i*1.8))
        rect(im, (x+i*6, y-h/2, x+i*6+3, y+h/2), color)


def play(im, x, y, color=WHITE, size=10):
    ImageDraw.Draw(im).polygon([coords(p) for p in
        [(x-size/2,y-size), (x-size/2,y+size), (x+size,y)]], fill=color)


def pulse(im, x, y, progress):
    if 0 <= progress < .55:
        radius = 12 + progress*40
        overlay = Image.new("RGBA", im.size)
        ImageDraw.Draw(overlay).ellipse(coords((x-radius,y-radius,x+radius,y+radius)),
            outline=(223,189,109,round(220*(1-progress/.55))), width=3*SCALE)
        im.alpha_composite(overlay)


def factions(t):
    im = base(0)
    heading(im, "Choose your side.", "The battlefield banter you never forgot.")
    for i, (label, color) in enumerate([("Agatha Knights", BLUE), ("Mason Order", RED)]):
        x = 95 + i*405
        panel(im, (x, 175, x+365, 461), color)
        paste(im, crest(i, 218), x+73, 185)
        text(im, label, x+182, 429, 27, color, "title")
    text(im, "VS", 480, 317, 18, GOLD, "title")
    return im


def classes_frame(faction):
    im = base(1)
    heading(im, "Pick your warrior.", "Both factions. Every class. All that attitude.")
    color = BLUE if faction == "agatha" else RED
    for i, (key, label) in enumerate([("archer","Archer"), ("man_at_arms","Man-at-Arms"),
                                      ("vanguard","Vanguard"), ("knight","Knight")]):
        x = 54+i*216
        panel(im, (x, 173, x+204, 465), color)
        paste(im, asset(f"optimized/{faction}-{key}-640.webp", 170), x+17, 178)
        # The full body remains inside the panel; the caption sits beneath it.
        text(im, label, x+102, 444, 20, color, "title")
    return im


@lru_cache(None)
def class_still(faction):
    return classes_frame(faction)


def classes(t):
    return Image.blend(class_still("agatha"), class_still("masons"),
                       max(0, min(1, (t-1.1)/.3)))


def commands(t):
    im = base(2)
    heading(im, "Make yourself heard.", "Taunts. Laughs. Battle cries. Glorious chaos.")
    panel(im, (62, 172, 295, 469), RED)
    paste(im, asset("optimized/masons-vanguard-640.webp", 174), 91, 175)
    text(im, "Vanguard", 178, 449, 22, RED, "title")
    for i, name in enumerate(["Taunt", "Laugh", "Battle cry · running"]):
        y = 182+i*82
        active = t > .35+i*.65
        panel(im, (328, y, 890, y+68), GOLD if active else LINE,
              "#192d3c" if active else "#0a192b", corners=False)
        if active:
            equalizer(im, 350, y+34, t+i)
        else:
            play(im, 361, y+34, MUTED, 7)
        text(im, name, 394, y+33, 22, GOLD if active else WHITE, anchor="lm")
        if active:
            text(im, f"Version {i+2}", 795, y+34, 14, MUTED)
        text(im, "•••", 862, y+34, 20, GOLD if active else MUTED)
        pulse(im, 362, y+34, t-(.35+i*.65))
    text(im, "Random takes. Pick a favourite. Play voices together.", 610, 457, 17, MUTED)
    return im


@lru_cache(None)
def hidden_letter():
    im = Image.new("RGBA", coords((456, 110)))
    for y, value in [(20,"A message from an old ally."), (51,"May your blade stay sharp,"),
                     (82,"and your victories be many.")]:
        text(im, value, 228, y, 20, WHITE, "serif")
    return im.filter(ImageFilter.GaussianBlur(5*SCALE))


def message(t):
    im = base(3)
    text(im, "Send a little", 245, 206, 37, WHITE, "title")
    text(im, "medieval mischief.", 245, 253, 33, GOLD, "title")
    text(im, "Your words. Their favourite voice.", 245, 316, 18, MUTED)
    text(im, "One link to surprise a friend.", 245, 345, 18, MUTED)
    panel(im, (490, 65, 913, 479))
    # Match message.html's cropped upper-body portrait, using the same artwork.
    portrait = asset("optimized/agatha-knight-640.webp", 230).crop(coords((0, 0, 230, 150)))
    paste(im, portrait, 586, 80)
    text(im, "Message from Firzen", 702, 250, 25, GOLD, "serif")
    line(im, (590,274,814,274))
    rect(im, (514, 294, 889, 451), "#081729", LINE)
    revealed = max(0, min(1, (t-1.15)/.7))
    concealed = hidden_letter().resize(coords((350, 98)), Image.Resampling.LANCZOS)
    paste(im, concealed, 527, 307, 1-revealed)
    reveal_layer = Image.new("RGBA", im.size)
    text(reveal_layer, "Your sword is sharp.", 702, 327, 20, WHITE, "serif")
    text(reveal_layer, "Your taunts are sharper.", 702, 357, 20, WHITE, "serif")
    panel(reveal_layer, (603,389,800,431), GOLD, corners=False)
    play(reveal_layer, 625,410,GOLD,6)
    text(reveal_layer, "Replay voice", 714,410,18,GOLD)
    if revealed:
        equalizer(reveal_layer, 841, 410, t)
    paste(im, reveal_layer, 0, 0, revealed)
    if revealed < 1:
        button = Image.new("RGBA", im.size)
        panel(button, (586,345,818,399), GOLD, corners=False)
        text(button, "Reveal message",702,372,20,GOLD)
        paste(im,button,0,0,1-revealed)
    pulse(im,702,372,t-1.15)
    return im


@lru_cache(None)
def ending_still():
    im = backdrop().copy()
    # Reuse the existing share artwork without regenerating a competing logo.
    paste(im, asset("link-preview.jpg", 850, 445), 55, 19)
    rect(im, (55,385,905,482), "#091729")
    text(im, "Your next taunt is one click away.",480,412,25,WHITE,"title")
    text(im, "chivalry.firzen.net",480,456,30,GOLD)
    text(im, "A fan-made Chivalry: Medieval Warfare soundboard",480,501,14,MUTED)
    return im


def ending(t):
    return ending_still().copy()


SCENES = [factions, classes, commands, message, ending]


def frame(t):
    scene = next(i for i in range(5) if t < STOPS[i+1])
    local = t-STOPS[scene]
    im = SCENES[scene](local)
    # Short dissolves between chapters and at the loop seam, never a blank frame.
    transition = .25
    remaining = STOPS[scene+1]-t
    if remaining < transition:
        nxt = SCENES[(scene+1) % 5](0)
        im = Image.blend(im, nxt, (transition-remaining)/transition)
    return im.convert("RGB").resize((W,H), Image.Resampling.LANCZOS)


def main():
    DEST.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="chivalry-showcase-") as work:
        work = Path(work)
        for n in range(round(STOPS[-1]*FPS)):
            frame(n/FPS).save(work / f"{n:04d}.png")
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
            "-framerate", str(FPS), "-i", str(work / "%04d.png"),
            "-filter_complex",
            "split[a][b];[a]palettegen=stats_mode=diff[p];"
            "[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
            "-loop", "0", str(DEST),
        ], check=True)
    # A convenient static overview for reviewing the story without a GIF player.
    board = Image.new("RGB", (W, 3*H//2), "#080f1b")
    for i, t in enumerate([1,3.5,5,8.5,12.5,14.8]):
        shot = frame(t).resize((W//2,H//2), Image.Resampling.LANCZOS)
        board.paste(shot, ((i%2)*W//2,(i//2)*H//2))
    board.save(DEST.with_name("chivalry-showcase-storyboard.jpg"), quality=90)
    with Image.open(DEST) as gif:
        duration = 0
        for n in range(gif.n_frames):
            gif.seek(n)
            duration += gif.info.get("duration", 0)
        print(f"{DEST}: {gif.size}, {gif.n_frames} frames, {duration/1000:.2f}s, "
              f"{DEST.stat().st_size/1024/1024:.2f} MiB, loop={gif.info.get('loop')}")


if __name__ == "__main__":
    main()
