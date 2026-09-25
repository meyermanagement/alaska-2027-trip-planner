// Made-up emails only. Padded with footer text so length resembles a real forward.
const footer = "\n\n" + ("You are receiving this email because you made a booking. Manage your preferences. Privacy policy. Terms of use. Earn miles with our partners. Download the app for the fastest check-in. ").repeat(40);
export const EMAILS = [
  { id: "flight-3leg", text: `From: reservations@skyharbor-air.example
Subject: Your trip confirmation - Record locator QX7T2M
Thank you for booking with SkyHarbor Air. Confirmation code: QX7T2M
Passengers: NORA CALDERWOOD, THEO CALDERWOOD, IVY CALDERWOOD
Flight 1: SH 214 Sat, Apr 10, 2027 St. Louis (STL) 07:05 -> Chicago O'Hare (ORD) 08:20
Flight 2: SH 88 Sat, Apr 10, 2027 Chicago O'Hare (ORD) 17:40 -> Lisbon (LIS) 08:55 +1 day
Flight 3: SH 89 Mon, Apr 19, 2027 Lisbon (LIS) 11:30 -> Chicago O'Hare (ORD) 14:25
Seats: SH 88 - 32A, 32B, 32C. Fare: Economy Classic, changes permitted for a fee.` + footer,
    truth: { kind: "booking", names: 3, items: [
      { category: "flight", date: "2027-04-10", time: "07:05", conf: "QX7T2M", has: /214/ },
      { category: "flight", date: "2027-04-10", time: "17:40", conf: "QX7T2M", has: /88/ },
      { category: "flight", date: "2027-04-19", time: "11:30", conf: "QX7T2M", has: /89/ } ] } },
  { id: "hotel-pt", text: `De: reservas@casadotejo.example
Assunto: Confirmação da reserva n.º CT-55190
Olá Nora Calderwood, a sua reserva está confirmada.
Hotel Casa do Tejo, Rua das Flores 28, Lisboa
Check-in: 11 de abril de 2027 (a partir das 15:00)  Check-out: 19 de abril de 2027 (até às 11:00)
Quarto: Suite Família com vista rio, 8 noites. Pequeno-almoço incluído. Traslado do aeroporto disponível mediante pedido.` + footer,
    truth: { kind: "booking", items: [ { category: "lodging", date: "2027-04-11", end: "2027-04-19", conf: "CT-55190", has: /tejo/i } ] } },
  { id: "rental-oneway", text: `From: noreply@coastlinerent.example
Subject: Rental agreement RA-3318420
Driver: Daniel Okafor
Pick-up: Seattle-Tacoma Intl (SEA), Aug 3, 2027 at 10:30
Return: Portland Intl (PDX), Aug 9, 2027 by 18:00. One-way fee $95.
Vehicle: Midsize SUV or similar. Confirmation: RA-3318420` + footer,
    truth: { kind: "booking", items: [ { category: "transport", date: "2027-08-03", end: "2027-08-09", time: "10:30", conf: "RA-3318420", notes: /pdx|portland/i } ] } },
  { id: "insurance", text: `From: policies@harborline.example
Subject: Your Harborline policy HTP-7730-11928
Dear Nora, thank you for purchasing Voyager Plus.
Insured travelers: Nora Calderwood, Theo Calderwood, Ivy Calderwood
Coverage dates: April 9, 2027 to April 20, 2027. Total premium: $318.40
Includes trip cancellation, trip interruption, emergency medical ($50,000), evacuation ($250,000) and baggage.
24/7 assistance: +1 (312) 555-0187` + footer,
    truth: { kind: "insurance", ins: { policy: "HTP-7730-11928", start: "2027-04-09", end: "2027-04-20", premium: 318.4, medical: 50000, evac: 250000, covers: ["baggage","cancellation","evacuation","interruption","medical"] } } },
  { id: "marketing", text: `From: deals@skyharbor-air.example
Subject: Spring into savings — Lisbon from $489 round trip!
Book by March 1 for travel April–June. Fares from St. Louis (STL) to Lisbon from $489, Chicago from $412. Limited seats. Use code SPRING27.` + footer,
    truth: { kind: ["fare_alert", "not_booking"] } },
];
