/**
 * Icons drawn as line diagrams, not emoji.
 *
 * Emoji were doing real damage here: a 🔈 and a 🔉 differ by one bar and say
 * nothing about *where the thing goes*, which is the only property that matters
 * when you are about to tap a floor and commit a mounting decision. Every asset
 * icon below draws the item against its host surface — a ceiling line above a
 * recessed can, a wall line beside a flush-mount box, a floor line under a
 * subwoofer — so the mount logic is legible before you place anything.
 *
 * All 24×24, stroked in currentColor, so they inherit the button state and stay
 * crisp at the 15-18 px the toolbox uses.
 */
import type { ReactElement } from 'react';

const S = ({ children, size = 17 }: { children: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
/** The host surface, drawn faint so the item reads as the subject. */
const surface = (d: string) => <path d={d} opacity=".38" strokeWidth="2" />;

export const ASSET_ICON: Record<string, ReactElement> = {
  /* ---- audio: each speaker against the surface it mounts to ---- */
  spk_ceiling: (<S>{surface('M2 4h20')}<circle cx="12" cy="13" r="6" />
    <circle cx="12" cy="13" r="2.4" /><path d="M12 4v3" opacity=".5" /></S>),
  spk_wall: (<S>{surface('M4 2v20')}<rect x="7" y="4.5" width="10" height="15" rx="1.4" />
    <circle cx="12" cy="9" r="2" /><circle cx="12" cy="15.5" r="2.8" /></S>),
  spk_surround: (<S>{surface('M3 2v20')}<path d="M6 8l3-2.2" /><path d="M6 12.5l3 2.2" />
    <path d="M9 5.5l9 2.6v7.8l-9 2.6z" /><circle cx="13.5" cy="12" r="2.2" /></S>),
  spk_bookshelf: (<S>{surface('M3 20h18')}<rect x="7.5" y="5" width="9" height="15" rx="1.2" />
    <circle cx="12" cy="9" r="1.7" /><circle cx="12" cy="15" r="2.6" /></S>),
  sub: (<S>{surface('M2 21h20')}<rect x="4" y="6" width="16" height="15" rx="1.6" />
    <circle cx="12" cy="14" r="4.6" /><circle cx="12" cy="14" r="1.4" />
    <circle cx="7" cy="8.6" r="1" /></S>),

  /* ---- lighting: the beam angle is the whole point, so it is drawn ---- */
  dl_wide: (<S>{surface('M2 4h20')}<path d="M8.5 4v2.2h7V4" /><path d="M8.5 6.2L3 20" />
    <path d="M15.5 6.2L21 20" /><path d="M6 20h12" opacity=".45" /></S>),
  dl_narrow: (<S>{surface('M2 4h20')}<path d="M9.5 4v2.4h5V4" /><path d="M9.5 6.4L8 20" />
    <path d="M14.5 6.4L16 20" /><path d="M8 20h8" opacity=".45" /></S>),
  pendant: (<S>{surface('M2 3h20')}<path d="M12 3v6.5" /><path d="M6.5 17l5.5-7.5 5.5 7.5z" />
    <path d="M7.5 17h9" /></S>),
  lamp_floor: (<S>{surface('M2 21h20')}<path d="M12 8.5V21" /><path d="M8.5 21h7" />
    <path d="M7.5 8.5l1.8-4.5h5.4l1.8 4.5z" /></S>),
  lamp_table: (<S>{surface('M2 20h20')}<path d="M12 11.5V18" /><path d="M9 18h6" />
    <path d="M7.5 11.5l1.6-5.5h5.8l1.6 5.5z" /></S>),

  /* ---- network: mount surface plus the radiation pattern ---- */
  ap_ceiling: (<S>{surface('M2 4h20')}<ellipse cx="12" cy="7" rx="5.5" ry="2" />
    <path d="M6.5 12.5a7.5 7.5 0 0111 0" opacity=".7" />
    <path d="M3.5 16.5a11.5 11.5 0 0117 0" opacity=".45" /></S>),
  ap_wall: (<S>{surface('M4 2v20')}<rect x="5.5" y="8" width="4" height="8" rx="1" />
    <path d="M12.5 8.5a6.5 6.5 0 010 7" opacity=".7" />
    <path d="M16.5 5.5a11 11 0 010 13" opacity=".45" /></S>),

  /* ---- climate: heat and air read as the plume, not the box ---- */
  heater_panel: (<S>{surface('M2 21h20')}<rect x="3.5" y="12" width="17" height="7" rx="1.2" />
    <path d="M8 12v7M12 12v7M16 12v7" opacity=".5" />
    <path d="M8 9.5c0-2 1.6-2 1.6-4M12 9.5c0-2 1.6-2 1.6-4M16 9.5c0-2 1.6-2 1.6-4" opacity=".75" /></S>),
  heater_radiant: (<S>{surface('M2 4h20')}<rect x="5" y="5" width="14" height="3" rx="1.2" />
    <path d="M8 11c1.4 1.2 1.4 2.4 0 3.6s-1.4 2.4 0 3.6" opacity=".75" />
    <path d="M12 11c1.4 1.2 1.4 2.4 0 3.6s-1.4 2.4 0 3.6" opacity=".75" />
    <path d="M16 11c1.4 1.2 1.4 2.4 0 3.6s-1.4 2.4 0 3.6" opacity=".75" /></S>),
  vent_ceiling: (<S>{surface('M2 3.5h20')}<rect x="4.5" y="4.5" width="15" height="5.5" rx="1" />
    <path d="M8 4.5l-2 5.5M12 4.5l-2 5.5M16 4.5l-2 5.5" opacity=".55" />
    <path d="M8 13v6M8 19l-1.8-2M8 19l1.8-2" opacity=".8" />
    <path d="M16 13v6M16 19l-1.8-2M16 19l1.8-2" opacity=".8" /></S>),
};

/**
 * Overlay toggles. Each one draws what the overlay actually puts on the model —
 * a heat gradient, a dimension string, a beam cone, a wavefront — so the rail
 * previews its own result instead of naming it.
 */
export const OVERLAY_ICON: Record<string, ReactElement> = {
  thermal: (<S size={15}><path d="M10 13.5V5a2 2 0 014 0v8.5a4.5 4.5 0 11-4 0z" />
    <path d="M12 8.5v6.2" opacity=".6" /></S>),
  dims: (<S size={15}><path d="M3 8v8M21 8v8" /><path d="M3 12h18" />
    <path d="M6.5 9.6L4 12l2.5 2.4M17.5 9.6L20 12l-2.5 2.4" /></S>),
  light: (<S size={15}><path d="M9 16.5a5.5 5.5 0 116 0v2H9z" /><path d="M10 21h4" /></S>),
  audio: (<S size={15}><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
    <path d="M15.5 9.4a4 4 0 010 5.2" opacity=".75" />
    <path d="M18.4 6.8a8 8 0 010 10.4" opacity=".45" /></S>),
  air: (<S size={15}><path d="M3 8.5h10a2.6 2.6 0 10-2.6-2.6" />
    <path d="M3 12.5h14a2.8 2.8 0 11-2.8 2.8" opacity=".8" />
    <path d="M3 16.5h6" opacity=".55" /></S>),
  hvac: (<S size={15}><path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2L3.8 16.8" />
    <path d="M9.4 4.2L12 6.4l2.6-2.2M9.4 19.8L12 17.6l2.6 2.2" opacity=".7" /></S>),
  wifi: (<S size={15}><circle cx="12" cy="18" r="1.5" />
    <path d="M8.4 14.6a5 5 0 017.2 0" opacity=".8" />
    <path d="M5 11.2a10 10 0 0114 0" opacity=".55" />
    <path d="M2 7.8a14.5 14.5 0 0120 0" opacity=".35" /></S>),
  elec: (<S size={15}><path d="M13.5 2.5L5 13.5h5.5L9.5 21.5 19 10h-5.8z" /></S>),
  plan: (<S size={15}><rect x="3" y="3.5" width="18" height="17" rx="1.4" strokeDasharray="3 2.2" />
    <path d="M3 11h8M11 3.5v17" strokeDasharray="3 2.2" opacity=".7" /></S>),
  /** the stacked-sheets mark everyone already reads as "layers" */
  layers: (<S size={17}><path d="M12 2.6L2.6 7.3 12 12l9.4-4.7z" />
    <path d="M2.6 12.2L12 16.9l9.4-4.7" opacity=".78" />
    <path d="M2.6 16.9L12 21.6l9.4-4.7" opacity=".5" /></S>),
  openAll: (<S size={15}><path d="M4 20V6.5L14 4v16z" /><path d="M14 20h5.5V7.5L14 6" opacity=".5" />
    <path d="M11.5 12h.01" /><path d="M18 12l3-3m0 0h-2.4M21 9v2.4" opacity=".8" /></S>),
  closeAll: (<S size={15}><path d="M6 20V6.5L16 4v16z" /><path d="M16 20h3.5V7.5L16 6" opacity=".5" />
    <path d="M13.5 12h.01" /><path d="M2 9l3 3-3 3" opacity=".8" /></S>),
};

/** Ambience presets, sharing the same drawing language as the view toggles. */
export const AMB_ICONS: ReactElement[] = [
  // dawn — sun breaking the horizon
  (<S key="a" size={15}>{surface('M2 17h20')}<path d="M7 17a5 5 0 0110 0" />
    <path d="M12 5v2.5M5.4 8.4l1.8 1.8M18.6 8.4l-1.8 1.8" opacity=".7" /></S>),
  // midday — full sun
  (<S key="b" size={15}><circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" /></S>),
  // dusk — sun dropping below the horizon
  (<S key="c" size={15}>{surface('M2 17h20')}<path d="M7 17a5 5 0 0110 0" />
    <path d="M12 10.5V8M9 12l-2-2M15 12l2-2" opacity=".7" /></S>),
  // dining — a plate between a fork and a knife
  (<S key="d" size={15}><circle cx="12" cy="12" r="4.6" /><circle cx="12" cy="12" r="2" opacity=".45" />
    <path d="M3.5 3.5v4a1.6 1.6 0 003.2 0v-4M5.1 9.1V20.5" opacity=".8" />
    <path d="M19.4 3.5c1.4 1.4 1.4 5.6 0 7h-1.3V20.5" opacity=".8" /></S>),
  // cinema — a screen with a play mark
  (<S key="e" size={15}><rect x="2.5" y="5" width="19" height="12" rx="1.5" />
    <path d="M10 9.4l4.6 2.6L10 14.6z" /></S>),
  // night — moon and a star
  (<S key="f" size={15}><path d="M17.5 14.2A6.6 6.6 0 019.8 6.5a6.6 6.6 0 107.7 7.7z" />
    <path d="M17.5 4.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" opacity=".7" /></S>),
];
