import { sectionsMarkdown, type GuideSection } from "./guide";

/**
 * The privacy policy, written once. The /privacy page renders it and docs/PRIVACY.md is generated from it
 * (`UPDATE_GUIDE=1 pnpm --filter @bpc/web test` rewrites the file). Change it whenever what the app keeps, shares or deletes changes.
 */
export const PRIVACY_UPDATED = "2026-11-11";

export const PRIVACY_INTRO =
  "This policy says what Block Pool Checker keeps about you and about the people named on a pool sheet, who can see it, who it is shared with, and how long it lasts. It describes the app as built. Anyone can run their own copy of the app (it is open source); whoever runs a copy is responsible for it.";

export const PRIVACY: GuideSection[] = [
  {
    id: "short",
    title: "The short version",
    for: "",
    blocks: [
      {
        ul: [
          "There are no ads, no tracking and no selling of data. Nobody can sign up as a viewer.",
          "A sheet holds the names people wrote on the paper. They are read from the photo by an AI model, kept only to show who is winning, and deleted 7 or 30 days after the game.",
          "The photo of the sheet is private. Viewers don't see it unless a runner turns it on.",
          "The only cookie is the one that remembers a right PIN.",
        ],
      },
    ],
  },
  {
    id: "kept",
    title: "What is kept",
    for: "",
    blocks: [
      {
        ul: [
          "**A sheet:** the teams, the game, the digits, the names (as the app read them or as someone typed them), which blocks an editor marked as theirs, a name you choose for the sheet, and the name of the person who made it.",
          "**The photo of the sheet.** Your phone shrinks it and removes location and camera details before it is sent. It may show handwriting and, if people wrote them, phone numbers.",
          "**A person with a personal link:** the name the owner typed when making the link, a scrambled copy of the key (the key itself is not stored), how many times it was used and when it was last used.",
          "**A venue:** its name, a scrambled copy of its PIN, who runs it, and how many wrong PINs were tried lately.",
          "**Server logs.** The hosting service (Google Cloud Run) records each request: the time, the address asked for (which includes a sheet's or venue's code), the result, and the visitor's IP address. By default Google keeps these for about 30 days. The app itself never writes names, photos, PINs or keys to its logs.",
        ],
      },
      { h: "What is not kept" },
      {
        ul: [
          "Payments or any money details. The app does not take bets or handle money.",
          "Accounts, passwords, email addresses or phone numbers of viewers.",
          "A record of who watched a sheet.",
          "Your location. The photo's own location data is removed before it leaves your phone.",
        ],
      },
    ],
  },
  {
    id: "ai",
    title: "Reading names with AI",
    for: "",
    blocks: [
      {
        p: "A person photographs the paper sheet. To turn it into a grid of names, the app sends the photo, and then an image of the grid, to Google's Gemini model on Google Cloud (Vertex AI), run in this app's own Google Cloud project. The first request asks the model for the teams, the digits and where the grid is; the second asks it to read the 100 names. Nothing else is sent: no accounts, no contact details.",
      },
      {
        ul: [
          "The model only suggests. The names show as unconfirmed (“?”) until a person confirms or retypes them, and a rule stops the app if the digits are not valid. The model makes no decision about any person.",
          "The app does not store or log these requests. The result is saved only as part of the sheet, and is deleted with it.",
          "Google says it does not use this data to train its models. It may hold a request briefly: in memory for up to 24 hours, and longer (30 to 90 days, depending on the model) only if its safety checks flag it. The app uses Google's worldwide endpoint, so a request may be processed in any Google location.",
          "If a phone number is written on the sheet it is in the photo, and so in what is sent. If you don't want that, cover it before you take the picture.",
        ],
      },
    ],
  },
  {
    id: "see",
    title: "Who can see it",
    for: "",
    blocks: [
      {
        ul: [
          "**On a venue:** people with the venue's PIN see names and winners. The runners and the owner also see the photo and which blocks they marked. Viewers see the photo only if a runner turns it on for that sheet.",
          "**A sheet shared by a link:** anyone who has the link can see it, photo included. The link is the secret, so share it only with people in the pool.",
          "**A draft or a deleted sheet:** only the people who could edit it.",
          "**Marked blocks** are private to editors. Viewers never receive them.",
          "**The owner** of the app can see every sheet and the list of people with a personal link.",
          "Photos are served only through the app, never by a public address. Search engines are asked to skip every page.",
        ],
      },
    ],
  },
  {
    id: "long",
    title: "How long it is kept",
    for: "",
    blocks: [
      {
        ul: [
          "**A sheet** is removed 7 days after the game when it is on a venue, otherwise 30 days after the game (or 30 days after it was made, if that is later). Editing does not extend this. Once removed it cannot be brought back.",
          "**A deleted sheet** is hidden from everyone at once but kept until that date, so a mistake can be undone. The owner can erase it sooner.",
          "**The photo** is deleted with the sheet when someone deletes it for good. When a sheet runs out of time, its photo is removed the same day, and in every case no later than 60 days after the photo was uploaded.",
          "**A personal link** lasts until the owner turns it off. Turning it off stops the key working; the record of the name and the use counts remains.",
          "**A venue** lasts until the owner closes it, which deletes its sheets and photos too.",
          "**Server logs** are kept by Google for about 30 days by default.",
        ],
      },
    ],
  },
  {
    id: "choices",
    title: "Your choices",
    for: "",
    blocks: [
      {
        p: "People named on a sheet usually never used the app, so the person who runs the pool is the one to ask.",
      },
      {
        ul: [
          "**Fix or remove your name:** ask the runner. They can retype any name on the sheet straight away.",
          "**Have a whole sheet deleted:** ask the runner, who can delete it at once. The owner can erase it for good.",
          "**Leave a pool:** ask to be left off the next sheet. Past sheets disappear on their own within 7 to 30 days.",
          "**If you have a personal link** and want it ended, ask the owner to turn it off.",
        ],
      },
    ],
  },
  {
    id: "phone",
    title: "On your phone",
    for: "",
    blocks: [
      {
        ul: [
          "**A cookie** that remembers a right PIN, so you don't enter it again. It is needed for the app to work, is sent only to this app, and lasts up to 90 days.",
          "**Stored in the browser:** a personal key (only if you have a personal link), and the last score the app fetched, so it can show something when you're offline.",
          "**The installed app** keeps its own pages and images on your phone so it opens quickly.",
          "Clearing the site's data in your browser removes all of this. There are no tracking or advertising cookies, and no analytics.",
        ],
      },
    ],
  },
  {
    id: "others",
    title: "Who else is involved",
    for: "",
    blocks: [
      {
        ul: [
          "**Google Cloud** hosts the app (Cloud Run), stores the sheets (Firestore) and the photos (Cloud Storage, in a private bucket), and runs the AI reader (Vertex AI). The app is hosted in the United States (Cloud Run in us-east1).",
          "**ESPN** supplies scores. The app's server asks for a game's score; no one's name, photo or address is passed on.",
          "Nothing is sold or shared with anyone else.",
        ],
      },
    ],
  },
  {
    id: "security",
    title: "Keeping it safe",
    for: "",
    blocks: [
      {
        ul: [
          "Everything travels over an encrypted connection.",
          "PINs and keys are stored scrambled and checked on the server. Wrong PINs lock out guessing for longer each time.",
          "No system is perfect. A PIN works for anyone who learns it, like the paper sheet on the wall; change it if it has spread.",
          "To report a security problem, use the private “Report a vulnerability” button on the project's GitHub page.",
        ],
      },
    ],
  },
  {
    id: "other",
    title: "Other things",
    for: "",
    blocks: [
      {
        ul: [
          "The app is for adults. It is not aimed at children and does not knowingly collect anything about them.",
          "Whether a pool is allowed where you live is up to you and the person running it. The app only reads a sheet and shows the winners.",
          "This policy can change. The date at the top of this page shows the last change, and earlier versions are in the project's history on GitHub.",
          "Questions: ask the person who runs your pool or the owner of the app. For the project itself, open an issue on GitHub.",
        ],
      },
    ],
  },
];

export function privacyMarkdown(): string {
  return sectionsMarkdown(
    "Privacy policy",
    `Last updated ${PRIVACY_UPDATED}.\n\n${PRIVACY_INTRO}`,
    PRIVACY,
    "Generated from apps/web/src/lib/privacy.ts: edit it there. The same text is the app's /privacy page.",
  );
}
