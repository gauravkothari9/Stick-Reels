# Stick Reels

Stick Reels is a MERN platform that makes 2D stick-figure animation Shorts with Python and uploads them to YouTube automatically.

```
client/   React (Vite) UI: style cards, create panel, video library
server/   Express + MongoDB API: job queue, metadata, YouTube OAuth + upload
engine/   Python render engine: stick-figure scenes, Pillow frames, moviepy encode
media/    rendered videos, previews, and your uploaded music library (media/music)
```

## How a Short is made

1. The user picks a style (or "Surprise me"). The server saves a `Job` in MongoDB.
2. The queue runs `python -m engine.render` as a separate process.
3. The chosen scene plans its choreography (moves, obstacles, shots, fails) from a random seed and palette. Each run gives a different video.
4. Every frame is drawn from scratch with Pillow at 2× resolution and scaled down for anti-aliasing. `engine/frame.py` adds a neon glow and a one-line quote (from `engine/quotes.json`, never repeating recent ones).
5. `engine/music.py` composes an original background track to the exact video length, in a mood that fits the style. moviepy then combines the frames and the track into a 1080×1920, 30 fps H.264/AAC MP4.
6. The server builds the title, description and tags. Your own tags come first, then the style's tags, then high-volume tags such as `shorts` and `stickman`. The total is kept under YouTube's 500-character limit.
7. If auto-upload is on and a channel is connected, the video is uploaded through the YouTube Data API v3.

## Styles

There are 52 stick-figure styles in 6 groups:

| Group        | Styles |
|--------------|--------|
| Action       | Sword Duel, Staff Battle, Laser Duel, Kung Fu Fight, Boxing, One vs All, Parkour Run, Zombie Escape, Archery, Ninja Fruit, Laser Dodge |
| Sports       | Hoops, Football Juggling, Penalty Kick, Skate Tricks, Snowboard, Sprint Race, Hurdles, Tennis, Ping Pong, Golf, Baseball, Cricket, Bowling, High Jump, Weightlifting, Trampoline |
| Dance        | Dance Crew, Dance Battle, Breakdance, Moonwalk, Ballet, Robot Dance |
| Fitness      | Workout, Abs Workout, HIIT, Pull-ups, Jump Rope, Yoga Flow, Tai Chi, Meditation |
| Comedy       | Stick Fails, Cartoon Drops, Rake Trap, Wet Floor, Prank Wars |
| Music & Life | Guitar Solo, Drummer, DJ Set, Pancake Chef, Lumberjack, Juggler |

`engine/stick.py` holds the shared toolkit: palettes, the posable `Figure` (joint angles for torso, head, arms and legs), walk and run cycles, keyframe blending and effects. The scenes live in `engine/scenes_*.py`. Some styles are variants of one scene with a parameter (for example Boxing is `kung_fu` with `mode="boxing"`); `engine/scenes.py` registers them with `functools.partial`.

**Action length** (Profile → Video settings) sets the main action; **Finale** adds time at the end for the win, bow or cheer.

To add a style:
1. Write a scene function `scene(rng, palette, duration)` that returns `draw(canvas, t)`. Make all random choices up front with `rng`.
2. Add it to `SCENES` in `engine/scenes.py`.
3. Add an entry to `engine/categories.json` with `id`, `name`, `group`, `description`, `hashtags` and `titles`.

## App pages

- **Dashboard (`/`)**: all styles in a 4-column grid, with group filters, search and "Surprise me". Clicking a style opens the Create card.
- **Profile (`/profile/...`)** has four sections:
  - `account`: connect your YouTube channel and edit your tags
  - `shorts`: your Shorts, with status filters, publish, edit and download
  - `schedule`: repeating autopilot schedules (days, times, styles)
  - `settings`: video defaults
- **Header**: shows your channel name with a green dot when YouTube is connected. Otherwise it shows a "Connect YouTube" button.

## Accounts and subscriptions

