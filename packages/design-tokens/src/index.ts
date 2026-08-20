export const colors = {
  background: "#FAFAFA",
  text: "#000000",
  textSecondary: "rgba(0, 0, 0, 0.5)",
  divider: "#D9D9D9",
  control: "rgba(118, 118, 128, 0.12)",
  controlSelected: "#FFFFFF",
  overlay: "rgba(255, 255, 255, 0.9)",
  accent: "#FD5C63",
  success: "#34C759",
  warning: "rgba(255, 204, 0, 0.9)",
  navigation: "rgba(250, 250, 250, 0.92)",
  navigationFallback: "rgba(250, 250, 250, 0.88)",
  navigationSelected: "#EDEDED",
  navigationIcon: "#1A1A1A",
  opportunityAvailable: "#34C759",
  opportunityNeutral: "#D9D9D9",
  surfaceSubtle: "rgba(0, 0, 0, 0.04)",
  surfaceSelected: "rgba(0, 0, 0, 0.08)",
  availabilityNotice: "#F4F1FA",
  disabledAction: "#8E8E93",
  albumStart: "#D1BFEB",
  albumEnd: "#AD94CC",
} as const;

export const spacing = {
  hairline: 2,
  micro: 4,
  compact: 8,
  medium: 12,
  page: 16,
} as const;

export const radii = {
  wishlistImage: 8,
  copyImage: 12,
  pill: 18,
  capsule: 999,
  detailCard: 16,
} as const;

export const navigation = {
  actionSize: 54,
  iconSize: 28,
  surfaceHeight: 54,
} as const;

export const typography = {
  screenTitle: { fontSize: 32, lineHeight: 38, fontWeight: "700" },
  itemTitle: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  metadata: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  tabLabel: { fontSize: 10, lineHeight: 12, fontWeight: "600" },
  sectionTitle: { fontSize: 18, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
} as const;
