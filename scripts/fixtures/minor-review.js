export const reviewFixture = {
  enabled: true,
  skin: "frost",
  text_size: "regular",
  trips: [{
    id: "sample-trip", name: "Alaska adventure", destination: "Anchorage & Denali",
    start_date: "2027-08-12", end_date: "2027-08-20",
    itinerary: [
      { id: "one", item_date: "2027-08-12", start_time: "09:30", title: "Train to Denali", location: "Anchorage Depot", status: "confirmed" },
      { id: "two", item_date: "2027-08-12", start_time: "16:00", title: "Check in at the lodge", location: "Denali National Park", status: "confirmed" },
      { id: "three", item_date: "2027-08-13", start_time: "08:00", title: "Morning wildlife walk", location: "Meet in the lobby", status: "planned" },
    ],
    day_pack: [
      { id: "day-water", item_date: null, item: "Water bottle", is_packed: true },
      { id: "day-snack", item_date: "2027-08-12", item: "Train snacks", is_packed: false },
      { id: "day-rain", item_date: "2027-08-13", item: "Rain jacket", is_packed: false },
    ],
    packing: [
      { id: "rain", category: "Clothing", item: "Rain jacket", quantity: 1, is_packed: true },
      { id: "shirt", category: "Clothing", item: "Long-sleeve shirts", quantity: 3, is_packed: false },
      { id: "shoe", category: "Footwear", item: "Hiking shoes", quantity: 1, is_packed: false },
      { id: "water", category: "Day pack", item: "Water bottle", quantity: 1, is_packed: true },
    ],
  }],
};
export const parentFixture = {
  children: [{ id: "sample-child", name: "Young traveler", user_id: "sample-account", access_level: "secondary" }],
  passkeyReady: true, views: [],
};
