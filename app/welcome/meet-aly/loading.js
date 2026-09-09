import CompassLoader from "@/components/CompassLoader";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-5">
      <CompassLoader label="Aly is coming to say hi" />
    </main>
  );
}
