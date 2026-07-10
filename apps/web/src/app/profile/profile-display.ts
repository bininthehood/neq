import type { SavedItem } from "@/lib/types";

export type ProfilePersonaDisplay = {
  id: string;
  name: string;
  favorites: string[];
};

export function buildProfilePersonasForDisplay({
  personas,
  tasteItems,
  savedItems,
}: {
  personas: ProfilePersonaDisplay[];
  tasteItems: string[];
  savedItems: SavedItem[];
}): ProfilePersonaDisplay[] {
  const firstId = personas[0]?.id;
  return personas.map((persona) => {
    const isFirst = persona.id === firstId;
    if (!isFirst || persona.favorites.length > 0) return persona;
    if (tasteItems.length > 0) {
      return { ...persona, favorites: tasteItems.slice(0, 5) };
    }
    if (savedItems.length > 0) {
      return {
        ...persona,
        favorites: savedItems.slice(0, 5).map((item) => item.recommendation.title),
      };
    }
    return persona;
  });
}
