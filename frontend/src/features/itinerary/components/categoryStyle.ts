import type { IconName } from "../../../components/ui";
import type { BudgetCategory } from "../types";

/** How each budget category looks in lists and on the map. Full class names so Tailwind can see them. */
export const categoryStyle: Record<BudgetCategory, { icon: IconName; chip: string; markerColor: string }> = {
  Flights: { icon: "plane", chip: "bg-blue/20 text-ink", markerColor: "#3f879c" },
  Driving: { icon: "car", chip: "bg-blue/20 text-ink", markerColor: "#3f879c" },
  Stays: { icon: "hotel", chip: "bg-mint text-sea", markerColor: "#126e6b" },
  Food: { icon: "utensils", chip: "bg-peach text-coral", markerColor: "#c95b44" },
  Activities: { icon: "sun", chip: "bg-sun/30 text-ink", markerColor: "#9a7412" },
};
