import type { CSSProperties } from "react";

export type WorkspaceBranding = {
  id: string;
  name: string | null;
  logo_url: string | null;
  accent_color: string | null;
  client_welcome_title: string;
  client_welcome_message: string | null;
  invite_sender_name: string;
};

export const BRANDING_SELECT =
  "id, name, logo_url, accent_color, client_welcome_title, client_welcome_message, invite_sender_name";
export const isAccentColor = (value: string) => /^#[\da-f]{6}$/i.test(value);
export function isLogoUrl(value: string) {
  if (!value.trim()) return true;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export const getInviteSenderName = (
  branding:
    | Pick<WorkspaceBranding, "name" | "invite_sender_name">
    | null
    | undefined,
) =>
  branding?.invite_sender_name?.trim() || branding?.name?.trim() || "RepSync";

const linear = (n: number) =>
  n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
const luminance = (rgb: number[]) =>
  rgb
    .map(linear)
    .reduce((sum, n, i) => sum + n * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
const ratio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export function getAccessibleAccent(hex: string, dark: boolean) {
  let rgb = [1, 3, 5].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  // Maintain readable accent text on both portal surfaces and button labels.
  const background = dark ? 0.02 : 0.95;
  for (let i = 0; i < 100 && ratio(luminance(rgb), background) < 4.5; i++) {
    rgb = rgb.map((n) => n * 0.96 + (dark ? 0.04 : 0));
  }
  const [r = 0, g = 0, b = 0] = rgb.map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const cb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const channels = `${lightness} ${Math.hypot(a, cb)} ${((Math.atan2(cb, a) * 180) / Math.PI + 360) % 360}`;
  const foreground = ratio(luminance(rgb), 1) >= 4.5 ? "white" : "black";
  return {
    channels,
    foreground,
    contrast: Math.max(ratio(luminance(rgb), 1), ratio(luminance(rgb), 0)),
  };
}

export function getWorkspaceBrandingStyle(
  accent: string | null | undefined,
  dark = false,
): CSSProperties {
  if (!accent || !isAccentColor(accent)) return {};
  const { channels, foreground } = getAccessibleAccent(accent, dark);
  const color = `oklch(${channels})`;
  return {
    "--ui-action": color,
    "--ui-action-hover": `color-mix(in oklch, ${color} 90%, ${dark ? "white" : "black"})`,
    "--ui-action-text": foreground,
    "--primary": channels,
    "--primary-foreground": foreground === "white" ? "1 0 0" : "0 0 0",
    "--accent": channels,
    "--ring": channels,
    "--section-accent": color,
    "--section-accent-text": color,
    "--section-accent-icon": color,
    "--section-accent-border": `color-mix(in oklch, ${color} 35%, transparent)`,
  } as CSSProperties;
}
