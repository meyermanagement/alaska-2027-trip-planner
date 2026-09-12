import CompassLoader from "@/components/CompassLoader";

export default function Loading() {
  return (
    <main className="screen flex min-h-[70vh] items-center justify-center px-5">
      <CompassLoader label="Aly is coming to say hi" />
    </main>
  );
}
