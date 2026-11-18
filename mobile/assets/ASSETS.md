# Asset provenance

`images/cosmos.png` and `images/made_in_blue.png` were created with the built-in **image_gen** tool for this project. They are fictional atmosphere images, not verified photographs of the named restaurants. Demo gallery photos are labelled as demonstrations in the viewer. No image-generation API key is required to run the app; all images are bundled.

The Cosmos prompt used the user's supplied screenshot as its visual reference:

> Create a standalone high resolution restaurant interior photograph matching as closely as possible the interior photograph inside the supplied mobile UI reference image. Output only the photograph edge-to-edge, no text, phone, UI or collage. A luxurious moody evening lounge: emerald green velvet curved banquette, round richly veined black marble cocktail table, glowing red pleated lamp, warm brass backlit bar on the right with tall olive and caramel stools, arched dark windows showing a European city building at dusk, greenery and red flowers. Low light, nearly black shadows, restrained gold highlights, realistic editorial hospitality photography. Landscape 4:3, cropping well to a wide card and detail hero.

The Made in Blue prompt:

> Create a cinematic editorial hospitality photograph of a small European restaurant dining room at night, matching a premium restaurant discovery app thumbnail. Deep cobalt blue vaulted and arched ceiling, sculptural amber gold globe pendant lamps, rich dark wooden tables and caramel chairs, intimate elegant atmosphere, no people, text or logos. Vertical 4:5, realistic eye-level interior photography, blue and warm brass palette.

`images/casa.webp` comes from this repository's `frontend/public/restaurant-interior.webp`. `images/cofein.webp`, `images/gallery_garden.webp`, `images/gallery_terrace.webp`, and `images/gallery_room.webp` reuse the existing Cofein project assets supplied in the local workspace. They are not fetched at runtime.

`fonts/Inter.ttf` is Inter's variable font from the official Google Fonts repository (`google/fonts`, `ofl/inter`). Its licence is bundled as `fonts/OFL-Inter.txt`.

`brand/app-icon.svg` is the editable code-authored SeatMap chair mark. `tool/generate_icons.py` reproduces the corresponding PNGs for Android, iOS and the web using Pillow.
