module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./index.html"],
  theme: {
    extend: {
      keyframes: {
        fadeIn:   { from: { opacity: "0" }, to: { opacity: "1" } },
        fadeOut:  { from: { opacity: "1" }, to: { opacity: "0" } },
        scaleIn:  { from: { opacity: "0", transform: "scale(0.95)" }, to: { opacity: "1", transform: "scale(1)" } },
        scaleOut: { from: { opacity: "1", transform: "scale(1)" }, to: { opacity: "0", transform: "scale(0.95)" } },
        slideUp:  { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "fade-in":   "fadeIn 0.15s ease-out both",
        "fade-out":  "fadeOut 0.18s ease-in both",
        "scale-in":  "scaleIn 0.2s ease-out both",
        "scale-out": "scaleOut 0.18s ease-in both",
        "slide-up":  "slideUp 0.18s ease-out both",
      },
    },
  },
  plugins: [],
}
