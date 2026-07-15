# Waggle & Co. — AI Video Ad Playbook

Why this niche works for AI video: animals are the most forgiving subject AI
video generators have. A slightly-off dog still reads as *cute*; a
slightly-off human face reads as uncanny and kills trust. Pet content also
has built-in virality (nobody scrolls past a husky losing its mind), and
purchases are emotional and impulse-priced ($14–70 here).

## Format rules (all platforms)

- **9:16 vertical**, 15–30 seconds, designed for sound-on but readable muted
  (burn in captions).
- **The hook is the ad.** The first 1.5 seconds decide everything. Open on
  the pet or the mess — never on a logo or the product box.
- One product, one problem, one payoff per video. End with the offer
  ("Free shipping · 30-day wag-guarantee") and the product page URL.
- Make 3–5 hook variants per product against the same body footage; kill
  anything under ~20% 3-second hold rate and re-cut.
- Disclose AI-generated content where the platform requires it (TikTok and
  Meta both have toggles for this).

## Five formats that carry this store

1. **Problem montage → product** — 3 fast clips of the chaos (fur on the
   couch, muddy paws on white tile), hard cut to the product working, end on
   the calm "after."
2. **Talking pet (voiceover)** — the pet "narrates" its own review, deadpan.
   AI lip-sync/animation on a pet is charming, not creepy. Best for
   comedy-first hooks.
3. **POV pet** — camera at pet height, pet's inner monologue as captions.
   "POV: you're a cat and the water bowl has been STILL for 3 hours."
4. **Before/after split** — shedding season vs. after the grooming vacuum;
   tug-of-war walk vs. loose-leash walk. Simple, provable, converts.
5. **Fake UGC review** — handheld feel, 'unboxing + first reaction' beats,
   voiceover reads like a 5-star review (use your real review copy once you
   have it — don't fabricate claims like "vet approved").

## Per-product ad angles

### FurAway Pro Grooming Vacuum — the hero product, lead with this
- Hook: extreme close-up of fur tumbleweed drifting across a wooden floor
  like the Wild West. Caption: "Shedding season won."
- Hook: "My husky sheds a second husky every week."
- Body: brush glides, fur visibly disappears into the canister, one-click
  empty into the bin (the *most* satisfying beat — hold on it).
- Format: problem montage or before/after. This is the store's featured
  product; every other ad can retarget to it.

### MudBuster Paw Cleaner
- Hook: slow-mo muddy paws sprinting toward a white carpet, horror-movie
  strings. "He's home."
- Body: dunk-twist-done in real time (it genuinely takes 10 seconds — show
  the 10 seconds). After-shot: clean paw on white sofa.
- Format: problem montage. Rain-season seasonal spikes — schedule around them.

### ZoomOrb Jumping Ball
- Hook: cat sitting dead-eyed next to a mountain of ignored toys. "He's
  bored of everything. Watch this."
- Body: ball starts bouncing on its own, cat's pupils dilate, parkour ensues.
- Format: POV pet or straight reaction footage. Cat reaction videos are the
  single most reliable pet-content format on TikTok.

### CalmCloud Donut Bed
- Hook: dog pacing and circling at 2am. Caption: "She does this every night."
- Body: pet steps in, does the settle-spin, melts. Time-lapse of 8 hours of
  uninterrupted sleep. "Mildly offended, very well rested." (from the review)
- Format: before/after or talking pet. Emotional angle: anxiety relief, not
  furniture.

### BackSeat Buddy Car Hammock
- Hook: wet dog leaping into a pristine back seat in slow motion. "$800
  detailing bill incoming."
- Body: 60-second install time-lapse, beach day, shake-out at the end.
- Format: problem montage. Targets overlap with camping/roadtrip audiences.

### WhiskerFalls Fountain
- Hook: cat pawing sadly at a still water bowl / drinking from the tap.
  "Your cat isn't drama. Still water reads as 'stale' to them."
- Body: fountain flowing, cat drinking happily, "vets recommend more water
  for indoor cats" educational beat.
- Format: POV cat. Educational hooks convert well for this one — it solves a
  real health worry.

### EasyWalk Vest Harness
- Hook: human waterskiing behind a lab on a leash (AI video shines at this
  kind of exaggeration).
- Body: swap collar for the vest, pressure moves off the throat, loose-leash
  walking; reflective strips glowing on an evening walk as the closer.
- Format: before/after. The "collar = choking, vest = steering" line is the
  educational hook that converts.

### FuzzOff Roller
- Hook: lint roller sheet count hitting 47 on one sofa cushion.
- Body: roller passes, chamber fills visibly, one-click empty. Oddly
  satisfying — let the fur pile do the talking.
- Format: fake UGC. This is the classic "TikTok made me buy it" product;
  lean into that phrase.

### Sniff & Seek Snuffle Mat
- Hook: "10 minutes of this = a 30-minute walk. Dog trainers know."
- Body: scatter kibble, dog goes full truffle-pig, then passes out.
- Format: educational UGC. Target rainy-day/apartment-dog audiences.

### Lick'n'Chill Mat
- Hook: dog screaming at bath time (every owner has lived this).
- Body: peanut butter on mat, mat on tile wall, silent contented licking
  while the shampoo happens. "Bath time's secret weapon."
- Format: before/after. Pairs naturally with MudBuster in a bundle ad.

## Production pipeline (suggested)

1. Generate stills of the "problem" and "payoff" scenes first; animate the
   keepers into video (image→video gives more control than text→video).
2. Add voiceover + captions; keep cuts under 1.5s each.
3. This repo's owner has Higgsfield connected in Claude — image/video
   generation, UGC-ad workflows, voice, and a virality predictor can all be
   driven from a Claude session against the exact products in
   `data/products.json`.
4. Landing alignment: every ad links to its `product.html?id=…` page, which
   already mirrors the ad promise (benefit checklist, rating, guarantee).

## Honesty guardrails

The site carries **real reviews only** (`data/reviews.json`, verified against
orders) — there are no seeded ratings anywhere, and ads must match: never
invent review counts, star ratings, customer quotes, or authority claims
("vet approved") you can't source. Product-category facts are fair game
("the kicker toy behind a million cat videos" describes the product type, not
your customers). Cute exaggeration (waterskiing behind a lab) is fine; fake
social proof is illegal (FTC 2024 fake-review rule, EU/Norwegian consumer
law) and gets ad accounts banned. Once real reviews arrive, quoting them in
ads — with permission — is the strongest creative you'll have.
