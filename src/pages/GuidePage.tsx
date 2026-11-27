import { useEffect } from "react";
import { GuideGallery } from "../components/public/GuideGallery";

export function GuidePage() {
  useEffect(() => {
    document.title = "Field Guide | CaneGuard";
  }, []);

  return (
    <div className="pub-ambient">
      <div className="pub-section">
        <h1>Know it before you report it</h1>
        <p>
          Reference photos, symptoms, prevention and management for the five
          conditions CaneGuard staff watch for.
        </p>
        <GuideGallery />
      </div>
    </div>
  );
}