- **Registration is free.** Sign-up (`/signup`) asks for name, email and password. Passwords are hashed with scrypt, and sessions are HttpOnly cookies.
- **The first account becomes the admin.** It inherits everything created before accounts existed (Shorts, schedules, settings, YouTube connection), has full access without paying, and is the only account that can change the platform's Google OAuth credentials.
- **Free accounts** can browse all styles and create **1 watermarked trial Short**. They can't upload it, schedule, or create more.
- **Plans** (Razorpay subscriptions in INR; yearly = 10× monthly):

  | Plan  | Monthly | Yearly  | Shorts / month  | Schedules | Styles      | Upload | Watermark | Own music | Rendering |
  |-------|---------|---------|-----------------|-----------|-------------|--------|-----------|-----------|-----------|
  | Free  | ₹0      | —       | 1 trial Short   | —         | browse all 52 | —    | yes       | —         | standard  |
  | Basic | ₹2,000  | ₹20,000 | 10              | 1         | 5           | auto   | none      | —         | standard  |
  | Pro   | ₹3,000  | ₹30,000 | 30              | 3         | 30          | auto   | none      | ✓         | priority  |
  | Max   | ₹5,000  | ₹50,000 | 400             | unlimited | 52          | auto   | none      | ✓         | priority  |

  Plans unlock styles in a fixed order (`STYLE_ORDER` in `server/src/services/plans.js`): the seven featured styles first, then the rest of `engine/categories.json`. Locked styles show a lock and the plan they need; schedules only use unlocked styles.
  Prices and limits are in `server/src/services/plans.js`. Pro and Max Shorts render first when the queue is busy.
- **Per-user data:** each user has their own Shorts, schedules, settings, music library and YouTube channel. Video files are only served to their owner.
- **Profile → Plan & billing:** shows usage and the renewal date, and has Change plan and Cancel. A cancelled plan keeps working until the end of the paid period.

### Razorpay setup

1. Create a Razorpay account. Test mode works immediately; live mode needs KYC.
2. Go to **Dashboard → Account & Settings → API Keys**, generate keys, and put `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `server/.env`. Use `rzp_test_…` keys while testing.
3. Go to **Dashboard → Webhooks** and add `https://<your-domain>/api/billing/webhook`:
   - Choose all `subscription.*` events.
   - Pick a secret and put the same value in `RAZORPAY_WEBHOOK_SECRET`.
   - The webhook needs a public URL. On localhost, skip it: a payment is still activated right after Checkout, and the Plan & billing page refreshes the status from Razorpay each time it opens.
4. Restart the server. Razorpay plans are created automatically the first time someone subscribes.
5. When the site runs on HTTPS, set `SECURE_COOKIES=true`.

## Music

Every new Short gets background music. You set this in **Profile → Video settings → Music**:

- **Generated** (default): each Short gets an original track synthesized in numpy.
  - The mood matches the video by default (**Match the video**; the map is `CATEGORY_MOODS` in `engine/music.py`):

    | Mood    | Styles |
    |---------|--------|
    | Epic    | sword, staff and laser duels, kung fu, boxing, one vs all, archery |
    | Chase   | parkour, zombie escape, ninja fruit, laser dodge |
    | Sporty  | ball sports, sprint, hurdles, high jump, trampoline |
    | Rock    | skate, snowboard, guitar solo, drummer, lumberjack |
    | Funky   | dance crew, dance battle, breakdance, moonwalk |
    | Electro | robot dance, DJ set |
    | Workout | workouts, HIIT, pull-ups, jump rope, weightlifting |
    | Zen     | yoga, tai chi, meditation |
    | Quirky  | all comedy styles, juggler |
    | Chill   | golf, bowling, pancake chef |
    | Elegant | ballet |

    You can also pick one mood for every Short (the table above plus calm, dreamy, upbeat and cosmic), or random.
  - Each track has a random key, chord progression and tempo within its mood's range.
  - Each mood is a genre recipe: drum grooves, a bass line, pads or chord stabs, an arpeggio and/or a repeating lead melody, and reverb. Tracks open with a one-bar intro, add a drum fill and crash every four bars, and end on the home chord during the finale.
  - The music is royalty-free, so it won't trigger YouTube Content ID claims.
  - Preview plays a 14-second sample of the chosen mood (a random mood for Match the video).
