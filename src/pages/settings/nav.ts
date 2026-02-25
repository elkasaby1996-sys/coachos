import type { LucideIcon } from "lucide-react";
import {
  Building2,
  UserRound,
  Shield,
  CreditCard,
  Palette,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";

export type SettingsSectionId =
  | "workspace"
  | "public-profile"
  | "account"
  | "billing"
  | "appearance"
  | "defaults"
  | "danger";

export type SettingsNavItem = {
  id: SettingsSectionId;
  label: string;
  description: string;
  to: `/settings/${SettingsSectionId}`;
  icon: LucideIcon;
};

export const settingsNavItems: SettingsNavItem[] = [
  {
    id: "workspace",
    label: "Workspace",
    description: "Branding and workspace identity",
    to: "/settings/workspace",
    icon: Building2,
  },
  {
    id: "public-profile",
    label: "Public Profile",
    description: "Marketplace listing details",
    to: "/settings/public-profile",
    icon: UserRound,
  },
  {
    id: "account",
    label: "Account",
    description: "Email and password",
    to: "/settings/account",
    icon: Shield,
  },
  {
    id: "billing",
    label: "Billing",
    description: "Plan and billing portal",
    to: "/settings/billing",
    icon: CreditCard,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and density",
    to: "/settings/appearance",
    icon: Palette,
  },
  {
    id: "defaults",
    label: "Defaults & Templates",
    description: "Template and library defaults",
    to: "/settings/defaults",
    icon: SlidersHorizontal,
  },
  {
    id: "danger",
    label: "Danger Zone",
    description: "Destructive workspace actions",
    to: "/settings/danger",
    icon: TriangleAlert,
  },
];
