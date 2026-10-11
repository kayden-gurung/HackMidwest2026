import type { ChatMessage } from "../types";

// MOCK DATA: example conversation from the Figma design.

export const mockConversations: Record<string, ChatMessage[]> = {
  puglia: [
    {
      id: "m1",
      role: "user",
      text: "I want a relaxing beach trip somewhere in Europe with great food and a little hiking. Around $3,200 for two, including flights from NYC.",
    },
    {
      id: "m2",
      role: "assistant",
      text: "Puglia feels just right. You’ll get Adriatic coves, incredible cucina povera, and coastal trails—without the Amalfi crowds or prices.",
      recommendation: {
        destination: "Puglia, Italy",
        headline: "A little coast. A lot of calm.",
        description: "Adriatic coves, incredible food, and room to slow down.",
        budgetUsd: 3200,
        stops: ["Bari", "Polignano a Mare", "Alberobello"],
        imageUrl:
          "https://images.unsplash.com/photo-1770493967117-6ae3927c0d05?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=1400",
        imageAlt: "Clifftop homes along the turquoise coast of Polignano a Mare, Puglia",
        matchPercent: 94,
        estimatedTotalUsd: 3080,
        flightPricePerPersonUsd: 648,
        pace: "Relaxed",
      },
      flight: {
        departTime: "6:10 PM",
        departAirport: "JFK",
        arriveTime: "12:35 PM",
        arriveAirport: "BRI",
        arriveDayOffset: 1,
        duration: "10h 25m",
        stops: 1,
        pricePerPersonUsd: 648,
        withinBudget: true,
      },
      suggestions: ["Swap the boat tour", "Show hotel options", "Make it more relaxing"],
    },
  ],
};

export const mockReply =
  "This is a mock reply. Set VITE_USE_MOCKS=false in frontend/.env to get real answers from the backend.";
