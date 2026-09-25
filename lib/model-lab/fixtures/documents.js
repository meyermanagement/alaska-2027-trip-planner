// Answer keys for the made-up documents in doc-images.js.
export const DOCS = [
  { id: "passport", kind: "identity", truth: { doc_type: "passport", number: "58B204771", issue_date: "2019-06-02", expiration_date: "2029-06-01", issuing_authority: /united states/i, full_name: /nora jean calderwood|calderwood,? nora jean/i } },
  { id: "license", kind: "identity", truth: { doc_type: "drivers_license", number: "T492118305", issue_date: "2022-08-19", expiration_date: "2028-10-04", issuing_authority: /missouri/i, full_name: /daniel reid okafor|okafor,? daniel reid/i } },
  { id: "trip-policy", kind: "policy", truth: { provider: /harborline/i, plan_name: /voyager plus/i, policy_number: "HTP-7730-11928", coverage_start: "2027-04-09", coverage_end: "2027-04-20", kind: "trip", emergency_phone: /312.*555.*0187/, covers: ["baggage", "cancellation", "evacuation", "interruption", "medical"], premium: 318.4, deductible: 250, medical_limit: 50000, evacuation_limit: 250000, insured_names: 3 } },
  { id: "annual-plan", kind: "policy", truth: { provider: /northstar/i, policy_number: "NS-A-440912", coverage_start: "2027-01-15", coverage_end: "2028-01-14", kind: "annual", covers: ["delay", "evacuation", "medical"], premium: 489, deductible: 0, medical_limit: 100000, evacuation_limit: 500000, insured_names: 2 } },
  { id: "card-benefits", kind: "policy", truth: { provider: /meridian voyager/i, coverage_start: null, coverage_end: null, kind: "card", covers: ["cancellation", "delay", "evacuation", "interruption", "rental_car"], premium: null, evacuation_limit: 100000, medical_limit: null } },
];
