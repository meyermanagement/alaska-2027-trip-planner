/**
 * Supporting capabilities on the public homepage, not a complete inventory.
 * The six scenes already cover planning, packing, reminders, daily assistance,
 * changes, money and tips. Keep this section complementary and scannable.
 * This is separate from the interactive claims in lib/welcome/alyAbilities.js.
 *
 * Product grounding: traveler limits (lib/travelers/limits.js), pet and house
 * tasks (lib/pets, lib/tasks/house.js), document extraction (lib/documents),
 * shared family access, bucket-list planning (lib/someday), and private trip
 * reviews (lib/reviews).
 */
export const ALY_INDEX = [
  {
    key: "travelers",
    heading: "Your travelers",
    items: [
      {
        title: "Individual needs",
        body: "Keep allergies, accessibility needs, and personal limits in the plan.",
      },
      {
        title: "Pets and home",
        body: "Plan for pets coming along and care needed back home.",
      },
    ],
  },
  {
    key: "details",
    heading: "Your travel file",
    items: [
      {
        title: "Travel documents",
        body: "Keep important documents and expiration dates together.",
      },
      {
        title: "Shared trip access",
        body: "Give your family one place to find the plans.",
      },
    ],
  },
  {
    key: "memories",
    heading: "Beyond this trip",
    items: [
      {
        title: "Your bucket list",
        body: "Keep the places you want to go, ready to turn into a trip.",
      },
      {
        title: "Private trip reviews",
        body: "Remember what worked and what you would do differently.",
      },
    ],
  },
];
