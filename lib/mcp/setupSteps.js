// How a person adds Alyeska to each assistant, for the Settings section that
// hands them the address. Checked against each provider's help pages on
// September 26, 2026:
//   Claude: support.claude.com/en/articles/11175166
//   ChatGPT: help.openai.com/en/articles/12584461
//   Gemini: support.google.com/gemini/answer/17209137
// These screens change often; recheck the wording when a tester says a step
// isn't where it says.

// The address the protected-resource metadata names as the resource. Fixed
// rather than taken from the page, so a preview never hands out its own host.
export const MCP_ADDRESS = "https://www.alyeska.app/api/mcp";

export const ASSISTANT_SETUP = [
  {
    key: "claude",
    name: "Claude",
    plans: "Any plan",
    steps: [
      "In Claude, open Customize, then Connectors.",
      "Press +, then Add custom connector.",
      "Paste the address and press Add. Leave Advanced settings empty.",
      "Press Connect, sign in to Alyeska, and choose Allow.",
    ],
    note: "The Free plan allows one custom connector. On Team and Enterprise, an owner adds it under Organization settings first.",
  },
  {
    key: "chatgpt",
    name: "ChatGPT",
    plans: "Pro, Business, Enterprise or Edu",
    steps: [
      "On chatgpt.com, open Settings, then Apps, then Advanced settings, and turn on Developer mode.",
      "Back in Apps, press Create.",
      "Name it Alyeska, paste the address, and choose OAuth.",
      "Sign in to Alyeska, choose Allow, then press Create.",
    ],
    note: "On Pro, ChatGPT can read your trips but not change them. On Business, a workspace admin turns on developer mode first.",
  },
  {
    key: "gemini",
    name: "Gemini",
    plans: "Personal account, 18 or over, in the US",
    steps: [
      "On a computer, go to gemini.google.com.",
      "Open Settings, then Connected Apps.",
      "Under Custom apps, press Add a custom app and paste the address.",
      "Press Next, sign in to Alyeska, and choose Allow.",
    ],
    note: "Keep Activity has to be on. Once added, it works in the Gemini phone app too.",
  },
];
