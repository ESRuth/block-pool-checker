# Glossary

One name for each thing, used the same way in the app, the docs, the code and conversation. If a word elsewhere disagrees with this file, fix that word.

## The game

| Term | Means |
|---|---|
| **Pool** | The game as people play it: one game, one grid, one set of buyers ("the $10 pool for Sunday's game"). The activity. |
| **Sheet** | The paper a pool is played on, and its saved copy in the app (photo, grid, digits, names, game). What the app lists, opens, posts, publishes and deletes. One pool has one sheet. |
| **Block** | One of the 100 spaces on a sheet, written row, column, 1-based ("8,6"). A block with a name on it has been bought. |
| **Grid** | The 10 x 10 lines on the sheet, and the four corner handles used to place it on the photo. |
| **Box** | The outline the app draws around a winning block on the photo, carrying its period number. |
| **Top team / left team** | The team written across the top (its score's last digit picks the column) and the team down the side (picks the row). |
| **Digits** | The 0 to 9 written along the top and down the side, one of each, drawn shortly before the game. Always a permutation, or the app stops. |
| **Ending** | The last digit of a team's score. A block wins when its two digits match the two endings. |
| **Period** | One of the four payouts: end of the 1st quarter (**1**), halftime (**2**), end of the 3rd quarter (**3**), final (**F**). |
| **Winner** | The owner of the block that matches the score at the end of a period, once the period is official. |
| **Winning now** | The same, but provisional: the period is still being played and can change. |
| **Mine / your blocks** | Blocks a person has marked as theirs. Private to editors; viewers never receive them. |
| **Name** | The handwriting on a block, as read or typed. |
| **Unverified** | A name nobody has confirmed (shown "?"). |
| **Game** | The real NFL game (teams, kickoff, score). A sheet is attached to one game. |
| **Score** | The numbers from ESPN, always with where they came from and when. Called live only while fresh. |
| **Reader** | The model that looks at a photo and proposes teams, digits, corners and names. It only proposes; a person confirms. |

## People

| Term | Means |
|---|---|
| **Owner** | The one person who holds the owner code and runs the whole install. Can do everything a runner can, on every venue and sheet, bypasses PINs, makes venues and personal links, and is the only one who can delete a deleted sheet for good. The owner page is `/owner`. |
| **Runner** | A person who runs a venue's sheets: posts them, adds photos, publishes, renames, changes the PIN, deletes and restores. Has a personal key. A venue has a main runner and backups, all equal. |
| **Backup** | A runner who is not the main one. Same powers. |
| **Maker** | The person who made a particular sheet ("Added by"). Can always edit it. |
| **Viewer** | Someone who only watches: has the venue PIN (or a sheet's own PIN), sees names and winners, never the photo (unless a runner allows it) or marked blocks. |
| **Editor** | Anyone who can change a particular sheet: the owner, its maker, or a runner of its venue. |

## Places and stages

| Term | Means |
|---|---|
| **Venue** | A place that runs pools (a lodge, bar or club): one permanent QR code, one PIN, a few runners, and the sheets posted on it. |
| **QR code** | The printed code for a venue. It never changes and shows no names. |
| **Tag** | The runner's short label on a sheet ("$10"), added when the sheet is started to tell two pools for one game apart. Everything else shown about a sheet (teams, day) comes from its game. |

A sheet's **stages**, in order:

| Stage | Means | Who sees it |
|---|---|---|
| **Posted** | The sheet is on the venue's wall: the game is chosen and the teams are placed, but there is no photo yet, so no names or digits. Viewers see **Open for blocks**: the game, the date and the tag, with one line saying to see the venue to get a block. | Viewers see that bare line; runners and the owner see the sheet |
| **Draft** | The photo (digits drawn) is in; the runner is checking the grid and names. A sheet made straight from a photo and put on a venue also starts here. | The people who could edit it. Viewers still see only "Open for blocks" |
| **Published** | A runner tapped Publish. | Also anyone with the PIN |
| **Pre-game / live / final** | Come from the score feed; not stored as a stage. | Same as published |
| **Deleted** | A runner deleted it. Hidden from viewers and links; kept, marked "Deleted", until the removal date, so it can be restored. | The people who could edit it |
| **Gone** | The removal date passed (7 days after the game, or 7 days after it was made if later). Cannot be restored. | Nobody |

"Hide it again" returns a published sheet to **draft**. "Delete for good" (owner only) removes a deleted sheet before its removal date.

## Access: codes, links, keys

| Term | Means | Where it lives |
|---|---|---|
| **Owner code** | The master secret, 20+ random characters. Signs a browser in as the owner. | Cloud Run env var `INVITE_CODE`; the owner's `.env` as `INVITE_CODE_PROD`; sent as the `X-Invite-Code` header |
| **Personal link** | The link the owner sends one person (`/join#c=<key>`). Opening it signs that phone in. "Invite someone" on the owner page makes one. | Sent to the person |
| **Personal key** | The secret inside a personal link. Kept on the person's phone; the server keeps only a hash. Revocable. | The phone (`bpc.key`) |
| **Access code** | What the sign-in box on Home and the photo-reading prompt ask for: the owner code or a personal key. | |
| **Venue link** | `/v/<code>`: where the QR code points. | |
| **PIN** | 4 to 8 digits that open a venue (or one sheet with its own). Told in person or in a group chat; never printed next to the QR code. | The record (hashed to check, and encrypted so the owner and runners can be shown it) |
| **Pass** | What the phone gets after a right PIN: a signed cookie, up to 90 days; changing the PIN signs everyone out. | The phone |
| **Lockout** | After 5 wrong PINs in a row the PIN locks for 1, 2, 4 … up to 60 minutes. | |
