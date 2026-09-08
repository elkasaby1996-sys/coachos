import { forwardRef } from "react";
import type { Icon, IconProps } from "@phosphor-icons/react";
import { ArchiveIcon } from "@phosphor-icons/react/dist/csr/Archive";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowDownRightIcon } from "@phosphor-icons/react/dist/csr/ArrowDownRight";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { ArrowsCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowsCounterClockwise";
import { ArrowsLeftRightIcon } from "@phosphor-icons/react/dist/csr/ArrowsLeftRight";
import { AtIcon } from "@phosphor-icons/react/dist/csr/At";
import { BankIcon } from "@phosphor-icons/react/dist/csr/Bank";
import { BarbellIcon } from "@phosphor-icons/react/dist/csr/Barbell";
import { BatteryMediumIcon } from "@phosphor-icons/react/dist/csr/BatteryMedium";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { BellRingingIcon } from "@phosphor-icons/react/dist/csr/BellRinging";
import { BookOpenIcon } from "@phosphor-icons/react/dist/csr/BookOpen";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { CalendarDotsIcon } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CaretUpIcon } from "@phosphor-icons/react/dist/csr/CaretUp";
import { ChartBarIcon } from "@phosphor-icons/react/dist/csr/ChartBar";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { ChatTeardropDotsIcon } from "@phosphor-icons/react/dist/csr/ChatTeardropDots";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CircleDashedIcon } from "@phosphor-icons/react/dist/csr/CircleDashed";
import { CircleNotchIcon } from "@phosphor-icons/react/dist/csr/CircleNotch";
import { ClipboardTextIcon } from "@phosphor-icons/react/dist/csr/ClipboardText";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { CompassIcon } from "@phosphor-icons/react/dist/csr/Compass";
import { ConfettiIcon } from "@phosphor-icons/react/dist/csr/Confetti";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { CreditCardIcon } from "@phosphor-icons/react/dist/csr/CreditCard";
import { CurrencyCircleDollarIcon } from "@phosphor-icons/react/dist/csr/CurrencyCircleDollar";
import { CursorClickIcon } from "@phosphor-icons/react/dist/csr/CursorClick";
import { DatabaseIcon } from "@phosphor-icons/react/dist/csr/Database";
import { DeviceMobileIcon } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { EnvelopeIcon } from "@phosphor-icons/react/dist/csr/Envelope";
import { EnvelopeSimpleOpenIcon } from "@phosphor-icons/react/dist/csr/EnvelopeSimpleOpen";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { FileTextIcon } from "@phosphor-icons/react/dist/csr/FileText";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { FlameIcon } from "@phosphor-icons/react/dist/csr/Flame";
import { FlaskIcon } from "@phosphor-icons/react/dist/csr/Flask";
import { FloppyDiskIcon } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { ForkKnifeIcon } from "@phosphor-icons/react/dist/csr/ForkKnife";
import { FunnelIcon } from "@phosphor-icons/react/dist/csr/Funnel";
import { GaugeIcon } from "@phosphor-icons/react/dist/csr/Gauge";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { GiftIcon } from "@phosphor-icons/react/dist/csr/Gift";
import { GlobeIcon } from "@phosphor-icons/react/dist/csr/Globe";
import { HeartbeatIcon } from "@phosphor-icons/react/dist/csr/Heartbeat";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { ImageIcon as PhosphorImage } from "@phosphor-icons/react/dist/csr/Image";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { InstagramLogoIcon } from "@phosphor-icons/react/dist/csr/InstagramLogo";
import { KeyIcon } from "@phosphor-icons/react/dist/csr/Key";
import { LaptopIcon } from "@phosphor-icons/react/dist/csr/Laptop";
import { LifebuoyIcon } from "@phosphor-icons/react/dist/csr/Lifebuoy";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { LinkBreakIcon } from "@phosphor-icons/react/dist/csr/LinkBreak";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/csr/LinkedinLogo";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { ListChecksIcon } from "@phosphor-icons/react/dist/csr/ListChecks";
import { LockIcon } from "@phosphor-icons/react/dist/csr/Lock";
import { LockKeyIcon } from "@phosphor-icons/react/dist/csr/LockKey";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { PackageIcon } from "@phosphor-icons/react/dist/csr/Package";
import { PaletteIcon } from "@phosphor-icons/react/dist/csr/Palette";
import { PaperPlaneRightIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneRight";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PauseCircleIcon } from "@phosphor-icons/react/dist/csr/PauseCircle";
import { PencilLineIcon } from "@phosphor-icons/react/dist/csr/PencilLine";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { PhoneIcon } from "@phosphor-icons/react/dist/csr/Phone";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { ProhibitIcon } from "@phosphor-icons/react/dist/csr/Prohibit";
import { PulseIcon } from "@phosphor-icons/react/dist/csr/Pulse";
import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import { ReceiptIcon } from "@phosphor-icons/react/dist/csr/Receipt";
import { RocketLaunchIcon } from "@phosphor-icons/react/dist/csr/RocketLaunch";
import { ScanIcon } from "@phosphor-icons/react/dist/csr/Scan";
import { ShieldIcon } from "@phosphor-icons/react/dist/csr/Shield";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { ShieldWarningIcon } from "@phosphor-icons/react/dist/csr/ShieldWarning";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
import { TimerIcon } from "@phosphor-icons/react/dist/csr/Timer";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { TreeStructureIcon } from "@phosphor-icons/react/dist/csr/TreeStructure";
import { TrendUpIcon } from "@phosphor-icons/react/dist/csr/TrendUp";
import { TrophyIcon } from "@phosphor-icons/react/dist/csr/Trophy";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { UserIcon } from "@phosphor-icons/react/dist/csr/User";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { UserMinusIcon } from "@phosphor-icons/react/dist/csr/UserMinus";
import { UserPlusIcon } from "@phosphor-icons/react/dist/csr/UserPlus";
import { UsersIcon } from "@phosphor-icons/react/dist/csr/Users";
import { WalletIcon } from "@phosphor-icons/react/dist/csr/Wallet";
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { WatchIcon } from "@phosphor-icons/react/dist/csr/Watch";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { XCircleIcon } from "@phosphor-icons/react/dist/csr/XCircle";
import { YoutubeLogoIcon } from "@phosphor-icons/react/dist/csr/YoutubeLogo";

export type AppIcon = Icon;
export type { IconProps };

// Shared symbols keep client and coach features visually consistent.
// Direct imports and pure factories allow unused icons to be tree-shaken.
function defineIcon(Symbol: Icon, name: string): AppIcon {
  const Component = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <Symbol size={24} weight="regular" focusable={false} {...props} ref={ref} />
  ));
  Component.displayName = name;
  return Component;
}

