const ADJECTIVES = [
  "swift", "bright", "silent", "cosmic", "neon", "vivid", "lucid", "bold",
  "keen", "calm", "wild", "cool", "warm", "deft", "sly", "apt", "zen",
  "raw", "odd", "wry",
];

const NOUNS = [
  "fox", "owl", "lynx", "wolf", "bear", "hawk", "pike", "crab", "moth",
  "wasp", "yak", "eel", "cod", "ant", "bat", "ram", "elk", "jay", "koi", "pug",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateBotName(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${Math.floor(Math.random() * 900 + 100)}`;
}
