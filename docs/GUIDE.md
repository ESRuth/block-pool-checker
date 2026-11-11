# User guide

<!-- Generated from apps/web/src/lib/guide.ts: edit it there. The same text is the app's /help page. -->

Block Pool Checker shows who is winning a football block pool. You photograph the paper sheet, the app reads it, and it follows the live score. Find the part that fits you: watching a pool, running a venue's pools, or looking after the whole app. How your data is handled is on the privacy page.

## Watching a pool

*For anyone who scans a venue's QR code.*

1. Scan the venue's QR code with your phone camera. The page shows the venue's name and asks for a PIN. Nothing else is shown until you enter it.
2. Enter the PIN. Ask the person running the pool if you don't have it. You only enter it once on each phone; it stays good for up to 90 days, or until the runner changes it.
3. Pick a sheet from **This week**. Each is named by its game and price, for example “Team A v Team B 11/11 $10”.

### What you see on a sheet

- **Winners.** The badges 1, 2, 3 and F are the end of the 1st quarter, halftime, the end of the 3rd quarter and the final. Each shows the score and who holds the winning block.
- **Winning now.** A period that is still being played shows who would win if it ended now. It can change until the period is over.
- **The score** updates by itself while the game is on. If the page can't reach the server, it says so and shows the last score it had, marked as not live.
- **A “?” beside a name** means the handwriting was read by the app and nobody has checked it yet. The name can be a letter or two off.
- **Names.** The Names tab lays out all 100 names like the paper sheet.

### Good to know

- **Open for blocks** means the sheet is up on the wall and the game is chosen, but the blocks aren't all filled yet. Ask at the venue to get one. There is nothing more to see until the runner adds the photo and publishes the sheet.
- You don't see the photo of the paper sheet, because it can show handwriting and phone numbers. The runner can turn it on for a sheet.
- Five wrong PINs in a row lock the PIN for a minute, then two, then four, up to an hour. Wait and try again, or ask the runner.
- Sheets are removed 7 days after the game.

## Running a venue

*For the runner of a venue and the backups. Everyone listed has the same powers.*

### Getting started

1. The owner sends you a personal link. Open it on your phone: you are signed in and taken to your venue. Then add the page to your home screen (iPhone: Share, then Add to Home Screen) so it opens signed in from an icon.
2. Your name is at the top right of every page. If you run one venue you land on it; if you run several, Home lists them. A venue's page shows the QR code, the PIN tools and this week's sheets.
3. Print the QR code once with **Print** and leave it up all year. It never changes and shows no names, so it is safe to display.
4. Tell people the PIN in person or in your group chat. Don't print it next to the QR code.

### Each week

1. **Post the sheet.** Tap **Post a new sheet**, pick the game (games that haven't started are listed, soonest first), and say which team you wrote across the top of the paper sheet. Put the paper sheet on the wall. People with the PIN now see it listed as “Open for blocks”.
2. **Add the photo.** When the blocks are filled and the digits are drawn, open the posted sheet and tap **Add the photo (digits drawn)**. Take a photo with the whole sheet in view: the team names, every digit and every block. The app reads it. Confirm any digits it couldn't read (each row needs 0 to 9 exactly once; nothing is guessed), then drag the grid corners until the lines sit on the printed blocks, and tap **Looks right: save**.
3. **Check the names.** The sheet is now a **draft**: only you, the other runners and the owner can see it. Open the Names tab and look over the names. Tap a “?” when the name is right, or retype it. Expect most names to be right and a few to be a letter off.
4. **Publish.** Tap **Publish**. Now people with the PIN can open it.
5. **Watch the game.** The winners fill in as the periods end. Nothing more to do.

### Two pools for one game

Post a second sheet for the same game and give each its own name, for example “Team A v Team B 11/11 $10” and “… $5”. In a sheet's Settings tab, under **This sheet**, change its name. Viewers pick the one they bought into.

### Changing things

- **The PIN.** On the venue page, **Show PIN** reveals the current one for a few seconds, so you can tell people; to change it, enter a new PIN (4 to 8 digits). Everyone has to enter the new one. One sheet can have its own PIN instead, in its Settings tab, which replaces the venue's for that sheet only.
- **The photo.** To let viewers see the photo of a sheet, turn it on in that sheet's Settings tab. Remember that it can show phone numbers.
- **Hide it again.** A published sheet can go back to a draft from its Settings tab. Viewers stop seeing it until you publish it again.
- **A wrong name or a moved grid.** Fix them on the sheet at any time, even after publishing. Changes save by themselves.

### Deleting and bringing back

Delete a sheet from its Edit tab. It disappears for everyone at once, but it is kept until its removal date (7 days after the game) and stays in your list, marked **Deleted**. Open it and tap **Restore this sheet** to bring it back exactly as it was. Only the owner can delete it for good before that date.

### If a PIN gets out

The venue page tells you when wrong PINs are being tried. If a PIN has spread to people it shouldn't have, change it.

## Looking after the app

*For the owner, the one person who holds the owner code.*

1. Open the app and enter the owner code (the code box asks for it when you are not signed in). The code is the master key: keep it out of chat messages and screenshots. The bar at the top has three places: **Venues**, **Sheets** and **People**. To switch between the owner and a personal link on one browser, use **Use a different code** in the menu under your name.
2. **Invite someone** (People). Type their name and tap **Make their link**. Send them the link; opening it signs their phone in. **Get a link** makes a fresh one later, and **Turn off** ends their access.
3. **Make a venue** (Venues). Give it a name and a first PIN and choose its runners (a main one and backups) from the people you have invited. The venue's QR code is on its page. A private pool (an office or a family pool) gets a venue too: it is only a name, a PIN and someone to run it.
4. **Close** removes a venue and its sheets.

### What the owner can do

- Everything a runner can, on every venue and sheet, without a PIN.
- See every sheet in the Sheets tab, including deleted ones, marked **Deleted** with the day each goes for good.
- **Delete for good** a deleted sheet before its removal date. Runners can restore a deleted sheet; only the owner can erase one early.

## Questions

*Common ones.*

### Why does the app say a name might be wrong?

A model reads the handwriting and proposes the names; it is right most of the time but not always. A “?” means nobody has confirmed it. Tap it when it's right, or retype it.

### The digits stopped me. Why?

Each row of digits must have 0 to 9 exactly once. If the app can't read one cleanly, it asks you to type it rather than guess, because a wrong digit gives the wrong winner.

### It says a score isn't live.

The score comes from ESPN. If the app can't reach it, it shows the last score it had and says so, rather than presenting an old score as live.

### Who can see my photo?

Only the runners of the venue, unless a runner turns it on for that sheet. The privacy page has the details.

### I lost my access.

Ask the owner for a new personal link. Lost the PIN? Ask the runner.