export const Activity = /* @__PURE__ */ defineIcon(PulseIcon, "Activity");
export const AlertCircle = /* @__PURE__ */ defineIcon(
  WarningCircleIcon,
  "AlertCircle",
);
export const AlertTriangle = /* @__PURE__ */ defineIcon(
  WarningIcon,
  "AlertTriangle",
);
export const Apple = /* @__PURE__ */ defineIcon(ForkKnifeIcon, "Apple");
export const Archive = /* @__PURE__ */ defineIcon(ArchiveIcon, "Archive");
export const ArrowDown = /* @__PURE__ */ defineIcon(ArrowDownIcon, "ArrowDown");
export const ArrowDownRight = /* @__PURE__ */ defineIcon(
  ArrowDownRightIcon,
  "ArrowDownRight",
);
export const ArrowLeft = /* @__PURE__ */ defineIcon(ArrowLeftIcon, "ArrowLeft");
export const ArrowRight = /* @__PURE__ */ defineIcon(
  ArrowRightIcon,
  "ArrowRight",
);
export const ArrowRightLeft = /* @__PURE__ */ defineIcon(
  ArrowsLeftRightIcon,
  "ArrowRightLeft",
);
export const ArrowUp = /* @__PURE__ */ defineIcon(ArrowUpIcon, "ArrowUp");
export const ArrowUpRight = /* @__PURE__ */ defineIcon(
  ArrowUpRightIcon,
  "ArrowUpRight",
);
export const AtSign = /* @__PURE__ */ defineIcon(AtIcon, "AtSign");
export const Ban = /* @__PURE__ */ defineIcon(ProhibitIcon, "Ban");
export const BarChart3 = /* @__PURE__ */ defineIcon(ChartBarIcon, "BarChart3");
export const BatteryMedium = /* @__PURE__ */ defineIcon(
  BatteryMediumIcon,
  "BatteryMedium",
);
export const Bell = /* @__PURE__ */ defineIcon(BellIcon, "Bell");
export const BellRing = /* @__PURE__ */ defineIcon(BellRingingIcon, "BellRing");
export const BookOpen = /* @__PURE__ */ defineIcon(BookOpenIcon, "BookOpen");
export const Building = /* @__PURE__ */ defineIcon(BuildingsIcon, "Building");
export const Building2 = /* @__PURE__ */ defineIcon(BuildingsIcon, "Building2");
export const CalendarClock = /* @__PURE__ */ defineIcon(
  CalendarDotsIcon,
  "CalendarClock",
);
export const CalendarDays = /* @__PURE__ */ defineIcon(
  CalendarDotsIcon,
  "CalendarDays",
);
export const Check = /* @__PURE__ */ defineIcon(CheckIcon, "Check");
export const CheckCircle2 = /* @__PURE__ */ defineIcon(
  CheckCircleIcon,
  "CheckCircle2",
);
export const ChevronDown = /* @__PURE__ */ defineIcon(
  CaretDownIcon,
  "ChevronDown",
);
export const ChevronLeft = /* @__PURE__ */ defineIcon(
  CaretLeftIcon,
  "ChevronLeft",
);
export const ChevronRight = /* @__PURE__ */ defineIcon(
  CaretRightIcon,
  "ChevronRight",
);
export const ChevronUp = /* @__PURE__ */ defineIcon(CaretUpIcon, "ChevronUp");
export const CircleAlert = /* @__PURE__ */ defineIcon(
  WarningCircleIcon,
  "CircleAlert",
);
export const CircleDashed = /* @__PURE__ */ defineIcon(
  CircleDashedIcon,
  "CircleDashed",
);
export const CircleDollarSign = /* @__PURE__ */ defineIcon(
  CurrencyCircleDollarIcon,
  "CircleDollarSign",
);
export const CircleHelp = /* @__PURE__ */ defineIcon(
  QuestionIcon,
  "CircleHelp",
);
export const ClipboardCheck = /* @__PURE__ */ defineIcon(
  ClipboardTextIcon,
  "ClipboardCheck",
);
export const ClipboardList = /* @__PURE__ */ defineIcon(
  ClipboardTextIcon,
  "ClipboardList",
);
export const Clock3 = /* @__PURE__ */ defineIcon(ClockIcon, "Clock3");
export const Compass = /* @__PURE__ */ defineIcon(CompassIcon, "Compass");
export const Copy = /* @__PURE__ */ defineIcon(CopyIcon, "Copy");
export const CreditCard = /* @__PURE__ */ defineIcon(
  CreditCardIcon,
  "CreditCard",
);
export const Database = /* @__PURE__ */ defineIcon(DatabaseIcon, "Database");
export const Download = /* @__PURE__ */ defineIcon(
  DownloadSimpleIcon,
  "Download",
);
export const Dumbbell = /* @__PURE__ */ defineIcon(BarbellIcon, "Dumbbell");
export const ExternalLink = /* @__PURE__ */ defineIcon(
  ArrowSquareOutIcon,
  "ExternalLink",
);
export const Eye = /* @__PURE__ */ defineIcon(EyeIcon, "Eye");
export const EyeOff = /* @__PURE__ */ defineIcon(EyeSlashIcon, "EyeOff");
export const FileText = /* @__PURE__ */ defineIcon(FileTextIcon, "FileText");
export const Film = /* @__PURE__ */ defineIcon(FilmStripIcon, "Film");
export const Filter = /* @__PURE__ */ defineIcon(FunnelIcon, "Filter");
export const Flame = /* @__PURE__ */ defineIcon(FlameIcon, "Flame");
export const FlaskConical = /* @__PURE__ */ defineIcon(
  FlaskIcon,
  "FlaskConical",
);
export const Gauge = /* @__PURE__ */ defineIcon(GaugeIcon, "Gauge");
export const Gift = /* @__PURE__ */ defineIcon(GiftIcon, "Gift");
export const Globe = /* @__PURE__ */ defineIcon(GlobeIcon, "Globe");
export const Globe2 = /* @__PURE__ */ defineIcon(GlobeIcon, "Globe2");
export const GripVertical = /* @__PURE__ */ defineIcon(
  DotsSixVerticalIcon,
  "GripVertical",
);
export const HeartPulse = /* @__PURE__ */ defineIcon(
  HeartbeatIcon,
  "HeartPulse",
);
export const Home = /* @__PURE__ */ defineIcon(HouseIcon, "Home");
export const ImageIcon = /* @__PURE__ */ defineIcon(PhosphorImage, "ImageIcon");
export const Info = /* @__PURE__ */ defineIcon(InfoIcon, "Info");
export const Instagram = /* @__PURE__ */ defineIcon(
  InstagramLogoIcon,
  "Instagram",
);
export const KeyRound = /* @__PURE__ */ defineIcon(KeyIcon, "KeyRound");
export const Landmark = /* @__PURE__ */ defineIcon(BankIcon, "Landmark");
export const Laptop = /* @__PURE__ */ defineIcon(LaptopIcon, "Laptop");
export const Layers3 = /* @__PURE__ */ defineIcon(StackIcon, "Layers3");
export const LayoutDashboard = /* @__PURE__ */ defineIcon(
  SquaresFourIcon,
  "LayoutDashboard",
);
export const Library = /* @__PURE__ */ defineIcon(BooksIcon, "Library");
export const LifeBuoy = /* @__PURE__ */ defineIcon(LifebuoyIcon, "LifeBuoy");
export const Link = /* @__PURE__ */ defineIcon(LinkIcon, "Link");
export const Link2 = /* @__PURE__ */ defineIcon(LinkIcon, "Link2");
export const Linkedin = /* @__PURE__ */ defineIcon(
  LinkedinLogoIcon,
  "Linkedin",
);
export const List = /* @__PURE__ */ defineIcon(ListIcon, "List");
export const ListChecks = /* @__PURE__ */ defineIcon(
  ListChecksIcon,
  "ListChecks",
);
export const Loader = /* @__PURE__ */ defineIcon(CircleNotchIcon, "Loader");
export const Loader2 = /* @__PURE__ */ defineIcon(CircleNotchIcon, "Loader2");
export const Lock = /* @__PURE__ */ defineIcon(LockIcon, "Lock");
export const LockKeyhole = /* @__PURE__ */ defineIcon(
  LockKeyIcon,
  "LockKeyhole",
);
export const LogOut = /* @__PURE__ */ defineIcon(SignOutIcon, "LogOut");
export const Mail = /* @__PURE__ */ defineIcon(EnvelopeIcon, "Mail");
export const MailPlus = /* @__PURE__ */ defineIcon(
  EnvelopeSimpleOpenIcon,
  "MailPlus",
);
export const MapPin = /* @__PURE__ */ defineIcon(MapPinIcon, "MapPin");
export const Menu = /* @__PURE__ */ defineIcon(ListIcon, "Menu");
export const MessageCircle = /* @__PURE__ */ defineIcon(
  ChatCircleDotsIcon,
  "MessageCircle",
);
export const MessageSquare = /* @__PURE__ */ defineIcon(
  ChatCircleDotsIcon,
  "MessageSquare",
);
export const MessageSquarePlus = /* @__PURE__ */ defineIcon(
  ChatTeardropDotsIcon,
  "MessageSquarePlus",
);
export const Minus = /* @__PURE__ */ defineIcon(MinusIcon, "Minus");
export const Moon = /* @__PURE__ */ defineIcon(MoonIcon, "Moon");
export const MoreHorizontal = /* @__PURE__ */ defineIcon(
  DotsThreeIcon,
  "MoreHorizontal",
);
export const MousePointerClick = /* @__PURE__ */ defineIcon(
  CursorClickIcon,
  "MousePointerClick",
);
export const Network = /* @__PURE__ */ defineIcon(TreeStructureIcon, "Network");
export const Package = /* @__PURE__ */ defineIcon(PackageIcon, "Package");
export const Palette = /* @__PURE__ */ defineIcon(PaletteIcon, "Palette");
export const PanelsTopLeft = /* @__PURE__ */ defineIcon(
  SquaresFourIcon,
  "PanelsTopLeft",
);
export const PartyPopper = /* @__PURE__ */ defineIcon(
  ConfettiIcon,
  "PartyPopper",
);
export const Pause = /* @__PURE__ */ defineIcon(PauseIcon, "Pause");
export const PauseCircle = /* @__PURE__ */ defineIcon(
  PauseCircleIcon,
  "PauseCircle",
);
export const Pencil = /* @__PURE__ */ defineIcon(PencilSimpleIcon, "Pencil");
export const PencilLine = /* @__PURE__ */ defineIcon(
  PencilLineIcon,
  "PencilLine",
);
export const Phone = /* @__PURE__ */ defineIcon(PhoneIcon, "Phone");
export const Play = /* @__PURE__ */ defineIcon(PlayIcon, "Play");
export const Plus = /* @__PURE__ */ defineIcon(PlusIcon, "Plus");
export const ReceiptText = /* @__PURE__ */ defineIcon(
  ReceiptIcon,
  "ReceiptText",
);
export const RefreshCcw = /* @__PURE__ */ defineIcon(
  ArrowsCounterClockwiseIcon,
  "RefreshCcw",
);
export const RefreshCw = /* @__PURE__ */ defineIcon(
  ArrowsClockwiseIcon,
  "RefreshCw",
);
export const Rocket = /* @__PURE__ */ defineIcon(RocketLaunchIcon, "Rocket");
export const RotateCcw = /* @__PURE__ */ defineIcon(
  ArrowCounterClockwiseIcon,
  "RotateCcw",
);
export const Save = /* @__PURE__ */ defineIcon(FloppyDiskIcon, "Save");
export const ScanSearch = /* @__PURE__ */ defineIcon(ScanIcon, "ScanSearch");
export const Search = /* @__PURE__ */ defineIcon(MagnifyingGlassIcon, "Search");
export const Send = /* @__PURE__ */ defineIcon(PaperPlaneTiltIcon, "Send");
export const SendHorizontal = /* @__PURE__ */ defineIcon(
  PaperPlaneRightIcon,
  "SendHorizontal",
);
export const Settings = /* @__PURE__ */ defineIcon(GearSixIcon, "Settings");
export const Settings2 = /* @__PURE__ */ defineIcon(GearSixIcon, "Settings2");
export const Shield = /* @__PURE__ */ defineIcon(ShieldIcon, "Shield");
export const ShieldAlert = /* @__PURE__ */ defineIcon(
  ShieldWarningIcon,
  "ShieldAlert",
);
export const ShieldCheck = /* @__PURE__ */ defineIcon(
  ShieldCheckIcon,
  "ShieldCheck",
);
export const SlidersHorizontal = /* @__PURE__ */ defineIcon(
  SlidersHorizontalIcon,
  "SlidersHorizontal",
);
export const Smartphone = /* @__PURE__ */ defineIcon(
  DeviceMobileIcon,
  "Smartphone",
);
export const Sparkles = /* @__PURE__ */ defineIcon(SparkleIcon, "Sparkles");
export const Sun = /* @__PURE__ */ defineIcon(SunIcon, "Sun");
export const Timer = /* @__PURE__ */ defineIcon(TimerIcon, "Timer");
export const TimerReset = /* @__PURE__ */ defineIcon(TimerIcon, "TimerReset");
export const Trash2 = /* @__PURE__ */ defineIcon(TrashIcon, "Trash2");
export const TrendingUp = /* @__PURE__ */ defineIcon(TrendUpIcon, "TrendingUp");
export const TriangleAlert = /* @__PURE__ */ defineIcon(
  WarningIcon,
  "TriangleAlert",
);
export const Trophy = /* @__PURE__ */ defineIcon(TrophyIcon, "Trophy");
export const Unlink = /* @__PURE__ */ defineIcon(LinkBreakIcon, "Unlink");
export const Upload = /* @__PURE__ */ defineIcon(UploadSimpleIcon, "Upload");
export const User = /* @__PURE__ */ defineIcon(UserIcon, "User");
export const UserCircle = /* @__PURE__ */ defineIcon(
  UserCircleIcon,
  "UserCircle",
);
export const UserMinus = /* @__PURE__ */ defineIcon(UserMinusIcon, "UserMinus");
export const UserPlus = /* @__PURE__ */ defineIcon(UserPlusIcon, "UserPlus");
export const UserRound = /* @__PURE__ */ defineIcon(UserIcon, "UserRound");
export const Users = /* @__PURE__ */ defineIcon(UsersIcon, "Users");
export const UsersRound = /* @__PURE__ */ defineIcon(UsersIcon, "UsersRound");
export const Utensils = /* @__PURE__ */ defineIcon(ForkKnifeIcon, "Utensils");
export const Wallet = /* @__PURE__ */ defineIcon(WalletIcon, "Wallet");
export const Watch = /* @__PURE__ */ defineIcon(WatchIcon, "Watch");
export const X = /* @__PURE__ */ defineIcon(XIcon, "X");
export const XCircle = /* @__PURE__ */ defineIcon(XCircleIcon, "XCircle");
export const Youtube = /* @__PURE__ */ defineIcon(YoutubeLogoIcon, "Youtube");
