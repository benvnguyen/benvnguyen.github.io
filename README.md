# Ben V. Nguyen — Photographs

My personal photography portfolio.

## Adding a photo

1. Put the photo in the `images` folder.
2. Open a terminal in this folder and run:

   ```
   python tools/prepare_photos.py
   ```

3. Open `js/photos.js`, find the line with your photo's file name, and fill in its caption and date:

   ```
   {"file": "IMG_6001", "title": "Your caption", "date": "2026-10-21", ...}
   ```

   The date is filled in from the camera, so you only need to change it if it's wrong.

That's it. Photos always appear newest first, so a new photo lands in the right
place even if it's older than the others.
