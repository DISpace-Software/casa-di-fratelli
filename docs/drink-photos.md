# Casa drink photographs

The 149 active Bar entries audited on 19 October 2026 have local transparent PNG photographs. Assets use a 512 × 512 canvas, a shared baseline and contained proportions. Source pixels and brand labels are retained; backgrounds are removed without generative redrawing.

`frontend/public/drinks/sources.json` records the menu name, serving size, source product/recipe page, source image URL and local image URL for each entry. Coffee, fresh juice, homemade drinks, draught beer and cocktails use illustrative serving photographs. Signature cocktail illustrations were approved by the owner. Bottle photos identify the product; the menu's text remains authoritative for the serving volume.

`CasaDrinkPhotos` supplies defaults by Bulgarian product name and serving size, only for the Casa tenant's Bar department. Existing administrator-uploaded image URLs always take priority. No menu rows, prices, availability flags or reservations are modified. New or renamed products retain the standard fallback until their photograph is added.

To replace an image, upload it through the menu editor, or update the catalogue PNG and its provenance record together. Keep the canvas transparent and do not distort labels. When adding a catalogue entry, update `CasaDrinkPhotos` and verify that its path exists under `frontend/public`.
