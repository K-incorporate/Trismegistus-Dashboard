function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

const colorPalette = [
  "bg-blue-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-red-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-cyan-500",
];

const hexPalette: Record<string, string> = {
  "bg-blue-500": "#3B82F6",
  "bg-green-500": "#22C55E",
  "bg-yellow-500": "#EAB308",
  "bg-purple-500": "#A855F7",
  "bg-pink-500": "#EC4899",
  "bg-indigo-500": "#6366F1",
  "bg-red-500": "#EF4444",
  "bg-orange-500": "#F97316",
  "bg-teal-500": "#14B8A6",
  "bg-cyan-500": "#06B6D4",
};

export function getColorForSession(sessionId: string): string {
  return colorPalette[hashString(sessionId) % colorPalette.length];
}

export function getColorForApp(appName: string): string {
  return colorPalette[hashString(appName) % colorPalette.length];
}

export function getGradientForSession(sessionId: string): string {
  const base = getColorForSession(sessionId);
  const color = base.replace("bg-", "").replace("-500", "");
  if (color === "bg-gray") return "from-gray-500 to-gray-600";
  return `from-${color}-500 to-${color}-600`;
}

export function getGradientForApp(appName: string): string {
  const base = getColorForApp(appName);
  const color = base.replace("bg-", "").replace("-500", "");
  if (color === "bg-gray") return "from-gray-500 to-gray-600";
  return `from-${color}-500 to-${color}-600`;
}

export function tailwindToHex(twClass: string): string {
  return hexPalette[twClass] ?? "#3B82F6";
}

export function getHexColorForSession(sessionId: string): string {
  return tailwindToHex(getColorForSession(sessionId));
}

export function getHexColorForApp(appName: string): string {
  const h = hashString(appName) % 360;
  return `hsl(${h}, 70%, 50%)`;
}
