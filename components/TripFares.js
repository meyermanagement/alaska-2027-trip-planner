import Deals from "@/components/Deals";
import ForwardFares from "@/components/ForwardFares";

/**
 * The fares that turned out to be about this trip, on this trip.
 *
 * A forwarded alert is matched against the whole household, so a fare to Lisbon
 * lands on both the bucket list and the Portugal trip it belongs to. The bucket
 * list is the wrong place to act on it: the dates, the party and the budget the
 * fare is judged against all live on the trip, and so does the person looking at
 * the trip in the week they mean to buy.
 *
 * The forwarding instructions come with it, and only while there is still a seat
 * to buy. Once every flight on a trip is confirmed the setup panel is somebody
 * else's job, not this trip's, so it goes away and the fares stay.
 */
export default function TripFares({ trip, deals = [], address, unbooked }) {
  const mine = (deals || []).filter(
    (deal) => deal.verdict?.trip?.id === trip.id,
  );
  if (!mine.length && !unbooked) return null;

  return (
    <section className="mt-8">
      <Deals deals={mine} trips={[trip]} tripId={trip.id} />
      {unbooked ? <ForwardFares address={address} trip={trip} /> : null}
    </section>
  );
}
