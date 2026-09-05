/**
 * The menu asking the trips board to show one of its three groups.
 *
 * Trip Builder, Planned Trips and Trip Log are one screen with a different group
 * showing. Pressing them in the menu used to go through the router, which on that
 * page changes a query and nothing else: no segment unmounts, so no skeleton is
 * drawn, and the menu closed on a press whose only visible effect was a group
 * swapping quietly underneath it. Often the address already said what the row
 * asked for -- the board's own tab strip writes it -- and then it was not even a
 * navigation.
 *
 * So while the board is on screen the menu speaks to it directly, and the board
 * answers the way a screen answers: skeleton first, then the group. Off that page
 * the rows stay ordinary links and the route's loading.js does the same job. The
 * tab strip above the cards never sends this, so toggling groups there stays
 * instant -- which is the whole point of a toggle.
 *
 * Its own file so that the menu, which is on every screen, does not have to import
 * the board to know the name of the message.
 */
export const TRIPS_VIEW_EVENT = "alyeska:trips-view";

/** The three groups, in the order the tab strip shows them. */
export const TRIP_VIEWS = ["upcoming", "drafts", "past"];
