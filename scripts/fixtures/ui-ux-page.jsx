"use client";
// Synthetic fixture. Copy to app/login/qa-ui-ux/page.js for local QA only;
// remove the route before building or deploying production.
import { Suspense, useState } from "react";
import NavTabs from "@/components/NavTabs";
import NavigationPreference from "@/components/NavigationPreference";
import { PersonForm } from "@/app/family/People";
import NextStepsChecklist from "@/components/NextStepsChecklist";
import TripView from "@/components/TripView";
import TripBoard from "@/app/trips/TripBoard";
import WalletTabs from "@/app/wallet/WalletTabs";
import RewardsBoard from "@/app/wallet/RewardsBoard";
import WalletAddButton from "@/components/WalletAddButton";
import HeaderUpdates from "@/components/HeaderUpdates";
const trip = {
  id: "qa-trip",
  slug: "qa-trip",
  name: "A week by the coast",
  destination: "Maui, Hawaii",
  start_date: "2027-03-10",
  end_date: "2027-03-17",
  status: "upcoming",
  emoji: "🌴",
  trip_type: "vacation",
};
const person = { id: "qa-person", name: "Jamie", email: "jamie@example.com" };
function Fixture() {
  const [mode, setMode] = useState("family");
  const [fail, setFail] = useState(false);
  const [saved, setSaved] = useState("");
  const [secondary, setSecondary] = useState(false);
  return (
    <>
      <NavTabs
        level={secondary ? "secondary" : "primary"}
        showAsk
        today="2026-09-18"
      />
      <main className="screen px-5 pb-16 pt-7">
        <div data-qa-controls className="mb-6 rounded-xl border p-3">
          <p className="text-sm">
            Synthetic usability preview. No real account or saves.
          </p>
          <label>
            Preview screen{" "}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="input"
            >
              {[
                "family",
                "setup",
                "trip",
                "trips",
                "wallet",
                "navigation",
                "alerts",
              ].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={secondary}
              onChange={(e) => setSecondary(e.target.checked)}
            />{" "}
            Secondary traveler
          </label>
        </div>
        {mode === "family" && (
          <>
            <h1>Family & pets</h1>
            <p>Jamie · Details used across trips</p>
            <label>
              <input
                type="checkbox"
                checked={fail}
                onChange={(e) => setFail(e.target.checked)}
              />{" "}
              Simulate save failure
            </label>
            <PersonForm
              person={person}
              onCancel={() => setSaved("Canceled")}
              onSave={async (values) => {
                await new Promise((r) => setTimeout(r, 250));
                if (fail) return "Could not save. Your changes are still here.";
                setSaved(`Saved ${values.name}`);
              }}
            />
            <p role="status">{saved}</p>
            <a href="/login">Leave preview</a>
          </>
        )}
        {mode === "setup" && (
          <NextStepsChecklist
            onContinue={() => setSaved("Trip builder opened")}
            linked
            done={["install"]}
          />
        )}
        {mode === "trip" && (
          <TripView
            trip={trip}
            initialItinerary={[]}
            initialPacking={[]}
            initialTasks={[]}
            initialNotes={[]}
            travelers={[]}
            people={[]}
            today="2026-09-18"
            level={secondary ? "secondary" : "primary"}
            everLooked
            lastLookedAt="2099-01-01T12:00:00Z"
          />
        )}
        {mode === "trips" && (
          <TripBoard
            upcoming={[]}
            drafts={[]}
            past={[]}
            today="2026-09-18"
            canRemove={!secondary}
          />
        )}
        {mode === "wallet" && (
          <>
            <div className="flex flex-wrap justify-between gap-3">
              <h1>Wallet</h1>
              <WalletAddButton />
            </div>
            <WalletTabs
              cards={
                <RewardsBoard
                  showAddAction={false}
                  familyId="qa-family"
                  travelers={[person]}
                  programs={[]}
                />
              }
              history={<p>No saved history yet.</p>}
            />
          </>
        )}
        {mode === "navigation" && <NavigationPreference />}
        {mode === "alerts" && (
          <HeaderUpdates
            today="2026-09-18"
            inboxCount={2}
            tips={[
              {
                id: "qa-urgent",
                title: "Deadline tomorrow",
                body: "An urgent update stays visible.",
                act_by: "2026-09-19",
                urgency: "soon",
                scope: "wallet",
              },
              {
                id: "qa-later",
                title: "For your next trip",
                body: "A lower-priority update waits in the summary.",
                act_by: "2026-09-25",
                urgency: "soon",
                scope: "wallet",
              },
            ]}
          />
        )}
        {mode === "setup" && <p role="status">{saved}</p>}
      </main>
    </>
  );
}
export default function Page() {
  return (
    <Suspense>
      <Fixture />
    </Suspense>
  );
}