- **My music**: each Short uses a random track from your uploads (stored in `media/music`). Short tracks loop and long ones are trimmed. If the library is empty, generated music is used instead. Only upload music you have the rights to.
- **Off**: Shorts are rendered silent.

The "Add music" button in the Music card adds a track to unpublished Shorts that were rendered without music. It only changes the audio and doesn't re-render the picture. Published Shorts can't get new music, because YouTube's API can't replace a video's audio.

## Scheduling

- **Profile → Schedule (`/profile/schedule`):** create repeating schedules. The Dashboard's **Autopilot** button opens a new one. Each schedule has:
  - days of the week
  - one or more times
  - a timezone
  - a visibility setting
  - how many Shorts per slot (1–3)
  - which styles to use: chosen styles take turns, or "Any style" picks at random
- **Create card:** under "Publish", choose **Right away**, **Once later** (one Short at a date and time you pick), or **Repeat**. Repeat creates a schedule for that style, every day or on the days you pick, at one or more times.
- **How a slot runs:** the server checks every 30 seconds and starts rendering 20 minutes before each slot.
  - **Public** Shorts are uploaded private with YouTube's `publishAt`. YouTube itself makes them public at the exact time, so the server can be off by then.
  - **Unlisted or private** Shorts can't use `publishAt`. They are held on the server and uploaded when the slot arrives, so the server must be running at that time.
- **If the server was off:** a slot missed by up to 2 hours still runs as soon as the server comes back. Older missed slots are skipped.
- **Timezones:** slot times use the IANA timezone you pick, so they stay correct across daylight saving changes.

## Setup (Windows)

Requirements: Node 20+, MongoDB running locally (or an Atlas URI), and [uv](https://docs.astral.sh/uv/) (it installs Python 3.14 and the engine dependencies).

```powershell
uv sync                                   # Python engine deps (moviepy, pillow, numpy)
cd server; npm install; copy .env.example .env; cd ..
cd client; npm install; npm run build; cd ..
cd server; npm start                      # http://localhost:5001
```

For development with hot reload, run `npm run dev` in both `server/` and `client/`, then open http://localhost:5175.

The first time the server starts, it renders a small looping preview for every style card. This takes about 1 minute in total.

## Connecting YouTube

1. In Google Cloud Console, create a project and enable **YouTube Data API v3**.
2. Configure the **OAuth consent screen** as External and add your Google account as a test user.
3. Go to Credentials, click **Create OAuth client ID**, and choose **Web application**. Add this authorized redirect URI:
   `http://localhost:5001/api/youtube/callback`
4. Go to **Profile → Channel & Tags → Google API credentials**, paste the client ID and secret, and click Save. They are written to `server/.env` and take effect immediately, without a restart. You can also edit `server/.env` by hand and restart the server.
5. Click **Connect YouTube**.

Profile has no login in front of it. Keep the server on localhost. If you expose it to other people, add authentication first, because anyone who can open Profile can replace the credentials.

Important: YouTube locks videos uploaded by an **unverified** API project as *private*. To publish publicly, the project has to pass Google's API compliance audit. Until then, upload as private or unlisted.
The default quota (10,000 units a day) allows about 6 uploads a day. Each upload costs 1,600 units.

## Engine CLI

```powershell
uv run python -m engine.render --category sword_duel --out media/test.mp4 --draw-seconds 20 --hold-seconds 3
# options: --seed, --palette, --width/--height, --fps, --glow, --crf, --hook "quote text", --no-hook,
#          --music generated|library|off, --mood auto|random|epic|chase|sporty|rock|funky|electro|workout|zen|quirky|chill|elegant|calm|dreamy|upbeat|cosmic
uv run python -m engine.music --out track.wav --duration 23 --mood epic      # just the music (or --category kung_fu)
uv run python -m engine.add_music --video media/videos/x.mp4                # add music to an existing video
```

## Deploying to AWS

See [deploy/DEPLOY.md](deploy/DEPLOY.md): an Ubuntu EC2 server with a free DuckDNS hostname and automatic HTTPS. No domain needed.
