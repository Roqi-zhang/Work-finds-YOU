// Code mirror of /design-tokens.json — keep both in sync.
export const tokens = {
  color: {
    light: { paper: "#F1F1F1", ink: "#404040", inkStrong: "#0A0A0A", line: "#D4D4D4", lineSoft: "rgba(64,64,64,0.08)" },
    dark: { paper: "#0E0E0E", ink: "#C8C8C8", inkStrong: "#F5F5F5", line: "#2A2A2A", lineSoft: "rgba(200,200,200,0.08)" },
  },
  font: { hand: '"Patrick Hand", "ZCOOL KuaiLe", cursive', size: { caption: 10, body: 14, columnTitle: 30 }, lineHeight: 1.7 },
  border: { hairline: "0.5px" },
  motion: { duration: "600ms", ease: "cubic-bezier(.2,.7,.2,1)" },
  space: { pageTop: 40, pageX: 56, pageBottom: 96 },
} as const;
