import { Palette } from "lucide-react";
import { ThemeChoice } from "../../theme/ThemeChoice";

export function AppearanceSettings() {
  return (
    <section className="settings-card" aria-labelledby="appearance-heading">
      <div className="section-heading">
        <h2 id="appearance-heading">Appearance</h2>
        <Palette aria-hidden="true" />
      </div>
      <ThemeChoice />
    </section>
  );
}
