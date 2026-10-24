// Fonts available for subtitles. Add more from https://www.remotion.dev/docs/google-fonts
import { loadFont as montserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as poppins } from "@remotion/google-fonts/Poppins";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as bebas } from "@remotion/google-fonts/BebasNeue";

const opciones = { subsets: ["latin", "latin-ext"] as ("latin" | "latin-ext")[] };
export const FUENTES: Record<string, () => string> = {
  Montserrat: () => montserrat("normal", { weights: ["800"], ...opciones }).fontFamily,
  Poppins: () => poppins("normal", { weights: ["700"], ...opciones }).fontFamily,
  Inter: () => inter("normal", { weights: ["800"], ...opciones }).fontFamily,
  Anton: () => anton("normal", { weights: ["400"], ...opciones }).fontFamily,
  "Bebas Neue": () => bebas("normal", { weights: ["400"], ...opciones }).fontFamily,
};
